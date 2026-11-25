import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mic, Square } from 'lucide-react';
import { wakeWord } from '../services/wakeWord';
import { useAssistant } from '../stores/assistantStore';
import { useMicLevel } from '../stores/micLevelStore';
import { useSettings } from '../stores/settingsStore';
import { useUi } from '../stores/uiStore';
import { Badge, Button } from './ui';

type Phase = 'idle' | 'loading' | 'listening' | 'ok' | 'error';

/** Bolinha que pulsa com o som + barra de volume. Avisa se nada chegar ao microfone. */
function MicMeter() {
  const level = useMicLevel((s) => s.level);
  const [silent, setSilent] = useState(false);
  const lastSound = useRef(Date.now());

  useEffect(() => {
    if (level > 0.08) {
      lastSound.current = Date.now();
      setSilent(false);
    }
  }, [level]);
  useEffect(() => {
    const t = setInterval(() => setSilent(Date.now() - lastSound.current > 4000), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative grid size-28 place-items-center">
        <span
          className="absolute inset-0 rounded-full bg-emerald-400/30 blur-xl transition-transform duration-100"
          style={{ transform: `scale(${0.6 + level * 0.8})` }}
        />
        <span
          className="relative grid size-20 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-700 text-white shadow-xl transition-transform duration-100 ease-out"
          style={{ transform: `scale(${1 + level * 0.35})` }}
        >
          <Mic className="size-8" />
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-label="Volume do microfone">
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      {silent && (
        <p className="text-center text-xs text-amber-500">
          Nenhum som chegando ao microfone. Confira se ele está ligado e liberado.
        </p>
      )}
    </div>
  );
}

/**
 * Teste do reconhecimento: ouve até reconhecer a palavra e mostra o que foi entendido.
 * Pausa o assistente durante o teste para não disputar o microfone.
 */
export function WakeWordTest() {
  const { wakeWord: word, sensitivity, microphoneId } = useSettings();
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const running = useRef(false);
  const setTesting = (v: boolean) => {
    running.current = v;
    useUi.setState({ micTestRunning: v });
  };

  useEffect(() => {
    const offHeard = wakeWord.onHeard((t) => running.current && setHeard(t.replace(/\[unk\]/g, '…')));
    const offDet = wakeWord.onDetected((mode) => {
      if (!running.current || mode !== 'wake') return;
      setPhase('ok');
      wakeWord.stop().then(() => setTesting(false));
    });
    return () => {
      offHeard();
      offDet();
      if (running.current) wakeWord.stop().then(() => setTesting(false));
    };
  }, []);

  if (!wakeWord.available) {
    return <Badge tone="warn">{wakeWord.unavailableReason}</Badge>;
  }

  const start = async () => {
    setTesting(true); // marca antes de parar, para o assistente não religar no meio do teste
    await useAssistant.getState().disable();
    setHeard('');
    setError('');
    setPhase('loading');
    try {
      await wakeWord.start({ sensitivity, deviceId: microphoneId || undefined, test: true });
      if (running.current) setPhase('listening');
    } catch (e) {
      setTesting(false);
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const stop = async () => {
    await wakeWord.stop();
    setTesting(false);
    setPhase('idle');
  };

  return (
    <div className="flex flex-col gap-3">
      {phase === 'listening' || phase === 'loading' ? (
        <Button onClick={stop}>
          <Square className="size-4" /> Parar teste
        </Button>
      ) : (
        <Button variant="primary" onClick={start}>
          <Mic className="size-4" /> {phase === 'ok' ? 'Testar de novo' : 'Começar teste'}
        </Button>
      )}

      {phase === 'loading' && (
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Carregando modelo de voz (na 1ª vez baixa ~31 MB)…
        </div>
      )}
      {phase === 'listening' && (
        <>
          <MicMeter />
          <p>
            Diga <strong className="text-emerald-500">“{word}”</strong> agora.
          </p>
        </>
      )}
      {phase === 'ok' && (
        <div className="flex items-center gap-2 font-medium text-emerald-500">
          <CheckCircle2 className="size-5" /> Reconhecido!
        </div>
      )}
      {phase === 'error' && <Badge tone="bad">{error}</Badge>}
      {heard && phase !== 'idle' && <p className="text-xs text-zinc-500">Entendido: “{heard}”</p>}
    </div>
  );
}
