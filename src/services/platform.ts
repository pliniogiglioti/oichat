import type { DesktopApi } from '../shared/desktopApi';
import type { Platform } from '../types';

declare global {
  interface Window {
    /** API restrita exposta pelo preload do Electron. */
    oichat?: DesktopApi;
    /** Injetado pelo Capacitor no app Android (Fase 5). */
    Capacitor?: { isNativePlatform(): boolean; getPlatform(): string };
  }
}

export function detectPlatform(): Platform {
  if (window.oichat?.platform === 'windows') return 'windows';
  if (window.Capacitor?.isNativePlatform() && window.Capacitor.getPlatform() === 'android') {
    return 'android';
  }
  return 'web';
}

export const platform: Platform = detectPlatform();
export const desktop: DesktopApi | undefined = platform === 'windows' ? window.oichat : undefined;

/** O que cada plataforma suporta. Usado para esconder opções que não se aplicam. */
export const capabilities = {
  tray: platform === 'windows',
  globalShortcut: platform === 'windows',
  microphoneSelection: platform === 'windows' || platform === 'web',
  vibration: platform === 'android',
  autoStart: platform !== 'web',
  background: platform !== 'web',
  photoFrame: platform === 'android' || platform === 'web',
} as const;

export const platformLabel: Record<Platform, string> = {
  windows: 'Windows',
  android: 'Android',
  web: 'Navegador (desenvolvimento)',
};
