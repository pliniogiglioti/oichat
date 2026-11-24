import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '../components/ui';
import { WakeWordTest } from '../components/WakeWordTest';
import {
  notificationState,
  queryMicrophone,
  requestMicrophone,
  type PermState,
} from '../services/permissions';
import { WakeWordNative, type AndroidSettingsScreen } from '../services/androidPlugin';
import { desktop, platform, platformLabel } from '../services/platform';
import { wakeWord } from '../services/wakeWord';
import { useUi } from '../stores/uiStore';

type Tone = 'ok' | 'warn' | 'bad' | 'off';
interface Check {
  label: string;
  tone: Tone;
  status: string;
  hint?: string;
  action?: { label: string; run: () => void | Promise<void> };
}

interface BatteryManager {
  charging: boolean;
  level: number;
}

const permTone = (p: PermState): Tone => (p === 'granted' ? 'ok' : p === 'denied' ? 'bad' : 'warn');
const permText: Record<PermState, string> = {
  granted: 'Permitido',
  denied: 'Negado',
  prompt: 'Não solicitado',
  unknown: 'Desconhecido',
};

/** Itens do Android: verificados pelo plugin nativo; o botão leva à tela do sistema certa. */
async function androidChecks(rerun: () => void): Promise<Check[]> {
  const d = await WakeWordNative.diagnostics();
  const open = (which: AndroidSettingsScreen) => async () => {
    await WakeWordNative.openSettings({ which });
    // Ao voltar das configurações, verifica de novo
    const again = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', again);
        rerun();
      }
    };
    document.addEventListener('visibilitychange', again);
  };
  const vendor = d.manufacturer.toLowerCase();
  const vendorHint: Record<string, string> = {
    xiaomi: 'Xiaomi: em Apps → Oi Chat, ative “Início automático” e “Sem restrições” de bateria.',
    samsung: 'Samsung: em Bateria → Apps sem restrição, adicione o Oi Chat.',
    motorola: 'Motorola: em Bateria → Uso de bateria do app, escolha “Sem restrição”.',
    huawei: 'Huawei: em Bateria → Inicialização de apps, gerencie o Oi Chat manualmente.',
  };
  const hint = Object.entries(vendorHint).find(([k]) => vendor.includes(k))?.[1];

  return [
    {
      label: 'Notificações',
      tone: d.notifications === 'granted' ? 'ok' : 'bad',
      status: d.notifications === 'granted' ? 'Permitido' : 'Negado',
      hint: 'A notificação fixa é obrigatória para ouvir em segundo plano.',
      action: d.notifications === 'granted' ? undefined : { label: 'Corrigir', run: open('notifications') },
    },
    {
      label: 'Abrir sobre outros apps',
      tone: d.overlay ? 'ok' : 'warn',
      status: d.overlay ? 'Permitido' : 'Não permitido',
      hint: d.overlay
        ? undefined
        : 'Sem isso, ao ouvir “Oi, Chat” com outro app aberto aparece uma notificação para tocar.',
      action: d.overlay ? undefined : { label: 'Corrigir', run: open('overlay') },
    },
    {
      label: 'Otimização de bateria',
      tone: d.batteryUnrestricted ? 'ok' : 'warn',
      status: d.batteryUnrestricted ? 'Sem restrição' : 'Ativa',
      hint: d.batteryUnrestricted ? undefined : 'O Android pode encerrar a escuta para economizar bateria.',
      action: d.batteryUnrestricted ? undefined : { label: 'Corrigir', run: open('battery') },
    },
    {
      label: 'Ajustes do fabricante',
      tone: hint ? 'warn' : 'off',
      status: d.manufacturer,
      hint: hint ?? 'Nenhum ajuste extra conhecido para este fabricante.',
      action: hint ? { label: 'Abrir ajustes', run: open('app') } : undefined,
    },
    {
      label: 'Bloqueio de tela',
      tone: d.secureLock ? 'warn' : 'ok',
      status: d.secureLock ? 'Com PIN/senha' : 'Sem bloqueio',
      hint: d.secureLock ? 'Com a tela bloqueada, o ChatGPT só aparece depois de desbloquear.' : undefined,
      action: d.secureLock ? { label: 'Ver', run: open('security') } : undefined,
    },
    {
      label: 'Energia',
      tone: d.charging ? 'ok' : 'off',
      status: d.charging ? 'Na tomada' : 'Na bateria',
    },
    {
      label: 'App do ChatGPT',
      tone: d.chatGPTInstalled ? 'ok' : 'off',
      status: d.chatGPTInstalled ? 'Instalado' : 'Não instalado',
      hint: 'Opcional: o Oi Chat abre o ChatGPT dentro do próprio app.',
    },
  ];
}

