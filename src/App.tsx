import { useEffect, useRef, useState } from 'react';
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

  return <PageTransition page={page} />;
}

/** Telas internas entram deslizando pela lateral: da direita ao avançar, da esquerda ao voltar. */
const DEPTH: Record<string, number> = { home: 0, photoFrame: 1, settings: 1, diagnostics: 2 };

function PageTransition({ page }: { page: string }) {
  const prev = useRef(page);
  const dir = useRef<'forward' | 'back' | null>(null);
  if (prev.current !== page) {
    dir.current = (DEPTH[page] ?? 0) >= (DEPTH[prev.current] ?? 0) ? 'forward' : 'back';
    prev.current = page;
  }
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  const anim = dir.current === 'forward' ? 'page-in-right' : dir.current === 'back' ? 'page-in-left' : '';
  // O porta-retratos é tela cheia (fixed): ele mesmo anima, senão o menu entra deslocado pela barra de status.
  if (page === 'photoFrame') return <PhotoFrame key={page} />;
  return (
    <div key={page} className={`min-h-full ${anim}`}>
      {page === 'settings' ? <Settings /> : page === 'diagnostics' ? <Diagnostics /> : <Home />}
    </div>
  );
}
