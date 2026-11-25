import { create } from 'zustand';

/**
 * Volume que chega ao microfone enquanto o Oi Chat ouve (0 a 1), só para a animação da esfera.
 * Separado dos outros estados porque muda ~10 vezes por segundo.
 */
export const useMicLevel = create<{ level: number }>()(() => ({ level: 0 }));

export const setMicLevel = (level: number) => useMicLevel.setState({ level });

/** Converte o RMS (amostras de -1 a 1) em 0..1, numa escala em dB parecida com a do ouvido. */
export function rmsToLevel(rms: number) {
  const db = rms > 0 ? 20 * Math.log10(rms) : -100;
  return Math.min(1, Math.max(0, (db + 65) / 45));
}
