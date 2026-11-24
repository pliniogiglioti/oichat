import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, X } from 'lucide-react';
import { Button } from '../components/ui';
import { useAssistant } from '../stores/assistantStore';
import { useSettings } from '../stores/settingsStore';
import { useUi } from '../stores/uiStore';

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
    <div className="fixed inset-0 bg-black text-white" onClick={() => setControls(true)}>
      {night ? (
        <div className="grid h-full place-items-center text-5xl font-light text-zinc-700">
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      ) : urls.length > 0 ? (
        <img key={index} src={urls[index]} alt="" className="photo-fade h-full w-full object-contain" />
      ) : (
        <div className="grid h-full place-items-center p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <p className="text-zinc-400">Escolha uma pasta com fotos para começar.</p>
            <Button variant="primary" onClick={() => input.current?.click()}>
              <FolderOpen className="size-4" /> Escolher pasta
            </Button>
          </div>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        {...{ webkitdirectory: '' }}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
          setFiles(list);
          setIndex(0);
        }}
      />

      {/* Indicador discreto do assistente */}
      <span className={`absolute right-4 bottom-4 size-3 rounded-full ${dot} shadow-lg`} title={assistant} />

      {controls && (
        <div className="absolute inset-x-0 top-0 flex justify-between bg-gradient-to-b from-black/70 to-transparent p-4">
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => input.current?.click()}>
            <FolderOpen className="size-4" /> Pasta
          </Button>
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10"
            aria-label="Sair do porta-retratos"
            onClick={(e) => {
              e.stopPropagation();
              go('home');
            }}
          >
            <X className="size-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
