import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import { Button } from '../components/ui';
import { useAssistant } from '../stores/assistantStore';
import { useSettings } from '../stores/settingsStore';
import { platform } from '../services/platform';
import { useUi } from '../stores/uiStore';

// No Android a WebView não escolhe pastas: abre o seletor de fotos do sistema (inclui o Google Fotos).
const isAndroid = platform === 'android';

function inNightWindow(start: string, end: string, now = new Date()) {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const n = now.getHours() * 60 + now.getMinutes();
  const s = toMin(start);
  const e = toMin(end);
  return s <= e ? n >= s && n < e : n >= s || n < e;
}

/**
 * Porta-retratos. Mantém a tela acesa e mostra as fotos enquanto o assistente ouve.
 * Na versão web as fotos escolhidas não ficam salvas (limitação do navegador).
 * No Android (Fase 5) a pasta é lembrada via Storage Access Framework.
 */
export function PhotoFrame() {
  const go = useUi((s) => s.go);
  const { intervalSec, nightMode } = useSettings((s) => s.photoFrame);
  const assistant = useAssistant((s) => s.state);
  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [controls, setControls] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const input = useRef<HTMLInputElement>(null);

  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);

  // Troca de foto
  useEffect(() => {
    if (urls.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % urls.length), intervalSec * 1000);
    return () => clearInterval(t);
  }, [urls.length, intervalSec]);

  // Relógio (para o modo noturno)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Tela sempre acesa enquanto o porta-retratos está aberto
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {
        /* sem suporte ou negado */
      }
    };
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release();
    };
  }, []);

  // Esconde os controles depois de alguns segundos
  useEffect(() => {
    if (!controls || urls.length === 0) return;
    const t = setTimeout(() => setControls(false), 4000);
    return () => clearTimeout(t);
  }, [controls, urls.length]);

  const night = nightMode.enabled && inNightWindow(nightMode.start, nightMode.end, now);
  const dot =
    assistant === 'listening' ? 'bg-emerald-400' : assistant === 'error' ? 'bg-rose-500' : 'bg-zinc-500';

  return (
    <div className="page-in-right fixed inset-0 bg-black text-white" onClick={() => setControls(true)}>
      {night ? (
        <div className="grid h-full place-items-center text-5xl font-light text-zinc-700">
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      ) : urls.length > 0 ? (
        <img key={index} src={urls[index]} alt="" className="photo-fade h-full w-full object-contain" />
      ) : (
        <div className="grid h-full place-items-center p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <p className="text-zinc-400">
              {isAndroid ? 'Escolha as fotos para começar.' : 'Escolha uma pasta com fotos para começar.'}
            </p>
            <Button variant="primary" onClick={() => input.current?.click()}>
              <FolderOpen className="size-4" /> {isAndroid ? 'Escolher fotos' : 'Escolher pasta'}
            </Button>
            {isAndroid && (
              <p className="max-w-xs text-xs text-zinc-500">
                No seletor do Android aparecem as fotos do aparelho e, se o Google Fotos estiver ligado no celular, as
                da nuvem também. Toque e segure para escolher várias.
              </p>
            )}
          </div>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        {...(isAndroid ? {} : { webkitdirectory: '' })}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
          setFiles(list);
          setIndex(0);
        }}
      />

      {/* Indicador discreto do assistente */}
      <span
        className={`absolute size-3 rounded-full ${dot} shadow-lg`}
        style={{ right: 'calc(var(--sar) + 1rem)', bottom: 'calc(var(--sab) + 1rem)' }}
        title={assistant}
      />

      {controls && (
        <div
          className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-4 pb-3"
          style={{ paddingTop: 'calc(var(--sat) + 0.75rem)', paddingLeft: 'calc(var(--sal) + 1rem)', paddingRight: 'calc(var(--sar) + 1rem)' }}
        >
          {/* Mesmo cabeçalho das Configurações: seta de voltar + título */}
          <Button
            variant="ghost"
            className="px-2 text-white hover:bg-white/10"
            aria-label="Voltar"
            onClick={(e) => {
              e.stopPropagation();
              go('home');
            }}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="flex-1 text-lg font-semibold">Porta-retratos</h1>
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => input.current?.click()}>
            <FolderOpen className="size-4" /> {isAndroid ? 'Fotos' : 'Pasta'}
          </Button>
        </div>
      )}
    </div>
  );
}
