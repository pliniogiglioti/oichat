import { create } from 'zustand';
import type { VoiceStatus } from '../shared/desktopApi';

export type Page = 'home' | 'settings' | 'diagnostics' | 'photoFrame';

interface UiStore {
  page: Page;
  go: (page: Page) => void;
  /** ChatGPT aberto dentro da janela (Windows). */
  chatEmbedded: boolean;
  voice: VoiceStatus;
  /** Escuta de "Tchau, Chat" ativa durante a conversa. */
  goodbyeListening: boolean;
  /** Login detectado no ChatGPT embutido (undefined = nunca verificado). */
  chatLoggedIn: boolean | null | undefined;
  /** Teste de microfone em andamento (o assistente fica parado enquanto isso). */
  micTestRunning: boolean;
}

export const useUi = create<UiStore>()((set) => ({
  page: 'home',
  go: (page) => set({ page }),
  chatEmbedded: false,
  voice: { status: 'off' },
  goodbyeListening: false,
  chatLoggedIn: undefined,
  micTestRunning: false,
}));
