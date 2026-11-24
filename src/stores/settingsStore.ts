import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from '../services/storage';
import type { Settings } from '../types';

export const defaultSettings: Settings = {
  wakeWord: 'Oi, Chat',
  sensitivity: 0.5,
  microphoneId: '',
  confirmationSound: true,
  volume: 0.7,
  theme: 'dark',
  autoStart: false,
  runInBackground: true,
  globalShortcut: 'Ctrl+Alt+Space',
  vibration: true,
  autoResumeAfterSec: 0,
  listenOnStartup: true,
  preferChatGPTApp: true,
  chatGPTMode: 'embedded',
  autoVoice: true,
  goodbyeEnabled: true,
  greeting: 'Oi, Chat!',
  photoFrame: {
    enabled: false,
    intervalSec: 10,
    nightMode: { enabled: false, start: '23:00', end: '07:00' },
  },
};

interface SettingsStore extends Settings {
  /** Usuário confirmou que fez login no ChatGPT oficial. O app não verifica a sessão. */
  loginConfirmed: boolean;
  onboardingDone: boolean;
  set: (patch: Partial<Settings>) => void;
  setPhotoFrame: (patch: Partial<Settings['photoFrame']>) => void;
  confirmLogin: () => void;
  finishOnboarding: () => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      loginConfirmed: false,
      onboardingDone: false,
      set: (patch) => set(patch),
      setPhotoFrame: (patch) => set((s) => ({ photoFrame: { ...s.photoFrame, ...patch } })),
      confirmLogin: () => set({ loginConfirmed: true }),
      finishOnboarding: () => set({ onboardingDone: true }),
      reset: () => set({ ...defaultSettings, loginConfirmed: false, onboardingDone: false }),
    }),
    { name: 'oichat-settings', storage: appStorage, version: 1 },
  ),
);
