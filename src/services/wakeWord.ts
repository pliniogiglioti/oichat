import { WakeWordNative } from './androidPlugin';
import { platform } from './platform';
import { VoskEngine } from './voskEngine';

/** O que o motor deve ouvir: "Oi, Chat" (ativar) ou "Tchau, Chat" (encerrar a conversa). */
export type ListenFor = 'wake' | 'goodbye';

export interface StartOptions {
  sensitivity: number;
  deviceId?: string;
  listenFor?: ListenFor;
  /** Teste do onboarding/diagnóstico: só avisa a detecção, não abre o ChatGPT. */
  test?: boolean;
}

export interface WakeWordEngine {
  /** false quando o motor não está disponível nesta plataforma. */
  readonly available: boolean;
  /** Motivo de indisponibilidade, exibido no diagnóstico. */
  readonly unavailableReason?: string;
  /** Carrega o modelo (se preciso), abre o microfone e começa a ouvir. */
  start(opts: StartOptions): Promise<void>;
  /** Para a escuta e LIBERA o microfone. */
  stop(): Promise<void>;
  onDetected(cb: (mode: ListenFor) => void): () => void;
  /** Texto reconhecido (só para o teste do onboarding/diagnóstico). Não é gravado. */
  onHeard(cb: (text: string) => void): () => void;
}

class UnavailableEngine implements WakeWordEngine {
  readonly available = false;
  constructor(readonly unavailableReason: string) {}
  async start() {
    throw new Error(this.unavailableReason);
  }
  async stop() {}
  onDetected() {
    return () => {};
  }
  onHeard() {
    return () => {};
  }
}

/**
 * Android: o Vosk roda nativo no WakeWordService.kt (continua ouvindo com o app em segundo plano).
 * O próprio serviço abre o ChatGPT ao ouvir "Oi, Chat"; aqui só se liga/desliga e se acompanha.
 */
class AndroidEngine implements WakeWordEngine {
  readonly available = true;
  private testing = false;

  async start({ sensitivity, test }: StartOptions) {
    await WakeWordNative.configure({ sensitivity });
    this.testing = !!test;
    try {
      await WakeWordNative.start({ test: !!test });
    } catch (e) {
      throw new Error((e as Error).message || 'Não foi possível iniciar a escuta.');
    }
  }

  async stop() {
    if (this.testing) {
      this.testing = false;
      await WakeWordNative.stopTest(); // volta para a escuta normal
    } else {
      await WakeWordNative.stop();
    }
  }

  onDetected(cb: (mode: ListenFor) => void) {
    const h = WakeWordNative.addListener('detected', (e) => cb(e.mode));
    return () => void h.then((x) => x.remove());
  }

  onHeard(cb: (text: string) => void) {
    const h = WakeWordNative.addListener('heard', (e) => cb(e.text));
    return () => void h.then((x) => x.remove());
  }
}

function createEngine(): WakeWordEngine {
  // Web e Windows (renderer do Electron) usam o Vosk em WebAssembly.
  if (platform === 'android') return new AndroidEngine();
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
    return new UnavailableEngine('Este navegador não oferece acesso ao microfone necessário.');
  }
  return new VoskEngine();
}

export const wakeWord: WakeWordEngine = createEngine();
