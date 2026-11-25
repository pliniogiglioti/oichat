import { Mic, MicOff, AlertTriangle, ExternalLink, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMicLevel } from '../stores/micLevelStore';
import type { AssistantState } from '../types';

const palette: Record<AssistantState, { core: string; glow: string }> = {
  disabled: { core: 'from-zinc-600 to-zinc-800', glow: 'bg-zinc-500/0' },
  listening: { core: 'from-emerald-400 to-teal-700', glow: 'bg-emerald-400/40' },
  detected: { core: 'from-sky-300 to-indigo-600', glow: 'bg-sky-400/50' },
  opening: { core: 'from-sky-400 to-indigo-700', glow: 'bg-indigo-400/40' },
  released: { core: 'from-violet-400 to-fuchsia-700', glow: 'bg-violet-400/30' },
  error: { core: 'from-rose-400 to-red-800', glow: 'bg-rose-500/40' },
};

const icon: Record<AssistantState, ReactNode> = {
  disabled: <MicOff className="size-12" />,
  listening: <Mic className="size-12" />,
  detected: <Check className="size-12" />,
  opening: <ExternalLink className="size-12" />,
  released: <MicOff className="size-12" />,
  error: <AlertTriangle className="size-12" />,
};

export function Orb({ state, onClick }: { state: AssistantState; onClick?: () => void }) {
  const c = palette[state];
  const pulsing = state === 'listening';
  // Cresce com o som que chega ao microfone: mostra que o Oi Chat está ouvindo de verdade.
  const raw = useMicLevel((s) => s.level);
  const level = pulsing ? raw : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ativar ou pausar o assistente"
      className="relative grid size-56 place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50 sm:size-64"
    >
      {pulsing && (
        <>
          <span className={`orb-ring absolute inset-6 rounded-full ${c.glow}`} />
          <span className={`orb-ring delay absolute inset-6 rounded-full ${c.glow}`} />
        </>
      )}
      <span
        className={`absolute inset-4 rounded-full blur-2xl transition-transform duration-100 ${c.glow}`}
        style={{ transform: `scale(${1 + level * 0.2})`, opacity: pulsing ? 0.6 + level * 0.4 : undefined }}
      />
      {state === 'opening' && (
        <span className="orb-spin absolute inset-2 rounded-full border-4 border-transparent border-t-sky-300/80" />
      )}
      <span className="relative grid place-items-center transition-transform duration-100 ease-out" style={{ transform: `scale(${1 + level * 0.12})` }}>
        <span
          key={state}
          className={[
            'grid size-40 place-items-center rounded-full bg-gradient-to-br text-white shadow-2xl transition-colors duration-500 sm:size-44',
            c.core,
            state === 'listening' ? 'orb-breathe' : '',
            state === 'detected' ? 'orb-pop' : '',
          ].join(' ')}
        >
          {icon[state]}
        </span>
      </span>
    </button>
  );
}
