// ChatGPT oficial (chatgpt.com) dentro da janela do Oi Chat — EXPERIMENTAL.
//
// - O usuário faz login direto no site oficial; o Oi Chat não lê senhas, cookies nem tokens.
//   A sessão fica numa partição separada ("persist:chatgpt").
// - A ativação automática do modo de voz é feita clicando no botão de voz da página.
//   Isso depende do layout do site e pode parar de funcionar quando o ChatGPT mudar.
import { BrowserWindow, session, shell, WebContentsView } from 'electron';
import { CHATGPT_BAR_HEIGHT, type VoiceStatus } from '../../src/shared/desktopApi';

const CHATGPT_URL = 'https://chatgpt.com/';
const PARTITION = 'persist:chatgpt';

// Domínios onde a navegação pode acontecer dentro da janela (ChatGPT + login).
const ALLOWED_HOSTS = [
  /(^|\.)chatgpt\.com$/,
  /(^|\.)openai\.com$/,
  /(^|\.)oaistatic\.com$/,
  /(^|\.)oaiusercontent\.com$/,
  /^accounts\.google\.com$/,
  /^login\.microsoftonline\.com$/,
  /^login\.live\.com$/,
  /^appleid\.apple\.com$/,
  /(^|\.)challenges\.cloudflare\.com$/,
];

