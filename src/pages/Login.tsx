import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Download, ExternalLink, Lock, LogIn, Mic, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui';
import { WakeWordNative } from '../services/androidPlugin';
import { chatGPT } from '../services/chatGPT';
import { platform } from '../services/platform';
import { useSettings } from '../stores/settingsStore';

/** Boas-vindas + login no ChatGPT oficial (seção 1). O app nunca vê credenciais. */
export function Login() {
  return platform === 'android' ? <AndroidLogin /> : <DefaultLogin />;
}

/**
 * Android: o login com Google só funciona no app oficial do ChatGPT.
 * Passo 1: instalar o app. Passo 2: o usuário faz login nele. O Oi Chat não vê nada disso.
 */
function AndroidLogin() {
  const confirmLogin = useSettings((s) => s.confirmLogin);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [openedApp, setOpenedApp] = useState(false);

  useEffect(() => {
    const check = () => void WakeWordNative.chatGPTApp().then((r) => setInstalled(r.installed)).catch(() => setInstalled(false));
    check();
    // Volta da Play Store / do ChatGPT: confere de novo.
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const step = (n: number, done: boolean, title: string, text: string, action?: ReactNode) => (
    <li className="flex gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      {done ? (
        <CheckCircle2 className="size-6 shrink-0 text-emerald-500" />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-bold text-white">{n}</span>
      )}
      <div className="flex flex-1 flex-col gap-2">
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
        {action}
      </div>
    </li>
  );

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={80} />
        <h1 className="text-3xl font-bold">Oi Chat</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Diga <strong className="text-emerald-500">“Oi, Chat”</strong> e o ChatGPT abre para você conversar por voz.
          Antes, prepare o app oficial do ChatGPT:
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {step(
          1,
          installed === true,
          'Instale o app do ChatGPT',
          installed ? 'App do ChatGPT instalado.' : 'O Oi Chat usa o app oficial do ChatGPT (da OpenAI), da Play Store.',
          !installed && (
            <Button variant="primary" onClick={() => void WakeWordNative.installChatGPTApp()}>
              <Download className="size-4" /> Instalar na Play Store
            </Button>
          ),
        )}
        {step(
          2,
          false,
          'Faça login no ChatGPT',
          'Abra o app do ChatGPT e entre com a sua conta (Google ou e-mail). Depois volte para o Oi Chat. É só uma vez.',
          installed && (
            <Button
              variant={openedApp ? 'ghost' : 'primary'}
              onClick={() => void WakeWordNative.openChatGPTApp().then((r) => setOpenedApp(r.opened))}
            >
              <LogIn className="size-4" /> {openedApp ? 'Abrir o ChatGPT de novo' : 'Abrir o ChatGPT para fazer login'}
            </Button>
          ),
        )}
      </ol>

      <p className="flex gap-2 text-xs text-zinc-500">
        <ShieldCheck className="size-4 shrink-0" />
        O login é feito no app oficial. O Oi Chat não vê sua senha, cookies nem tokens, e o reconhecimento de “Oi, Chat” é
        local, sem gravar nada.
      </p>

      <Button variant="primary" className="py-3.5 text-base" disabled={!installed} onClick={confirmLogin}>
        Já fiz login, continuar
      </Button>
    </main>
  );
}

function DefaultLogin() {
  const confirmLogin = useSettings((s) => s.confirmLogin);
  const [opened, setOpened] = useState(false);

  const open = async () => {
    await chatGPT.open({ voice: false });
    setOpened(true);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={88} />
        <h1 className="text-3xl font-bold">Oi Chat</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Diga <strong className="text-emerald-500">“Oi, Chat”</strong> e o ChatGPT oficial abre para você
          conversar por voz.
        </p>
      </div>

      <ol className="flex flex-col gap-3 text-sm">
        <li className="flex gap-3">
          <Mic className="size-5 shrink-0 text-emerald-500" />
          <span>O Oi Chat fica ouvindo apenas a palavra de ativação, direto no seu aparelho.</span>
        </li>
        <li className="flex gap-3">
          <ExternalLink className="size-5 shrink-0 text-emerald-500" />
          <span>Ao reconhecer, ele libera o microfone e abre o ChatGPT oficial (app ou navegador).</span>
        </li>
      </ol>

      <div className="rounded-2xl border border-zinc-200 p-4 text-xs text-zinc-500 dark:border-zinc-800">
        <div className="mb-2 flex items-center gap-2 font-semibold text-zinc-700 dark:text-zinc-300">
          <ShieldCheck className="size-4" /> Privacidade
        </div>
        <ul className="list-disc space-y-1 pl-4">
          <li>O reconhecimento é local: o áudio não é enviado para servidores.</li>
          <li>Nenhuma gravação é armazenada.</li>
          <li>O login é feito no site ou app oficial do ChatGPT. O Oi Chat não vê sua senha, cookies ou tokens.</li>
          <li>Configurações ficam salvas só neste aparelho.</li>
        </ul>
      </div>

      {!opened ? (
        <Button variant="primary" className="py-3.5 text-base" onClick={open}>
          <Lock className="size-4" /> Continuar com ChatGPT
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-zinc-500">
            Faça login no ChatGPT que acabou de abrir e volte aqui.
          </p>
          <Button variant="primary" className="py-3.5 text-base" onClick={confirmLogin}>
            Já fiz login, continuar
          </Button>
          <Button variant="ghost" onClick={open}>
            Abrir o ChatGPT de novo
          </Button>
        </div>
      )}
    </main>
  );
}
