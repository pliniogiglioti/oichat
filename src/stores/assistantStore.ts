import { create } from 'zustand';
import { chatGPT } from '../services/chatGPT';
import { WakeWordNative } from '../services/androidPlugin';
import { desktop, platform } from '../services/platform';
import { playConfirmation } from '../services/sound';
import { wakeWord, type ListenFor } from '../services/wakeWord';
import type { AssistantState } from '../types';
import { useSettings } from './settingsStore';
import { useUi } from './uiStore';

/** Janela que impede ativações duplicadas (seção 4). */
const DUPLICATE_WINDOW_MS = 3000;
/** Espera o ChatGPT pegar o microfone antes de começar a ouvir "Tchau, Chat". */
const GOODBYE_DELAY_MS = 2000;
/** Nova tentativa automática depois de um erro. */
const ERROR_RETRY_MS = 10_000;

interface AssistantStore {
  state: AssistantState;
  error: string | null;
  /** Carregando modelo / abrindo microfone. */
  loading: boolean;
  lastDetectionAt: number;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  toggle: () => Promise<void>;
  /** Chamado pelo motor de voz. */
  onPhrase: (mode: ListenFor) => Promise<void>;
  openChatGPT: () => Promise<void>;
  /** Fecha o ChatGPT embutido (se aberto) e volta a ouvir "Oi, Chat". */
  resume: () => Promise<void>;
}

let resumeTimer: ReturnType<typeof setTimeout> | undefined;
let goodbyeTimer: ReturnType<typeof setTimeout> | undefined;

function clearTimers() {
  clearTimeout(resumeTimer);
  clearTimeout(goodbyeTimer);
}

export const useAssistant = create<AssistantStore>()((set, get) => ({
  state: 'disabled',
  error: null,
  loading: false,
  lastDetectionAt: 0,

  enable: async () => {
    clearTimers();
    if (get().loading) return;
    set({ loading: true, error: null });
    useUi.setState({ goodbyeListening: false });
    try {
      const { sensitivity, microphoneId } = useSettings.getState();
      await wakeWord.start({ sensitivity, deviceId: microphoneId || undefined, listenFor: 'wake' });
      set({ state: 'listening', error: null });
    } catch (e) {
      set({ state: 'error', error: (e as Error).message });
      // Sempre ativo: tenta de novo sozinho (ex.: microfone reconectado).
      resumeTimer = setTimeout(() => {
        if (get().state === 'error') void get().enable();
      }, ERROR_RETRY_MS);
    } finally {
      set({ loading: false });
    }
  },

  disable: async () => {
    clearTimers();
    await wakeWord.stop();
    useUi.setState({ goodbyeListening: false });
    set({ state: 'disabled', error: null });
  },

  toggle: async () => {
    const { state, enable, disable } = get();
    if (state === 'disabled' || state === 'error') await enable();
    else await disable();
  },

  onPhrase: async (mode) => {
    const now = Date.now();
    const { state, lastDetectionAt } = get();

    if (mode === 'goodbye') {
      if (state === 'released') {
        const { confirmationSound, volume } = useSettings.getState();
        if (confirmationSound) playConfirmation(volume);
        await get().resume();
      }
      return;
    }

    if (state !== 'listening' || now - lastDetectionAt < DUPLICATE_WINDOW_MS) return;
    set({ state: 'detected', lastDetectionAt: now });

    const { confirmationSound, volume } = useSettings.getState();
    if (confirmationSound) playConfirmation(volume);

    // Libera o microfone ANTES de abrir o ChatGPT.
    await wakeWord.stop();
    await get().openChatGPT();
  },

  openChatGPT: async () => {
    clearTimers();
    if (platform === 'android') {
      // No Android o serviço nativo libera o microfone e volta a ouvir sozinho; o estado chega por evento.
      const r = await chatGPT.open();
      if (r.status === 'failed') set({ state: 'error', error: r.reason });
      return;
    }
    const wasActive = get().state !== 'disabled';
    if (wasActive) await wakeWord.stop();
    set({ state: 'opening', error: null });

    const result = await chatGPT.open();
    if (result.status === 'failed') {
      set({ state: 'error', error: result.reason });
      return;
    }
    set({ state: wasActive ? 'released' : 'disabled' });
    if (!wasActive) return;

    const { autoResumeAfterSec, goodbyeEnabled, sensitivity, microphoneId } = useSettings.getState();
    const embedded = result.status === 'opened' && result.via === 'embedded';

    if (embedded && goodbyeEnabled) {
      // Durante a conversa, ouve só "Tchau, Chat" (o ChatGPT usa o mesmo microfone ao mesmo tempo).
      goodbyeTimer = setTimeout(async () => {
        if (get().state !== 'released') return;
        try {
          await wakeWord.start({ sensitivity, deviceId: microphoneId || undefined, listenFor: 'goodbye' });
          useUi.setState({ goodbyeListening: true });
        } catch {
          useUi.setState({ goodbyeListening: false });
        }
      }, GOODBYE_DELAY_MS);
    } else if (!embedded && autoResumeAfterSec > 0) {
      resumeTimer = setTimeout(() => get().resume(), autoResumeAfterSec * 1000);
    }
  },

  resume: async () => {
    clearTimers();
    if (platform === 'android') {
      await WakeWordNative.resume();
      return;
    }
    if (useUi.getState().chatEmbedded) await desktop?.closeChatGPT();
    if (get().state === 'released' || get().state === 'error') await get().enable();
  },
}));

wakeWord.onDetected((mode) => void useAssistant.getState().onPhrase(mode));
