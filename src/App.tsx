import { useEffect, useState } from 'react';
import { ChatGPTBar } from './components/ChatGPTBar';
import { useAndroidBridge } from './hooks/useAndroidBridge';
import { useDesktopBridge } from './hooks/useDesktopBridge';
import { Diagnostics } from './pages/Diagnostics';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { PhotoFrame } from './pages/PhotoFrame';
import { Settings } from './pages/Settings';
import { platform } from './services/platform';
import { useAssistant } from './stores/assistantStore';
import { useSettings } from './stores/settingsStore';
import { useUi } from './stores/uiStore';

export function App() {
  const { theme, loginConfirmed, onboardingDone } = useSettings();
  const page = useUi((s) => s.page);
  const chatEmbedded = useUi((s) => s.chatEmbedded);
  // No Windows as configurações chegam de forma assíncrona (IPC); espera para não piscar a tela de login.
  const [hydrated, setHydrated] = useState(() => useSettings.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const off = useSettings.persist.onFinishHydration(() => setHydrated(true));
    if (useSettings.persist.hasHydrated()) setHydrated(true);
    return off;
  }, [hydrated]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useDesktopBridge(hydrated);
  useAndroidBridge(hydrated);

  // Ao abrir: porta-retratos (se configurado)
  useEffect(() => {
    if (hydrated && useSettings.getState().photoFrame.enabled) useUi.getState().go('photoFrame');
  }, [hydrated]);

  // Sempre ativo: depois da configuração inicial, o assistente fica ouvindo o tempo todo.
  // Se parar (fim de um teste de microfone etc.), religa sozinho.
  useEffect(() => {
    if (!hydrated || !loginConfirmed || !onboardingDone) return;
    const ensureOn = () => {
      const a = useAssistant.getState();
      // Android: só religa com o app na tela (o sistema não deixa iniciar o microfone em segundo plano,
      // e "Encerrar" na notificação deve valer até o usuário voltar ao app).
      if (platform === 'android' && document.visibilityState !== 'visible') return;
      if (a.state === 'disabled' && !a.loading && !useUi.getState().micTestRunning) void a.enable();
    };
    ensureOn();
    const offA = useAssistant.subscribe(() => setTimeout(ensureOn, 500));
    const offU = useUi.subscribe((s, prev) => {
      if (prev.micTestRunning && !s.micTestRunning) setTimeout(ensureOn, 500);
    });
    const onVisible = () => setTimeout(ensureOn, 300);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offA();
      offU();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hydrated, loginConfirmed, onboardingDone]);

  if (!hydrated) return null;
  if (chatEmbedded) return <ChatGPTBar />;
  if (!loginConfirmed) return <Login />;
  if (!onboardingDone) return <Onboarding />;

  switch (page) {
    case 'settings':
      return <Settings />;
    case 'diagnostics':
      return <Diagnostics />;
    case 'photoFrame':
      return <PhotoFrame />;
    default:
      return <Home />;
  }
}
