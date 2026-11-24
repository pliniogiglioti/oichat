/** Estados possíveis do assistente (seção 3 da especificação). */
export type AssistantState =
  | 'disabled' // Desativado
  | 'listening' // Aguardando palavra de ativação
  | 'detected' // Palavra reconhecida
  | 'opening' // Abrindo ChatGPT
  | 'released' // Microfone liberado para conversação
  | 'error'; // Erro de integração

export type Platform = 'windows' | 'android' | 'web';

export type ThemeMode = 'dark' | 'light';

export interface PhotoFrameSettings {
  enabled: boolean;
  intervalSec: number;
  nightMode: { enabled: boolean; start: string; end: string };
}

export interface Settings {
  wakeWord: string;
  sensitivity: number; // 0..1, repassado ao Porcupine
  microphoneId: string; // '' = padrão do sistema
  confirmationSound: boolean;
  volume: number; // 0..1
  theme: ThemeMode;
  autoStart: boolean;
  runInBackground: boolean;
  globalShortcut: string; // Windows
  vibration: boolean; // Android
  autoResumeAfterSec: number; // 0 = só manual
  listenOnStartup: boolean; // ativa a escuta ao abrir o app
  preferChatGPTApp: boolean; // Windows: usar o app do ChatGPT se instalado (modo externo)
  chatGPTMode: 'embedded' | 'external'; // Windows: dentro da janela do Oi Chat ou fora
  autoVoice: boolean; // Experimental: clicar sozinho no botão de voz do ChatGPT embutido
  goodbyeEnabled: boolean; // "Tchau, Chat" fecha o ChatGPT e volta a ouvir
  greeting: string; // Experimental: mensagem enviada quando o modo de voz liga ('' = nenhuma)
  photoFrame: PhotoFrameSettings;
}
