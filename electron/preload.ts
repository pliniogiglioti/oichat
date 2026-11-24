// Preload restrito: expõe só as funções do contrato DesktopApi. Sem Node no renderer.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type DesktopApi, type DesktopCommand, type DesktopEvent } from '../src/shared/desktopApi';

const COMMANDS: DesktopCommand[] = ['toggle', 'open-chatgpt', 'settings', 'resume'];

const api: DesktopApi = {
  platform: 'windows',
  openChatGPT: (opts) => ipcRenderer.invoke(IPC.openChatGPT, { voice: opts?.voice !== false }),
  closeChatGPT: () => ipcRenderer.invoke(IPC.closeChatGPT),
  hidePanel: () => ipcRenderer.send(IPC.hidePanel),
  chatGPTAppInstalled: () => ipcRenderer.invoke(IPC.appInstalled),
  storage: {
    get: (key) => ipcRenderer.invoke(IPC.storageGet, String(key)),
    set: (key, value) => ipcRenderer.invoke(IPC.storageSet, String(key), String(value)),
    remove: (key) => ipcRenderer.invoke(IPC.storageRemove, String(key)),
  },
  applySettings: (s) =>
    ipcRenderer.invoke(IPC.applySettings, {
      autoStart: !!s.autoStart,
      runInBackground: !!s.runInBackground,
      globalShortcut: String(s.globalShortcut ?? ''),
      preferChatGPTApp: !!s.preferChatGPTApp,
      chatGPTMode: s.chatGPTMode === 'external' ? 'external' : 'embedded',
      autoVoice: !!s.autoVoice,
      greeting: String(s.greeting ?? ''),
    }),
  setAssistantState: (state) => ipcRenderer.send(IPC.assistantState, String(state)),
  onCommand: (cb) => {
    const listener = (_e: IpcRendererEvent, cmd: DesktopCommand) => {
      if (COMMANDS.includes(cmd)) cb(cmd);
    };
    ipcRenderer.on(IPC.command, listener);
    return () => ipcRenderer.removeListener(IPC.command, listener);
  },
  onEvent: (cb) => {
    const listener = (_e: IpcRendererEvent, ev: DesktopEvent) => cb(ev);
    ipcRenderer.on(IPC.event, listener);
    return () => ipcRenderer.removeListener(IPC.event, listener);
  },
};

contextBridge.exposeInMainWorld('oichat', api);
