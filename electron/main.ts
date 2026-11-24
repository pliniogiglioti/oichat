// Processo principal do Oi Chat para Windows.
// Janela + bandeja + IPC seguro. A escuta (Vosk/WebAssembly) roda no renderer, que continua
// ativo com a janela oculta (backgroundThrottling desligado).
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  IPC,
  type ApplySettingsResult,
  type DesktopCommand,
  type DesktopEvent,
  type DesktopSettings,
} from '../src/shared/desktopApi';
import type { AssistantState } from '../src/types';
import { chatGPTAppInstalled, openChatGPT } from './services/chatGPT';
import { ChatGPTView } from './services/chatGPTView';
import { loadStorage, storage } from './services/storage';

const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const ICONS = join(ROOT, 'resources', 'icons');
const DEV_URL = process.argv.includes('--dev') && !app.isPackaged ? 'http://localhost:5173/' : null;
const APP_ORIGIN = 'app://oichat';
const START_HIDDEN = process.argv.includes('--hidden');

// Ganchos só para testes automatizados (não usados no uso normal)
if (process.env.OICHAT_USER_DATA) app.setPath('userData', process.env.OICHAT_USER_DATA);
export const DRY_OPEN = process.env.OICHAT_DRY_OPEN === '1';

// Esquema próprio para servir o build: file:// não permite fetch do modelo de voz nem IndexedDB estável.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let trayHintShown = false;
let assistantState: AssistantState = 'disabled';
let settings: DesktopSettings = {
  autoStart: false,
  runInBackground: true,
  globalShortcut: 'Ctrl+Alt+Space',
  preferChatGPTApp: true,
  chatGPTMode: 'embedded',
  autoVoice: true,
  greeting: 'Oi, Chat!',
};

const chatView = new ChatGPTView(
  () => win,
  (open) => {
    emit({ type: 'chatgpt-view', open });
    updateTray();
  },
  (voice) => emit({ type: 'voice', voice }),
);

chatView.setLoginListener((loggedIn) => emit({ type: 'chatgpt-login', loggedIn }));
// Conversa acabou (voz encerrada ou "Tchau, Chat" transcrito): fecha e o renderer volta a ouvir.
chatView.setEndListener(() => chatView.close());

function emit(ev: DesktopEvent) {
  win?.webContents.send(IPC.event, ev);
}

// ---------- instância única ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

app.setAppUserModelId('com.oichat.app');

function isTrusted(url: string | undefined) {
  if (!url) return false;
  return url.startsWith(`${APP_ORIGIN}/`) || (!!DEV_URL && url.startsWith(DEV_URL));
}

function trusted(e: IpcMainInvokeEvent | IpcMainEvent) {
  if (!isTrusted(e.senderFrame?.url)) throw new Error('Origem IPC não autorizada');
}

function send(cmd: DesktopCommand) {
  win?.webContents.send(IPC.command, cmd);
}

// ---------- janela ----------
// Painel da bandeja: sem moldura, fora da barra de tarefas, ancorado acima do ícone da bandeja.
// Tamanho do painel igual ao print de referência do usuário (~345 × 590).
const PANEL_WIDTH = 345;
const PANEL_HEIGHT = 590;
const PANEL_MARGIN = 12;
/** Distância da borda direita da tela (ajustada no olho com o usuário). */
const PANEL_RIGHT_OFFSET = 30;
let lastBlurHide = 0;

function positionPanel() {
  if (!win) return;
  const anchor = tray?.getBounds();
  const display = anchor && anchor.width ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay();
  const wa = display.workArea;
  const height = Math.min(PANEL_HEIGHT, wa.height - PANEL_MARGIN * 2);
  // Sempre encostado no canto inferior direito, como os painéis do Windows (volume, Wi-Fi).
  // O ícone da bandeja só escolhe em qual monitor aparecer.
  const x = wa.x + wa.width - PANEL_WIDTH - PANEL_RIGHT_OFFSET;
  const y = wa.y + wa.height - height - PANEL_MARGIN;
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: PANEL_WIDTH, height });
  chatView.layout();
}

function hidePanel() {
  win?.hide();
}

