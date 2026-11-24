import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { Preferences } from '@capacitor/preferences';
import { desktop, platform } from './platform';

/**
 * Armazenamento local das configurações (seção 9). Nada vai para servidores.
 * - Web: localStorage
 * - Windows: arquivo JSON na pasta de dados do usuário, via IPC
 * - Android (Fase 5): Capacitor Preferences
 */
const webStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* idem */
    }
  },
};

function makeDesktopStorage(): StateStorage | null {
  const d = desktop;
  if (!d) return null;
  return {
    getItem: (k) => d.storage.get(k),
    setItem: (k, v) => d.storage.set(k, v),
    removeItem: (k) => d.storage.remove(k),
  };
}
const desktopStorage = makeDesktopStorage();

/** Android: Capacitor Preferences (SharedPreferences nativo). */
const androidStorage: StateStorage = {
  getItem: async (k) => (await Preferences.get({ key: k })).value,
  setItem: (k, v) => Preferences.set({ key: k, value: v }),
  removeItem: (k) => Preferences.remove({ key: k }),
};

export const appStorage = createJSONStorage(
  () => desktopStorage ?? (platform === 'android' ? androidStorage : webStorage),
);
