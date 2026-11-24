import { Image, RotateCcw, Settings as SettingsIcon } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Orb } from '../components/Orb';
import { Badge, Button } from '../components/ui';
import { capabilities } from '../services/platform';
import { useAssistant } from '../stores/assistantStore';
import { useSettings } from '../stores/settingsStore';
import { useUi } from '../stores/uiStore';
import type { AssistantState } from '../types';

const text: Record<AssistantState, { title: (w: string) => string; sub: string }> = {
  disabled: { title: () => 'Iniciando…', sub: 'Preparando o microfone.' },
  listening: { title: (w) => `Diga “${w}” para começar`, sub: 'Ouvindo só a palavra de ativação, no aparelho.' },
  detected: { title: () => 'Palavra reconhecida!', sub: 'Liberando o microfone…' },
  opening: { title: () => 'Abrindo ChatGPT…', sub: '' },
  released: { title: () => 'Conversa no ChatGPT', sub: 'Quando terminar, toque em Voltar a ouvir.' },
  error: { title: () => 'Erro de integração', sub: '' },
};

/** Tela principal: o assistente fica sempre ativo, sem botões de ligar/desligar. */
export function Home() {
  const { state, error, loading, enable, resume } = useAssistant();
  const wakeWord = useSettings((s) => s.wakeWord);
  const go = useUi((s) => s.go);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-6 py-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-semibold">Oi Chat</span>
        </div>
        <div className="flex items-center gap-1">
          {capabilities.photoFrame && (
            <Button variant="ghost" className="px-2" aria-label="Porta-retratos" onClick={() => go('photoFrame')}>
              <Image className="size-5" />
            </Button>
          )}
          <Button variant="ghost" className="px-2" aria-label="Configurações" onClick={() => go('settings')}>
            <SettingsIcon className="size-5" />
          </Button>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center">
        <Badge tone={state === 'error' ? 'bad' : 'ok'}>{state === 'error' ? 'Erro' : 'Assistente ativo'}</Badge>
        {/* Tocar na esfera só serve para tentar de novo quando há erro */}
        <Orb state={state} onClick={state === 'error' ? enable : undefined} />
        <div className="space-y-1.5" aria-live="polite">
          <h1 className="text-2xl font-semibold">
            {loading ? 'Preparando reconhecimento…' : text[state].title(wakeWord)}
          </h1>
          <p className="text-sm text-zinc-500">
            {loading
              ? 'Na primeira vez o modelo de voz (~31 MB) é baixado e fica guardado no aparelho.'
              : state === 'error'
                ? `${error} Tentando de novo automaticamente…`
                : text[state].sub}
          </p>
        </div>
      </section>

      {/* Só aparece quando o ChatGPT abriu fora do app e não há "Tchau, Chat" para encerrar */}
      {state === 'released' && (
        <footer className="pb-2">
          <Button variant="primary" className="w-full py-3.5" onClick={resume}>
            <RotateCcw className="size-4" /> Voltar a ouvir
          </Button>
        </footer>
      )}
    </main>
  );
}