/** Checklist de diagnóstico. Cada item é verificado de verdade; o que não dá para verificar aparece como tal. */
export function Diagnostics() {
  const go = useUi((s) => s.go);
  const voice = useUi((s) => s.voice);
  const [checks, setChecks] = useState<Check[]>([]);

  const run = useCallback(async () => {
    const mic = await queryMicrophone();
    const notif = platform === 'android' ? null : notificationState();
    const out: Check[] = [
      { label: 'Plataforma', tone: 'ok', status: platformLabel[platform] },
      {
        label: 'Microfone',
        tone: permTone(mic),
        status: permText[mic],
        action: mic !== 'granted' ? { label: 'Permitir', run: async () => { await requestMicrophone(); run(); } } : undefined,
      },
      ...(notif
        ? [
            {
              label: 'Notificações',
              tone: permTone(notif),
              status: permText[notif],
              action:
                notif === 'prompt'
                  ? { label: 'Permitir', run: async () => { await Notification.requestPermission(); run(); } }
                  : undefined,
            } satisfies Check,
          ]
        : []),
      {
        label: 'Reconhecimento “Oi, Chat”',
        tone: wakeWord.available ? 'ok' : 'warn',
        status: wakeWord.available ? 'Pronto' : 'Indisponível',
        hint: wakeWord.unavailableReason,
      },
    ];

    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (nav.getBattery && platform !== 'android') {
      const b = await nav.getBattery();
      out.push({
        label: 'Energia',
        tone: b.charging ? 'ok' : 'warn',
        status: b.charging ? 'Na tomada' : `Na bateria (${Math.round(b.level * 100)}%)`,
        hint: b.charging ? undefined : 'Para o porta-retratos, deixe o aparelho carregando.',
      });
    }

    if (desktop) {
      const logged = useUi.getState().chatLoggedIn;
      out.push({
        label: 'Login no ChatGPT (janela do Oi Chat)',
        tone: logged ? 'ok' : logged === false ? 'warn' : 'off',
        status: logged ? 'Detectado' : logged === false ? 'Não detectado' : 'Ainda não verificado',
        hint:
          logged === undefined || logged === null
            ? 'Verificado quando o ChatGPT abre dentro do Oi Chat.'
            : logged
              ? undefined
              : 'Sem login o modo de voz funciona, mas sem o histórico da sua conta.',
      });
      const installed = await desktop.chatGPTAppInstalled();
      out.push({
        label: 'App do ChatGPT (Windows)',
        tone: installed ? 'ok' : 'off',
        status: installed ? 'Instalado' : 'Não instalado',
        hint: installed ? undefined : 'Sem problema: o ChatGPT abre no navegador padrão.',
      });
    }

    if (platform === 'android') {
      out.push(...(await androidChecks(run)));
    }
    setChecks(out);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <div className="mx-auto max-w-md pb-10">
      <PageHeader title="Diagnóstico" onBack={() => go('settings')} />
      <div className="flex flex-col gap-4 px-4">
        <Card>
          {checks.map((c) => (
            <div key={c.label} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{c.label}</div>
                {c.hint && <div className="text-xs text-zinc-500">{c.hint}</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone={c.tone}>{c.status}</Badge>
                {c.action && (
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={c.action.run}>
                    {c.action.label}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
        {voice.status === 'not-found' && (
          <Card title="Modo de voz automático: botão não encontrado">
            <p className="text-xs text-zinc-500">
              Botões vistos na página do ChatGPT (envie isto para ajustarmos a detecção):
            </p>
            <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-100 p-2 text-xs whitespace-pre-wrap dark:bg-zinc-800">
              {voice.candidates.join('\n') || '(nenhum)'}
            </pre>
          </Card>
        )}
        <Card title="Testar “Oi, Chat”">
          <WakeWordTest />
        </Card>
        <Button onClick={run}>
          <RefreshCw className="size-4" /> Verificar novamente
        </Button>
      </div>
    </div>
  );
}
