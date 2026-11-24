import { useState, type ReactNode } from 'react';
import { AudioLines, Check, ExternalLink, Info, Mic, MoonStar, Smartphone } from 'lucide-react';
import { Badge, Button, Row, Slider, Toggle } from '../components/ui';
import { WakeWordTest } from '../components/WakeWordTest';
import { chatGPT } from '../services/chatGPT';
import { requestMicrophone, type PermState } from '../services/permissions';
import { capabilities, platform } from '../services/platform';
import { wakeWord } from '../services/wakeWord';
import { useSettings } from '../stores/settingsStore';

/** Configuração inicial (seção 2). */
export function Onboarding() {
  const s = useSettings();
  const [step, setStep] = useState(0);
  const [mic, setMic] = useState<PermState>('unknown');
  const [chatOpened, setChatOpened] = useState(false);

  const steps: { icon: ReactNode; title: string; body: ReactNode; canNext?: boolean }[] = [
    {
      icon: <Mic />,
      title: 'Permissão de microfone',
      canNext: mic === 'granted',
      body: (
        <>
          <p>O microfone é usado só para reconhecer “{s.wakeWord}”. Nada é gravado.</p>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={async () => setMic(await requestMicrophone())}>
              Permitir microfone
            </Button>
            {mic === 'granted' && <Badge tone="ok">Permitido</Badge>}
            {mic === 'denied' && <Badge tone="bad">Negado: libere nas configurações do sistema</Badge>}
          </div>
        </>
      ),
    },
    {
      icon: <AudioLines />,
      title: 'Palavra de ativação',
      body: (
        <>
          <p>
            Palavra padrão: <strong className="text-emerald-500">“{s.wakeWord}”</strong> (português do Brasil).
          </p>
          <Row label="Sensibilidade" hint="Mais alta reconhece mais fácil, mas pode ativar por engano.">
            <Slider label="Sensibilidade" value={s.sensitivity} onChange={(v) => s.set({ sensitivity: v })} />
          </Row>
          <Row label="Som de confirmação">
            <Toggle
              label="Som de confirmação"
              checked={s.confirmationSound}
              onChange={(v) => s.set({ confirmationSound: v })}
            />
          </Row>
        </>
      ),
    },
    {
      icon: <Check />,
      title: 'Testar reconhecimento',
      body: wakeWord.available ? (
        <>
          <p>Toque em “Começar teste” e diga “{s.wakeWord}”. Se não reconhecer, aumente a sensibilidade no passo anterior.</p>
          <WakeWordTest />
        </>
      ) : (
        <Notice>
          O reconhecimento por voz ainda não está disponível nesta versão. {wakeWord.unavailableReason} Você pode
          seguir e testar depois em Configurações → Diagnóstico.
        </Notice>
      ),
    },
    {
      icon: <MoonStar />,
      title: 'Segundo plano',
      body: (
        <>
          {platform === 'windows' && (
            <p>Ao fechar a janela, o Oi Chat continua na bandeja do Windows, ouvindo.</p>
          )}
          {platform === 'android' && (
            <p>O Oi Chat mostra uma notificação fixa enquanto estiver ouvindo. Ela tem botões para pausar e abrir o ChatGPT.</p>
          )}
          {platform === 'web' && (
            <Notice>No navegador não há execução em segundo plano. Isso funciona nos apps Windows e Android.</Notice>
          )}
          <Row label="Executar em segundo plano">
            <Toggle
              label="Executar em segundo plano"
              disabled={!capabilities.background}
              checked={s.runInBackground}
              onChange={(v) => s.set({ runInBackground: v })}
            />
          </Row>
          <Row label="Iniciar com o sistema">
            <Toggle
              label="Iniciar com o sistema"
              disabled={!capabilities.autoStart}
              checked={s.autoStart}
              onChange={(v) => s.set({ autoStart: v })}
            />
          </Row>
        </>
      ),
    },
    {
      icon: <ExternalLink />,
      title: 'Testar abertura do ChatGPT',
      canNext: chatOpened,
      body: (
        <>
          <p>Vamos confirmar que o ChatGPT oficial abre corretamente.</p>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={async () => {
                const r = await chatGPT.open({ voice: false });
                if (r.status === 'opened') setChatOpened(true);
              }}
            >
              Abrir ChatGPT
            </Button>
            {chatOpened && <Badge tone="ok">Abriu</Badge>}
          </div>
        </>
      ),
    },
    {
      icon: <Smartphone />,
      title: 'Modo de voz',
      body: (
        <>
          <p>
            O Oi Chat abre o ChatGPT, mas <strong>ainda não consegue iniciar o modo de voz sozinho</strong>. Não existe
            um jeito oficial para isso. Depois que o ChatGPT abrir, toque no ícone de voz.
          </p>
          {platform === 'android' && (
            <Notice>
              Opcional: defina o ChatGPT como assistente padrão em Configurações → Apps → Apps padrão → Assistente
              digital. Isso será usado em testes futuros de abertura direta em voz.
            </Notice>
          )}
        </>
      ),
    },
  ];

  const cur = steps[step];
  const last = step === steps.length - 1;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex gap-1.5">
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-800'}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-emerald-500/15 text-emerald-500">
          {cur.icon}
        </span>
        <div>
          <div className="text-xs text-zinc-500">
            Passo {step + 1} de {steps.length}
          </div>
          <h1 className="text-xl font-semibold">{cur.title}</h1>
        </div>
      </div>
      <div className="flex flex-col gap-4 text-sm leading-relaxed">{cur.body}</div>
      <div className="mt-auto flex gap-3">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            Voltar
          </Button>
        )}
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => (last ? s.finishOnboarding() : setStep(step + 1))}
        >
          {last ? 'Concluir' : cur.canNext === false ? 'Pular' : 'Próximo'}
        </Button>
      </div>
    </main>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
      <Info className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
