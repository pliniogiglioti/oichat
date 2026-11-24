import type { ListenFor, StartOptions, WakeWordEngine } from './wakeWord';

/**
 * Palavra de ativação com Vosk (offline, WebAssembly).
 *
 * O reconhecedor recebe uma gramática fechada: só conhece "oi chat" (e as grafias que o
 * modelo pt-BR usa para o mesmo som). Todo o resto vira [unk]. O áudio é processado no
 * próprio aparelho e descartado; nada é gravado nem enviado.
 */

const MODEL_FILE = 'models/vosk-model-small-pt-0.3.tar.gz';

// "chat", "chá" e "xá" estão no vocabulário do modelo e soam iguais em "Oi, Chat".
const MODES: Record<ListenFor, { phrases: string[]; match: RegExp }> = {
  wake: { phrases: ['oi chat', 'oi chá', 'oi xá'], match: /\boi (chat|chá|xá)\b/ },
  goodbye: {
    phrases: ['tchau chat', 'tchau chá', 'tchau xá', 'chau chat', 'chau chá'],
    match: /\bt?chau (chat|chá|xá)\b/,
  },
};

/** Junta blocos de 128 amostras em pedaços de ~4096 antes de mandar ao worker do Vosk. */
const WORKLET = `
class Chunker extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('oichat-chunker', Chunker);
`;

type VoskModule = typeof import('vosk-browser');
type Model = Awaited<ReturnType<VoskModule['createModel']>>;
type Recognizer = InstanceType<Model['KaldiRecognizer']>;

/**
 * O Vosk não tem "sensibilidade" como o Porcupine. Aproximamos assim:
 *  - confiança mínima média das palavras no resultado final (mais sensível = aceita menos confiança);
 *  - com sensibilidade alta (≥ 0,8) também aceita o resultado parcial, que é mais rápido.
 */
const minConfidence = (sensitivity: number) => 0.95 - sensitivity * 0.6;

export class VoskEngine implements WakeWordEngine {
  readonly available = true;
  private modelPromise?: Promise<Model>;
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private recognizer?: Recognizer;
  private fired = false;
  private mode: ListenFor = 'wake';
  private detectedCbs = new Set<(mode: ListenFor) => void>();
  private heardCbs = new Set<(t: string) => void>();

  private loadModel() {
    this.modelPromise ??= (async () => {
      const { createModel } = await import('vosk-browser');
      const url = new URL(MODEL_FILE, document.baseURI).href;
      // Primeiro uso baixa ~31 MB; depois fica guardado no IndexedDB do app.
      return createModel(url, -1);
    })().catch((e) => {
      this.modelPromise = undefined;
      throw new Error(`Não foi possível carregar o modelo de voz: ${(e as Error).message ?? e}`);
    });
    return this.modelPromise;
  }

  async start({ sensitivity, deviceId, listenFor = 'wake' }: StartOptions) {
    await this.stop();
    this.mode = listenFor;
    const { phrases, match } = MODES[listenFor];
    const model = await this.loadModel();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      throw new Error(
        name === 'NotAllowedError'
          ? 'Permissão de microfone negada.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'Microfone não encontrado. Verifique o dispositivo nas configurações.'
            : `Não foi possível abrir o microfone (${name}).`,
      );
    }

    const ctx = new AudioContext();
    this.ctx = ctx;
    const workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const rec = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([...phrases, '[unk]']));
    rec.setWords(true);
    this.recognizer = rec;
    this.fired = false;
    const minConf = minConfidence(sensitivity);
    // "Tchau, Chat" acontece com o ChatGPT falando ao fundo: quase nunca há o silêncio que
    // fecha o resultado final. Como a gramática só conhece essa frase, aceita o parcial.
    const usePartial = listenFor === 'goodbye' || sensitivity >= 0.8;
    const debug = listenFor === 'goodbye';
    if (debug) console.info('[oichat] ouvindo "Tchau, Chat"');

    rec.on('result', (msg) => {
      if (msg.event !== 'result') return;
      const text = msg.result.text ?? '';
      if (text) this.emitHeard(text);
      if (!match.test(text)) return;
      const words = msg.result.result ?? [];
      const conf = words.length ? words.reduce((a, w) => a + w.conf, 0) / words.length : 0;
      if (conf >= minConf) this.fire();
    });
    rec.on('partialresult', (msg) => {
      if (msg.event !== 'partialresult') return;
      const text = msg.result.partial ?? '';
      if (text) this.emitHeard(text);
      // Só palavras da gramática (tchau/chat/[unk]); nada da conversa é registrado.
      if (debug && text) console.info('[oichat] parcial:', text);
      if (usePartial && match.test(text)) this.fire();
    });

    const source = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, 'oichat-chunker');
    let lastLevelLog = 0;
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (!this.fired) this.recognizer?.acceptWaveformFloat(e.data, ctx.sampleRate);
      // Diagnóstico: volume que chega ao microfone (só um número, nenhum áudio é guardado).
      if (debug && Date.now() - lastLevelLog > 3000) {
        lastLevelLog = Date.now();
        let sum = 0;
        for (let i = 0; i < e.data.length; i++) sum += e.data[i] * e.data[i];
        console.info(`[oichat] nível do microfone: ${Math.sqrt(sum / e.data.length).toFixed(4)}`);
      }
    };
    source.connect(node);
    this.node = node;
    if (ctx.state === 'suspended') await ctx.resume();
  }

  async stop() {
    this.node?.port.close();
    this.node?.disconnect();
    this.node = undefined;
    this.stream?.getTracks().forEach((t) => t.stop()); // libera o microfone
    this.stream = undefined;
    this.recognizer?.remove();
    this.recognizer = undefined;
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    this.ctx = undefined;
  }

  onDetected(cb: (mode: ListenFor) => void) {
    this.detectedCbs.add(cb);
    return () => this.detectedCbs.delete(cb);
  }

  onHeard(cb: (t: string) => void) {
    this.heardCbs.add(cb);
    return () => this.heardCbs.delete(cb);
  }

  private fire() {
    if (this.fired) return; // evita disparo duplo (parcial + final)
    this.fired = true;
    console.info(`[oichat] detectado (${this.mode})`);
    this.detectedCbs.forEach((cb) => cb(this.mode));
  }

  private emitHeard(text: string) {
    this.heardCbs.forEach((cb) => cb(text));
  }
}
