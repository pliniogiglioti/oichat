import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.oichat.app',
  appName: 'Oi Chat',
  webDir: 'dist',
  android: {
    // O ChatGPT abre numa Activity nativa separada (ChatGPTActivity), não nesta WebView.
    allowMixedContent: false,
  },
};

export default config;
