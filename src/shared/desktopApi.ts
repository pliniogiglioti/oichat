/**
 * Contrato da ponte segura entre o renderer (React) e o processo principal do Electron.
 * Exposto como `window.oichat` pelo preload. Nada além disto é acessível ao renderer.
 */
import type { AssistantState } from '../types';

export type DesktopCommand = 'toggle' | 'open-chatgpt' | 'settings' | 'resume';

export type ChatGPTMode = 'embedded' | 'external';

export interface DesktopSettings {
  autoStart: boolean;
  runInBackground: boolean;
  globalShortcut: string;
  preferChatGPTApp: boolean;
  chatGPTMode: ChatGPTMode;
  /** Experimental: tenta clicar no botão de voz do ChatGPT embutido. */
  autoVoice: boolean;
  /** Experimental: mensagem enviada ao ChatGPT quando o modo de voz liga ('' = nenhuma). */
  greeting: string;
}

export interface ApplySettingsResult {
  shortcutOk: boolean;
  autoStartOk: boolean;
  autoStartReason?: string;
}

export type VoiceStatus =
  | { status: 'trying' }
  | { status: 'started'; how: string }
  | { status: 'not-found'; candidates: string[] }
  | { status: 'login-required' }
  | { status: 'greeted' }
  | { status: 'greet-failed'; reason: string }
  | { status: 'off' };

export type DesktopEvent =
  | { type: 'chatgpt-view'; open: boolean }
  /** null = página ainda carregando / não deu para saber. */
  | { type: 'chatgpt-login'; loggedIn: boolean | null }
  | { type: 'voice'; voice: VoiceStatus };

export interface DesktopApi {
  platform: 'windows';
  /** voice=false abre sem tentar o modo de voz (ex.: tela de login). */
  openChatGPT(opts?: { voice?: boolean }): Promise<{ via: 'app' | 'browser' | 'embedded' }>;
  closeChatGPT(): Promise<void>;
  /** Esconde o painel na bandeja. */
  hidePanel(): void;
  chatGPTAppInstalled(): Promise<boolean>;
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  applySettings(s: DesktopSettings): Promise<ApplySettingsResult>;
  setAssistantState(state: AssistantState): void;
  onCommand(cb: (cmd: DesktopCommand) => void): () => void;
  onEvent(cb: (ev: DesktopEvent) => void): () => void;
}

export const IPC = {
  openChatGPT: 'oichat:open-chatgpt',
  closeChatGPT: 'oichat:close-chatgpt',
  hidePanel: 'oichat:hide-panel',
  appInstalled: 'oichat:chatgpt-app-installed',
  storageGet: 'oichat:storage-get',
  storageSet: 'oichat:storage-set',
  storageRemove: 'oichat:storage-remove',
  applySettings: 'oichat:apply-settings',
  assistantState: 'oichat:assistant-state',
  command: 'oichat:command',
  event: 'oichat:event',
} as const;

/** Altura da barra do Oi Chat acima do ChatGPT embutido. */
export const CHATGPT_BAR_HEIGHT = 56;
