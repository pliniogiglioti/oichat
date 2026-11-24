import { WakeWordNative } from './androidPlugin';
import { desktop, platform } from './platform';

export const CHATGPT_URL = 'https://chatgpt.com/';

export type OpenResult =
  | { status: 'opened'; via: 'browser' | 'app' | 'embedded' }
  /** O sistema bloqueou a abertura (ex.: Android em segundo plano). Requer um toque do usuário. */
  | { status: 'needs-user-action'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Integração com o ChatGPT oficial (seção 7).
 * Cada plataforma tem a sua implementação. Nenhuma usa API, deep link ou endpoint não documentado.
 */
export interface ChatGPTAdapter {
  /** Abre o ChatGPT oficial. voice=false: sem modo de voz automático (login, testes). */
  open(opts?: { voice?: boolean }): Promise<OpenResult>;
  /**
   * Abertura direta no modo de voz. Experimental: só retorna true quando existir
   * um mecanismo oficial comprovado (ver Fase 6 no README).
   */
  supportsVoiceModeLaunch(): boolean;
}

class WebChatGPTAdapter implements ChatGPTAdapter {
  async open(): Promise<OpenResult> {
    const win = window.open(CHATGPT_URL, '_blank', 'noopener');
    // Com 'noopener' o retorno é sempre null; bloqueio de pop-up não é detectável aqui.
    void win;
    return { status: 'opened', via: 'browser' };
  }
  supportsVoiceModeLaunch() {
    return false;
  }
}

/** Windows: o processo principal abre o app do ChatGPT (se instalado) ou o navegador padrão. */
class DesktopChatGPTAdapter implements ChatGPTAdapter {
  async open(opts?: { voice?: boolean }): Promise<OpenResult> {
    try {
      const r = await desktop!.openChatGPT(opts);
      return { status: 'opened', via: r.via };
    } catch (e) {
      return { status: 'failed', reason: `Não foi possível abrir o ChatGPT: ${(e as Error).message}` };
    }
  }
  supportsVoiceModeLaunch() {
    return false;
  }
}

/** Android: ChatGPT dentro do Oi Chat (ChatGPTActivity.kt), igual ao Windows. */
class AndroidChatGPTAdapter implements ChatGPTAdapter {
  async open(opts?: { voice?: boolean }): Promise<OpenResult> {
    try {
      const r = await WakeWordNative.openChatGPT({ voice: opts?.voice !== false });
      return r.opened
        ? { status: 'opened', via: 'embedded' }
        : { status: 'needs-user-action', reason: 'Toque na notificação para abrir o ChatGPT.' };
    } catch (e) {
      return { status: 'failed', reason: `Não foi possível abrir o ChatGPT: ${(e as Error).message}` };
    }
  }
  supportsVoiceModeLaunch() {
    return false;
  }
}

function createAdapter(): ChatGPTAdapter {
  switch (platform) {
    case 'windows':
      return new DesktopChatGPTAdapter();
    case 'android':
      return new AndroidChatGPTAdapter();
    case 'web':
    default:
      return new WebChatGPTAdapter();
  }
}

export const chatGPT: ChatGPTAdapter = createAdapter();
