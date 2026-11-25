import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAssistant } from '../stores/assistantStore';
import { useMicLevel } from '../stores/micLevelStore';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-emerald-300/60',
  secondary:
    'bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700',
  ghost: 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      {title && (
        <h2 className="mb-3 text-xs font-semibold tracking-wider text-zinc-500 uppercase">{title}</h2>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-36 accent-emerald-500"
    />
  );
}

export function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    // Fica colado no topo da tela, mas com o conteúdo abaixo da barra de status do Android.
    <header
      className="sticky top-0 z-10 flex items-center gap-2 bg-zinc-50/90 px-4 pb-3 backdrop-blur dark:bg-[#0a0a0f]/90"
      style={{ marginTop: 'calc(-1 * var(--sat))', paddingTop: 'calc(var(--sat) + 0.75rem)' }}
    >
      <Button variant="ghost" onClick={onBack} aria-label="Voltar" className="px-2">
        <ArrowLeft className="size-5" />
      </Button>
      <h1 className="flex-1 text-lg font-semibold">{title}</h1>
      <ListeningDot />
    </header>
  );
}

/** Mostra, fora da tela principal, que o Oi Chat continua ouvindo (pulsa com o som). */
function ListeningDot() {
  const state = useAssistant((s) => s.state);
  const level = useMicLevel((s) => s.level);
  if (state !== 'listening') return null;
  return (
    <span className="flex items-center gap-2 pr-1 text-xs text-emerald-500" title="Ouvindo “Oi, Chat”">
      <span className="relative grid size-4 place-items-center">
        <span
          className="absolute inset-0 rounded-full bg-emerald-400/40 transition-transform duration-100"
          style={{ transform: `scale(${1 + level * 1.5})` }}
        />
        <span className="relative size-2.5 rounded-full bg-emerald-400" />
      </span>
      Ouvindo
    </span>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'off'; children: ReactNode }) {
  const tones = {
    ok: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    bad: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    off: 'bg-zinc-500/15 text-zinc-500',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
