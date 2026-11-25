import { useEffect } from 'react';
import { WakeWordNative } from '../services/androidPlugin';
import { platform } from '../services/platform';
import { useAssistant } from '../stores/assistantStore';
import { setMicLevel } from '../stores/micLevelStore';
import { useSettings } from '../stores/settingsStore';
import { useUi } from '../stores/uiStore';

/** Liga o React ao serviço nativo do Android. Sem efeito nas outras plataformas. */
export function useAndroidBridge(ready: boolean) {
  useEffect(() => {
    if (platform !== 'android' || !ready) return;

    // Configurações que o lado nativo usa (serviço e tela do ChatGPT)
    let last = '';
    const sync = () => {
      const s = useSettings.getState();
      const payload = {
        sensitivity: s.sensitivity,
        autoVoice: s.autoVoice,
        greeting: s.greeting,
        vibration: s.vibration,
        sound: s.confirmationSound,
        volume: s.volume,
      };
      const key = JSON.stringify(payload);
      if (key === last) return;
      last = key;
      void WakeWordNative.configure(payload);
    };
    sync();
    const offSettings = useSettings.subscribe(sync);

    // Estado do serviço → tela principal (o teste de microfone controla o próprio estado)
    const apply = (state: string, error: string | null) => {
      if (useUi.getState().micTestRunning) return;
      useAssistant.setState({ state: state as never, error });
    };
    void WakeWordNative.getState().then((s) => apply(s.state, s.error));
    const hState = WakeWordNative.addListener('state', (e) => apply(e.state, e.error));
    const hLoading = WakeWordNative.addListener('loading', (e) => useAssistant.setState({ loading: e.loading }));
    const hLevel = WakeWordNative.addListener('level', (e) => setMicLevel(e.level));

    return () => {
      void hLevel.then((h) => h.remove());
      offSettings();
      void hState.then((h) => h.remove());
      void hLoading.then((h) => h.remove());
    };
  }, [ready]);
}