function createWindow() {
  win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false, // sem barra de título nem minimizar/maximizar/fechar
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // não aparece na barra de tarefas
    alwaysOnTop: true,
    roundedCorners: true,
    title: 'Oi Chat',
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    icon: join(ICONS, 'app.ico'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // continua ouvindo com a janela oculta
      spellcheck: false,
    },
  });

  win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);

  win.once('ready-to-show', () => {
    if (!START_HIDDEN) showWindow();
  });

  // Como um painel da bandeja: clicar fora esconde — mas só enquanto está apenas ouvindo
  // (nunca no meio de uma conversa nem durante a configuração inicial).
  win.on('blur', () => {
    if (assistantState === 'listening' && !chatView.isOpen) {
      lastBlurHide = Date.now();
      hidePanel();
    }
  });

  // Links externos vão para o navegador padrão; nada abre dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrusted(url)) e.preventDefault();
  });

  // Alt+F4 = esconder na bandeja (quando "segundo plano" está ligado)
  win.on('close', (e) => {
    if (quitting || !settings.runInBackground) return;
    e.preventDefault();
    hidePanel();
    if (!trayHintShown && tray) {
      trayHintShown = true;
      tray.displayBalloon({
        iconType: 'info',
        title: 'Oi Chat continua ativo',
        content: 'Ele segue na bandeja. Use o ícone para abrir ou sair.',
      });
    }
  });
  // Repassa ao log do processo só as linhas de diagnóstico do próprio Oi Chat.
  win.webContents.on('console-message', (e) => {
    if (e.message.startsWith('[oichat]')) console.log(new Date().toISOString().slice(11, 19), e.message);
  });
  win.on('resize', () => chatView.layout());
  win.on('closed', () => (win = null));
}

function showWindow(page?: 'settings') {
  if (!win) createWindow();
  positionPanel();
  win!.show();
  win!.focus();
  if (page === 'settings') send('settings');
}

// ---------- bandeja ----------
const stateLabel: Record<AssistantState, string> = {
  disabled: 'Pausado',
  listening: 'Ouvindo “Oi, Chat”',
  detected: 'Palavra reconhecida',
  opening: 'Abrindo ChatGPT',
  released: 'Microfone liberado (conversa)',
  error: 'Erro de integração',
};

function trayIcon(state: AssistantState) {
  const name =
    state === 'listening' ? 'listening' : state === 'error' ? 'error' : state === 'disabled' ? 'paused' : 'busy';
  return nativeImage.createFromPath(join(ICONS, `tray-${name}.png`));
}

