import { WakeWordNative } from './androidPlugin';
import { platform } from './platform';

export type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';

/** No Android a permissão é a do app (RECORD_AUDIO), pedida pelo plugin nativo. */
const toPerm = (s: string): PermState =>
  s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : s.startsWith('prompt') ? 'prompt' : 'unknown';

export async function queryMicrophone(): Promise<PermState> {
  if (platform === 'android') return toPerm((await WakeWordNative.diagnostics()).microphone);
  try {
    const r = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return r.state as PermState;
  } catch {
    return 'unknown';
  }
}

/** Pede o microfone e libera imediatamente. Nenhum áudio é gravado. */
export async function requestMicrophone(): Promise<PermState> {
  if (platform === 'android') {
    // Pede microfone e notificações (a notificação permanente é obrigatória no Android).
    return toPerm((await WakeWordNative.requestAll()).microphone);
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch {
    return 'denied';
  }
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}

export function notificationState(): PermState {
  if (!('Notification' in window)) return 'unknown';
  return Notification.permission === 'default' ? 'prompt' : (Notification.permission as PermState);
}
