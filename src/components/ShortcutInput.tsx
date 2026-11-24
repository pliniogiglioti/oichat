import { useState, type KeyboardEvent } from 'react';

/** Converte a tecla do evento no nome usado pelos atalhos do Electron. */
function keyName(e: KeyboardEvent): string | null {
  const k = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return null;
  if (k === ' ') return 'Space';
  if (/^F\d{1,2}$/.test(k)) return k;
  if (k.length === 1) return k.toUpperCase();
  const map: Record<string, string> = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Enter: 'Enter', Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Insert: 'Insert', Delete: 'Delete',
  };
  return map[k] ?? null;
}

/** Campo que grava a combinação de teclas pressionada (ex.: Ctrl+Alt+Space). Esc cancela, Backspace limpa. */
export function ShortcutInput({
  value,
  onChange,
  disabled,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [recording, setRecording] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.key === 'Escape') return e.currentTarget.blur();
    if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey) {
      onChange('');
      return e.currentTarget.blur();
    }
    const key = keyName(e);
    if (!key) return;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    if (mods.length === 0) return; // exige ao menos um modificador
    onChange([...mods, key].join('+'));
    e.currentTarget.blur();
  };

  return (
    <input
      readOnly
      disabled={disabled}
      aria-label="Atalho global"
      className={`${className} cursor-pointer text-center ${recording ? 'ring-2 ring-emerald-500' : ''}`}
      value={recording ? 'Pressione as teclas…' : value || 'Nenhum'}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={onKeyDown}
    />
  );
}