function updateTray() {
  if (!tray) return;
  tray.setImage(trayIcon(assistantState));
  tray.setToolTip(`Oi Chat — ${stateLabel[assistantState]}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Oi Chat — ${stateLabel[assistantState]}`, enabled: false },
      { type: 'separator' },
      // Sempre ativo: sem "pausar". Só aparece o que encerra uma conversa em andamento.
      ...(assistantState === 'released'
        ? [{ label: 'Fechar ChatGPT e voltar a ouvir', click: () => send('resume') }]
        : []),
      { type: 'separator' },
      { label: 'Abrir Oi Chat', click: () => showWindow() },
      { label: 'Configurações', click: () => showWindow('settings') },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray() {
  tray = new Tray(trayIcon(assistantState));
  // Clique no ícone alterna o painel. Ignora o clique que acabou de esconder via "blur".
  tray.on('click', () => {
    if (Date.now() - lastBlurHide < 400) return;
    if (win?.isVisible()) hidePanel();
    else showWindow();
  });
  updateTray();
}

// ---------- configurações vindas do renderer ----------
function applySettings(next: DesktopSettings): ApplySettingsResult {
  settings = next;

  globalShortcut.unregisterAll();
  let shortcutOk = true;
  if (next.globalShortcut.trim()) {
    try {
      shortcutOk = globalShortcut.register(next.globalShortcut, () => send('open-chatgpt'));
    } catch {
      shortcutOk = false;
    }
  }

  let autoStartOk = true;
  let autoStartReason: string | undefined;
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: next.autoStart, args: ['--hidden'] });
  } else if (next.autoStart) {
    // Em desenvolvimento registraria o electron.exe genérico; só faz sentido no app instalado.
    autoStartOk = false;
    autoStartReason = 'Disponível no app instalado (EXE).';
  }
  return { shortcutOk, autoStartOk, autoStartReason };
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle(IPC.openChatGPT, (e, opts?: { voice?: boolean }) => {
    trusted(e);
    if (DRY_OPEN) {
      console.log(`[oichat] dry-open chatgpt (${settings.chatGPTMode})`);
      if (settings.chatGPTMode !== 'embedded') return { via: 'browser' };
      emit({ type: 'chatgpt-view', open: true });
      return { via: 'embedded' };
    }
    if (settings.chatGPTMode === 'embedded') {
      showWindow();
      // Não espera o clique no botão de voz: o resultado chega por evento.
      const voice = settings.autoVoice && opts?.voice !== false;
      void chatView.open(voice, voice && settings.greeting ? settings.greeting : null);
      return { via: 'embedded' };
    }
    return openChatGPT(settings.preferChatGPTApp);
  });
  ipcMain.handle(IPC.closeChatGPT, (e) => {
    trusted(e);
    if (DRY_OPEN) {
      console.log('[oichat] dry-close chatgpt');
      emit({ type: 'chatgpt-view', open: false });
      return;
    }
    chatView.close();
  });
  ipcMain.handle(IPC.appInstalled, (e) => {
    trusted(e);
    return chatGPTAppInstalled();
  });
  ipcMain.handle(IPC.storageGet, (e, k: string) => {
    trusted(e);
    return storage.get(String(k));
  });
  ipcMain.handle(IPC.storageSet, (e, k: string, v: string) => {
    trusted(e);
    storage.set(String(k), String(v));
  });
  ipcMain.handle(IPC.storageRemove, (e, k: string) => {
    trusted(e);
    storage.remove(String(k));
  });
  ipcMain.handle(IPC.applySettings, (e, s: DesktopSettings) => {
    trusted(e);
    return applySettings({
      autoStart: !!s?.autoStart,
      runInBackground: s?.runInBackground !== false,
      globalShortcut: String(s?.globalShortcut ?? '').slice(0, 64),
      preferChatGPTApp: s?.preferChatGPTApp !== false,
      chatGPTMode: s?.chatGPTMode === 'external' ? 'external' : 'embedded',
      autoVoice: s?.autoVoice !== false,
      greeting: String(s?.greeting ?? '').slice(0, 200),
    });
  });
  ipcMain.on(IPC.hidePanel, (e) => {
    try {
      trusted(e);
    } catch {
      return;
    }
    hidePanel();
  });
  ipcMain.on(IPC.assistantState, (e, state: AssistantState) => {
    try {
      trusted(e);
    } catch {
      return;
    }
    if (state in stateLabel) {
      assistantState = state;
      updateTray();
    }
  });
}

// ---------- protocolo app:// ----------
function registerAppProtocol() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const rel = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(/^[\\/]+/, '');
    const file = join(DIST, rel);
    if (!file.startsWith(DIST + sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------- permissões: só microfone e notificações, só para o próprio app ----------
function registerPermissions() {
  const allowed = new Set(['media', 'notifications', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const okOrigin = isTrusted(details.requestingUrl ?? wc.getURL());
    const audioOnly =
      permission !== 'media' || !('mediaTypes' in details) || (details.mediaTypes ?? []).every((t) => t === 'audio');
    cb(okOrigin && allowed.has(permission) && audioOnly);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => {
    return allowed.has(permission) && isTrusted(`${origin}/`);
  });
}

app.whenReady().then(() => {
  loadStorage();
  registerAppProtocol();
  registerPermissions();
  registerIpc();
  createTray();
  createWindow();
});

app.on('before-quit', () => {
  quitting = true;
  storage.flushNow();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
// Sem "window-all-closed → quit": o app vive na bandeja até o usuário escolher Sair.
app.on('window-all-closed', () => {
  if (!settings.runInBackground) {
    quitting = true;
    app.quit();
  }
});
