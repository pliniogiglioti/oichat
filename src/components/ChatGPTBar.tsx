import type { ReactNode } from 'react';
import { Loader2, Mic, MousePointerClick, X } from 'lucide-react';
import { CHATGPT_BAR_HEIGHT } from '../shared/desktopApi';
import { useAssistant } from '../stores/assistantStore';
import { useSettings } from '../stores/settingsStore';
import { useUi } from '../stores/uiStore';
import { Logo } from './Logo';

/** Barra do Oi Chat acima do ChatGPT embutido. O ChatGPT ocupa o resto da janela. */
export function ChatGPTBar() {
  const voice = useUi((u) => u.voice);
  const goodbyeListening = useUi((u) => u.goodbyeListening);
  const goodbyeEnabled = useSettings((s) => s.goodbyeEnabled);
  const resume = useAssistant((a) => a.resume);
  const state = useAssistant((a) => a.state);

  const loginConfirmed = useSettings((s) => s.loginConfirmed);
  const onboardingDone = useSettings((s) => s.onboardingDone);
  const chatLoggedIn = useUi((u) => u.chatLoggedIn);

  let status: ReactNode;
  if (!loginConfirmed && chatLoggedIn) {
    status = <span className="text-emerald-400">Login detectado ✓ Continuando…</span>;
  } else if (!loginConfirmed) {
    status = <span className="text-amber-400">Entre na sua conta abaixo; o Oi Chat percebe sozinho</span>;
  } else if (!onboardingDone) {
    status = 'Abriu! Toque em Fechar para continuar a configuração';
  } else if (voice.status === 'trying') {
    status = (
      <>
        <Loader2 className="size-3.5 animate-spin" /> Ativando modo de voz…
      </>
    );
  } else if (voice.status === 'login-required') {
    status = (
      <span className="text-amber-400">Faça login no ChatGPT abaixo; depois o modo de voz liga sozinho</span>
    );
  } else if (voice.status === 'not-found') {
    status = (
      <>
        <MousePointerClick className="size-3.5" /> Toque no botão de voz do ChatGPT
      </>
    );
  } else if (voice.status === 'greet-failed') {
    status = <span className="text-amber-400">Voz ativa · não deu para enviar “Oi, Chat” ({voice.reason})</span>;
  } else if (goodbyeListening) {
    status = (
      <>
        <Mic className="size-3.5 text-emerald-400" /> Diga “Tchau, Chat” para sair
      </>
    );
  } else {
    status = goodbyeEnabled && state === 'released' ? 'Preparando “Tchau, Chat”…' : 'ChatGPT';
  }

  return (
    <header
      style={{ height: CHATGPT_BAR_HEIGHT }}
      className="fixed inset-x-0 top-0 flex items-center gap-3 border-b border-zinc-800 bg-[#0a0a0f] px-3 text-zinc-100"
    >
      <Logo size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-tight font-semibold">Oi Chat</div>
        <div className="flex items-center gap-1.5 truncate text-xs text-zinc-400">{status}</div>
      </div>
      <button
        type="button"
        onClick={() => resume()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
      >
        <X className="size-4" /> Fechar
      </button>
    </header>
  );
}
