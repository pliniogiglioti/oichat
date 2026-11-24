import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AssistantState } from '../types';

/** Plugin nativo do Android (android/app/src/main/java/com/oichat/app/WakeWordPlugin.kt). */
export interface AndroidDiagnostics {
  microphone: string; // granted | denied | prompt | prompt-with-rationale
  notifications: string;
  overlay: boolean;
  batteryUnrestricted: boolean;
  charging: boolean;
  secureLock: boolean;
  manufacturer: string;
  chatGPTInstalled: boolean;
  state: AssistantState;
}

export type AndroidSettingsScreen = 'overlay' | 'battery' | 'security' | 'assistant' | 'notifications' | 'app';

export interface WakeWordPluginApi {
  configure(opts: {
    sensitivity?: number;
    autoVoice?: boolean;
    greeting?: string;
    goodbyeMic?: boolean;
    vibration?: boolean;
    sound?: boolean;
    volume?: number;
  }): Promise<void>;
  start(opts?: { test?: boolean }): Promise<void>;
  stopTest(): Promise<void>;
  stop(): Promise<void>;
  resume(): Promise<void>;
  getState(): Promise<{ state: AssistantState; error: string | null }>;
  openChatGPT(opts?: { voice?: boolean }): Promise<{ via: 'embedded'; opened: boolean }>;
  requestAll(): Promise<{ microphone: string; notifications: string }>;
  diagnostics(): Promise<AndroidDiagnostics>;
  openSettings(opts: { which: AndroidSettingsScreen }): Promise<void>;
  addListener(event: 'state', cb: (e: { state: AssistantState; error: string | null }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'heard', cb: (e: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'detected', cb: (e: { mode: 'wake' }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'loading', cb: (e: { loading: boolean }) => void): Promise<PluginListenerHandle>;
}

export const WakeWordNative = registerPlugin<WakeWordPluginApi>('WakeWord');
