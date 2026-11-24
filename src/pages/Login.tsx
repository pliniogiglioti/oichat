import { useState } from 'react';
import { ExternalLink, Lock, Mic, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui';
import { chatGPT } from '../services/chatGPT';
import { useSettings } from '../stores/settingsStore';

/** Boas-vindas + login no ChatGPT oficial (seção 1). O app nunca vê credenciais. */
export function Login() {
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