function hostAllowed(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

function isChatGPTOrigin(url: string) {
  try {
    return /(^|\.)chatgpt\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Procura e clica no botão do modo de voz. Ordem: data-testid conhecido, depois aria-label
 * ("voice mode" / "modo de voz"). Não confunde com o botão de ditado.
 */
const START_VOICE_SCRIPT = `(() => new Promise((resolve) => {
  const t0 = Date.now();
  // Sem login o ChatGPT não mostra o botão do modo de voz.
  const loggedOut = () =>
    !!document.querySelector('[data-testid="login-button"]') ||
    [...document.querySelectorAll('button')].some((b) => /entre para usar|log in to use/i.test(b.getAttribute('aria-label') || ''));
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight);
  const find = () => {
    const direct = document.querySelector('[data-testid="composer-speech-button"]');
    if (direct && !direct.disabled && visible(direct)) return direct;
    // O botão pode ser <a> ou <button> e muda de nome:
    //   sem login: <a aria-label="Iniciar modo de voz">; com login: <button aria-label="Iniciar conversa por voz">.
    // O botão de ditado ("Ditar", "Iniciar ditado") transcreve texto e deve ser ignorado.
    const els = [...document.querySelectorAll('a, button, [role=button]')];
    return els.find((b) => {
      const label = b.getAttribute('aria-label') || '';
      return !b.disabled && visible(b) && /\\bvoz\\b|voice/i.test(label) && !/dita|dictat/i.test(label);
    }) || null;
  };
  const tick = () => {
    const el = find();
    if (el) {
      el.click();
      resolve({ ok: true, how: el.getAttribute('data-testid') || el.getAttribute('aria-label') || 'botão' });
      return;
    }
    if (Date.now() - t0 > 20000) {
      if (loggedOut()) { resolve({ ok: false, login: true }); return; }
      const candidates = [...document.querySelectorAll('a[aria-label], button, [role=button]')]
        .map((b) => b.getAttribute('aria-label') || b.getAttribute('data-testid') || '')
        .filter(Boolean).slice(0, 30);
      resolve({ ok: false, candidates });
      return;
    }
    setTimeout(tick, 500);
  };
  tick();
}))()`;

/**
 * Detecta se há login olhando só a interface: sem login a página mostra o botão "Entrar"
 * e avisos "Entre para usar". Não lê nome, e-mail, cookies nem tokens.
 */
const LOGIN_CHECK_SCRIPT = `(() => {
  if (!document.querySelector('#prompt-textarea, [contenteditable="true"]')) return null;
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight);
  const els = [...document.querySelectorAll('a, button, [role=button]')].filter(visible);
  const loggedOut =
    !!document.querySelector('[data-testid="login-button"]') ||
    els.some((b) => /^(entrar|log in|fazer login)$/i.test((b.innerText || '').trim())) ||
    els.some((b) => /entre para usar|log in to use/i.test(b.getAttribute('aria-label') || ''));
  return !loggedOut;
})()`;

/**
 * Escreve uma mensagem na caixa do ChatGPT e envia (experimental).
 * Usa insertText, que é o mesmo caminho de uma digitação/colagem do usuário.
 */
const sendMessageScript = (text: string) => `(() => new Promise((resolve) => {
  const box = document.querySelector('#prompt-textarea, [contenteditable="true"]');
  if (!box) return resolve({ ok: false, reason: 'caixa de mensagem não encontrada' });
  box.focus();
  document.execCommand('insertText', false, ${JSON.stringify(text)});
  const t0 = Date.now();
  const trySend = () => {
    const btn = document.querySelector('[data-testid="send-button"]') ||
      [...document.querySelectorAll('button')].find((b) => /^(enviar|send)/i.test(b.getAttribute('aria-label') || ''));
    if (btn && !btn.disabled) { btn.click(); return resolve({ ok: true }); }
    if (Date.now() - t0 > 4000) return resolve({ ok: false, reason: 'botão enviar não encontrado' });
    setTimeout(trySend, 200);
  };
  setTimeout(trySend, 200);
}))()`;

/**
 * Estado da conversa, para saber quando ela acabou. Devolve só booleanos e contagem:
 * - startVisible: o botão "Iniciar conversa por voz" está à vista (= voz NÃO está ativa);
 * - userCount: quantas mensagens do usuário existem;
 * - lastIsBye: a última mensagem do usuário termina com "Tchau, Chat";
 * - feedbackCards: quantos cartões "Como foi essa conversa?" (fim da voz) existem.
 * Nenhum texto da conversa sai da página.
 */
const CONVERSATION_STATE_SCRIPT = `(() => {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight);
  const startVisible = [...document.querySelectorAll('a, button, [role=button]')].some((b) => {
    const l = b.getAttribute('aria-label') || '';
    return visible(b) && /\\bvoz\\b|voice/i.test(l) && !/dita|dictat/i.test(l) && !/encerr|end|parar|stop|sair|exit/i.test(l);
  });
  const users = document.querySelectorAll('[data-message-author-role="user"]');
  const last = users[users.length - 1];
  const lastText = last ? (last.innerText || '').trim() : '';
  // Vale quando a mensagem TERMINA com "tchau chat" (ex.: "Então, beleza. Tchau, chat").
  const lastIsBye = /(^|[\\s,.!?])t?chau[\\s,!.]*(chat|chá|xá)[\\s.!?]*$/i.test(lastText);
  // Cartão que o ChatGPT mostra quando a conversa por voz termina (texto da interface, não da conversa).
  const feedbackCards = [...document.querySelectorAll('div, p, span, h2, h3, h4')].filter(
    (el) => el.childElementCount === 0 && /^(como foi essa conversa\\??|how was (this|the|your) conversation\\??)$/i.test((el.textContent || '').trim()),
  ).length;
  return { startVisible, userCount: users.length, lastIsBye, feedbackCards };
})()`;

export type EndReason = 'goodbye-transcript' | 'voice-ended';

export class ChatGPTView {
  private endTimer: NodeJS.Timeout | undefined;
  private onEnded: (reason: EndReason) => void = () => {};

  setEndListener(cb: (reason: EndReason) => void) {
    this.onEnded = cb;
  }

  /** Observa a conversa depois que a voz ligou: fim da voz ou "Tchau, Chat" transcrito. */
  private startEndWatch() {
    clearInterval(this.endTimer);
    let baseline: number | null = null;
    let sawActive = false;
    let idleStreak = 0;
    let lastStart: boolean | null = null;
    let feedbackBaseline: number | null = null;
    const check = async () => {
      const wc = this.view?.webContents;
      if (!wc || wc.isDestroyed() || wc.isLoading()) return;
      try {
        const s = (await wc.executeJavaScript(CONVERSATION_STATE_SCRIPT)) as {
          startVisible: boolean;
          userCount: number;
          lastIsBye: boolean;
          feedbackCards: number;
        };
        if (baseline === null) baseline = s.userCount;
        if (feedbackBaseline === null) feedbackBaseline = s.feedbackCards;
        if (s.feedbackCards > feedbackBaseline) return this.finish('voice-ended');
        if (s.startVisible !== lastStart) {
          lastStart = s.startVisible;
          console.log(`[oichat] botão de voz ${s.startVisible ? 'visível (voz parada)' : 'oculto (voz ativa)'}`);
        }
        if (s.lastIsBye && s.userCount > baseline) return this.finish('goodbye-transcript');
        if (!s.startVisible) {
          sawActive = true;
          idleStreak = 0;
        } else if (sawActive && ++idleStreak >= 2) {
          return this.finish('voice-ended');
        }
      } catch {
        /* página navegando */
      }
    };
    this.endTimer = setInterval(check, 1000);
  }

  private finish(reason: EndReason) {
    clearInterval(this.endTimer);
    this.endTimer = undefined;
    console.log(`[oichat] conversa encerrada (${reason})`);
    this.onEnded(reason);
  }

  private loginTimer: NodeJS.Timeout | undefined;
  private lastLogin: boolean | null | undefined;
  private onLogin: (loggedIn: boolean | null) => void = () => {};

  setLoginListener(cb: (loggedIn: boolean | null) => void) {
    this.onLogin = cb;
  }

  private startLoginWatch() {
    clearInterval(this.loginTimer);
    this.lastLogin = undefined;
    const check = async () => {
      const wc = this.view?.webContents;
      if (!wc || wc.isDestroyed() || wc.isLoading()) return;
      try {
        const v = (await wc.executeJavaScript(LOGIN_CHECK_SCRIPT)) as boolean | null;
        if (v !== this.lastLogin) {
          this.lastLogin = v;
          this.onLogin(v);
        }
      } catch {
        /* página navegando */
      }
    };
    this.loginTimer = setInterval(check, 2000);
    void check();
  }

  private stopLoginWatch() {
    clearInterval(this.loginTimer);
    this.loginTimer = undefined;
  }

  private view: WebContentsView | null = null;
  private visible = false;
  private permissionsSet = false;

  constructor(
    private getWindow: () => BrowserWindow | null,
    private onVisibility: (open: boolean) => void,
    private onVoice: (v: VoiceStatus) => void,
  ) {}

  get isOpen() {
    return this.visible;
  }

  private setupSession() {
    if (this.permissionsSet) return;
    this.permissionsSet = true;
    const ses = session.fromPartition(PARTITION);
    // Só o chatgpt.com recebe microfone (o modo de voz precisa). Sem câmera.
    ses.setPermissionRequestHandler((wc, permission, cb, details) => {
      const url = details.requestingUrl || wc.getURL();
      const audioOnly =
        permission !== 'media' || !('mediaTypes' in details) || (details.mediaTypes ?? []).every((t) => t === 'audio');
      cb(isChatGPTOrigin(url) && ['media', 'clipboard-sanitized-write'].includes(permission) && audioOnly);
    });
    ses.setPermissionCheckHandler((_wc, permission, origin) => permission === 'media' && isChatGPTOrigin(origin));
  }

  private create() {
    this.setupSession();
    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false, // a conversa continua com a janela na bandeja
      },
    });
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (hostAllowed(url)) return { action: 'allow' }; // pop-ups de login
      if (url.startsWith('https://')) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      if (!hostAllowed(url)) {
        e.preventDefault();
        if (url.startsWith('https://')) shell.openExternal(url);
      }
    });
    // Depois do login o site volta para chatgpt.com (navegação ou mudança de rota interna).
    wc.on('did-navigate', (_e, url) => this.retryAfterLogin(url));
    wc.on('did-navigate-in-page', (_e, url) => this.retryAfterLogin(url));
    wc.loadURL(CHATGPT_URL);
    this.view = view;
    return view;
  }

  layout() {
    const win = this.getWindow();
    if (!win || !this.view || !this.visible) return;
    const [w, h] = win.getContentSize();
    this.view.setBounds({ x: 0, y: CHATGPT_BAR_HEIGHT, width: w, height: Math.max(0, h - CHATGPT_BAR_HEIGHT) });
  }

  private greeting: string | null = null;

  async open(autoVoice: boolean, greeting: string | null = null) {
    this.greeting = greeting;
    const win = this.getWindow();
    if (!win) return;
    const view = this.view ?? this.create();
    if (!this.visible) {
      win.contentView.addChildView(view);
      this.visible = true;
      this.onVisibility(true);
    }
    this.layout();
    view.webContents.focus();
    this.startLoginWatch();
    if (autoVoice) await this.startVoice();
    else this.onVoice({ status: 'off' });
  }

  private voiceRunning = false;
  private waitingLogin = false;

  private async startVoice() {
    const wc = this.view?.webContents;
    if (!wc || this.voiceRunning) return;
    this.voiceRunning = true;
    this.onVoice({ status: 'trying' });
    try {
      if (wc.isLoading()) await new Promise<void>((r) => wc.once('did-stop-loading', () => r()));
      // userGesture = true: o clique conta como ação do usuário (necessário para o microfone).
      const r = (await wc.executeJavaScript(START_VOICE_SCRIPT, true)) as
        | { ok: true; how: string }
        | { ok: false; login: true }
        | { ok: false; candidates: string[] };
      if (r.ok) {
        this.waitingLogin = false;
        this.onVoice({ status: 'started', how: r.how });
        this.startEndWatch();
        if (this.greeting) await this.sendGreeting(this.greeting);
      } else if ('login' in r) {
        // Tenta de novo sozinho quando o usuário voltar ao chatgpt.com já logado.
        this.waitingLogin = true;
        this.onVoice({ status: 'login-required' });
      } else {
        this.waitingLogin = false;
        this.onVoice({ status: 'not-found', candidates: r.candidates });
      }
    } catch {
      this.onVoice({ status: 'not-found', candidates: [] });
    } finally {
      this.voiceRunning = false;
    }
  }

  /** Envia a saudação depois que a conversa por voz conectou. */
  private async sendGreeting(text: string) {
    this.greeting = null; // só uma vez por abertura
    await new Promise((r) => setTimeout(r, 3000));
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    try {
      const r = (await wc.executeJavaScript(sendMessageScript(text), true)) as { ok: boolean; reason?: string };
      this.onVoice(r.ok ? { status: 'greeted' } : { status: 'greet-failed', reason: r.reason ?? '' });
    } catch {
      this.onVoice({ status: 'greet-failed', reason: 'erro ao enviar' });
    }
  }

  private retryAfterLogin(url: string) {
    if (!this.waitingLogin || !this.visible || !isChatGPTOrigin(url)) return;
    setTimeout(() => void this.startVoice(), 1500);
  }

  /** Fecha o ChatGPT. Destruir a página encerra o modo de voz e libera o microfone. O login continua salvo. */
  close() {
    this.stopLoginWatch();
    clearInterval(this.endTimer);
    this.endTimer = undefined;
    const win = this.getWindow();
    if (this.view) {
      if (win && this.visible) win.contentView.removeChildView(this.view);
      this.view.webContents.close();
      this.view = null;
      this.waitingLogin = false;
    }
    if (this.visible) {
      this.visible = false;
      this.onVisibility(false);
    }
  }
}
