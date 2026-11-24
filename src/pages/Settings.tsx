import { useEffect, useState } from 'react';
import { ExternalLink, RotateCcw, Stethoscope } from 'lucide-react';
import { ShortcutInput } from '../components/ShortcutInput';
import { Button, Card, PageHeader, Row, Slider, Toggle } from '../components/ui';
import { useDesktopStatus } from '../hooks/useDesktopBridge';
import { listMicrophones } from '../services/permissions';
import { capabilities, platformLabel, platform } from '../services/platform';
import { playConfirmation } from '../services/sound';
import { useAssistant } from '../stores/assistantStore';
import { useSettings } from '../stores/settingsStore';
import { useUi } from '../stores/uiStore';

const onlyOn = (what: string) => `Disponível no app ${what}`;

export function Settings() {
  const s = useSettings();
  const go = useUi((u) => u.go);
  const openChatGPT = useAssistant((a) => a.openChatGPT);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const desktopStatus = useDesktopStatus((d) => d.result);

  useEffect(() => {
    if (capabilities.microphoneSelection) listMicrophones().then(setMics);
  }, []);

  const select =
    'rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

  return (
    <div className="mx-auto max-w-md pb-10">
      <PageHeader title="Configurações" onBack={() => go('home')} />
      <div className="flex flex-col gap-4 px-4">
        <Card title="Voz">
          <Row label="Palavra de ativação" hint="Reconhecimento offline (Vosk)">
            <span className="text-sm font-medium text-emerald-500">“{s.wakeWord}”</span>
          </Row>
          <Row
            label="Sensibilidade"
            hint={`${Math.round(s.sensitivity * 100)}% · acima de 80% reage mais rápido, com mais falsos alarmes`}
          >
            <Slider label="Sensibilidade" value={s.sensitivity} onChange={(v) => s.set({ sensitivity: v })} />
          </Row>
          <Row label="Som de confirmação">
            <Toggle
              label="Som de confirmação"
              checked={s.confirmationSound}
              onChange={(v) => s.set({ confirmationSound: v })}
            />
          </Row>
          <Row label="Volume" hint={`${Math.round(s.volume * 100)}%`}>
            <Slider
              label="Volume"
              value={s.volume}
              onChange={(v) => s.set({ volume: v })}
            />
          </Row>
          <Button variant="ghost" className="self-start" onClick={() => playConfirmation(s.volume)}>
            Testar som
          </Button>
          <Row label="Voltar a ouvir após a conversa" hint="Automático quando possível">
            <select
              className={select}
              value={s.autoResumeAfterSec}
              onChange={(e) => s.set({ autoResumeAfterSec: Number(e.target.value) })}
            >
              <option value={0}>Manual</option>
              <option value={60}>Após 1 min</option>
              <option value={180}>Após 3 min</option>
              <option value={300}>Após 5 min</option>
            </select>
          </Row>
          {capabilities.microphoneSelection && (
            <Row label="Microfone">
              <select
                className={`${select} max-w-44`}
                value={s.microphoneId}
                onChange={(e) => s.set({ microphoneId: e.target.value })}
              >
                <option value="">Padrão do sistema</option>
                {mics.map((m, i) => (
                  <option key={m.deviceId || i} value={m.deviceId}>
                    {m.label || `Microfone ${i + 1}`}
                  </option>
                ))}
              </select>
            </Row>
          )}
        </Card>

        <Card title="Aparência">
          <Row label="Tema escuro">
            <Toggle
              label="Tema escuro"
              checked={s.theme === 'dark'}
              onChange={(v) => s.set({ theme: v ? 'dark' : 'light' })}
            />
          </Row>
        </Card>

        <Card title={`Sistema · ${platformLabel[platform]}`}>
          <Row label="Executar em segundo plano" hint={capabilities.background ? undefined : onlyOn('Windows/Android')}>
            <Toggle
              label="Executar em segundo plano"
              disabled={!capabilities.background}
              checked={s.runInBackground}
              onChange={(v) => s.set({ runInBackground: v })}
            />
          </Row>
          <Row label="Iniciar com o sistema" hint={capabilities.autoStart ? undefined : onlyOn('Windows/Android')}>
            <Toggle
              label="Iniciar com o sistema"
              disabled={!capabilities.autoStart}
              checked={s.autoStart}
              onChange={(v) => s.set({ autoStart: v })}
            />
          </Row>
          {desktopStatus?.autoStartReason && s.autoStart && (
            <p className="-mt-2 text-xs text-amber-500">{desktopStatus.autoStartReason}</p>
          )}
          {platform === 'android' && (
            <>
              <Row
                label="Iniciar modo de voz sozinho"
                hint="Experimental: clica no botão de voz do ChatGPT. Pode parar se o site mudar."
              >
                <Toggle label="Iniciar modo de voz sozinho" checked={s.autoVoice} onChange={(v) => s.set({ autoVoice: v })} />
              </Row>
              {s.autoVoice && (
                <Row label="Mensagem ao abrir" hint="Experimental: enviada quando a voz liga. Vazio = não enviar.">
                  <input
                    className={`${select} w-36`}
                    value={s.greeting}
                    maxLength={200}
                    placeholder="(nenhuma)"
                    onChange={(e) => s.set({ greeting: e.target.value })}
                  />
                </Row>
              )}
            </>
          )}
          {platform === 'windows' && (
            <>
              <Row label="Abrir o ChatGPT dentro do Oi Chat" hint="Desligado: abre no app do ChatGPT ou no navegador">
                <Toggle
                  label="Abrir o ChatGPT dentro do Oi Chat"
                  checked={s.chatGPTMode === 'embedded'}
                  onChange={(v) => s.set({ chatGPTMode: v ? 'embedded' : 'external' })}
                />
              </Row>
              {s.chatGPTMode === 'embedded' ? (
                <>
                  <Row
                    label="Iniciar modo de voz sozinho"
                    hint="Experimental: clica no botão de voz do ChatGPT. Pode parar se o site mudar."
                  >
                    <Toggle
                      label="Iniciar modo de voz sozinho"
                      checked={s.autoVoice}
                      onChange={(v) => s.set({ autoVoice: v })}
                    />
                  </Row>
                  {s.autoVoice && (
                    <Row
                      label="Mensagem ao abrir"
                      hint="Experimental: enviada quando a voz liga. Vazio = não enviar."
                    >
                      <input
                        className={`${select} w-36`}
                        value={s.greeting}
                        maxLength={200}
                        placeholder="(nenhuma)"
                        onChange={(e) => s.set({ greeting: e.target.value })}
                      />
                    </Row>
                  )}
                  <Row
                    label="“Tchau, Chat” fecha e volta a ouvir"
                    hint="Durante a conversa o Oi Chat ouve só essa frase. Nada é gravado."
                  >
                    <Toggle
                      label="Tchau Chat fecha e volta a ouvir"
                      checked={s.goodbyeEnabled}
                      onChange={(v) => s.set({ goodbyeEnabled: v })}
                    />
                  </Row>
                </>
              ) : (
                <Row label="Usar o app do ChatGPT" hint="Se instalado; senão abre no navegador">
                  <Toggle
                    label="Usar o app do ChatGPT"
                    checked={s.preferChatGPTApp}
                    onChange={(v) => s.set({ preferChatGPTApp: v })}
                  />
                </Row>
              )}
            </>
          )}
          {platform !== 'android' && (
            <Row
              label="Atalho global"
              hint={
                !capabilities.globalShortcut
                  ? onlyOn('Windows')
                  : desktopStatus && !desktopStatus.shortcutOk
                    ? 'Atalho em uso por outro programa. Escolha outro.'
                    : 'Abre o ChatGPT. Clique e pressione as teclas.'
              }
            >
              <ShortcutInput
                className={`${select} w-40`}
                value={s.globalShortcut}
                disabled={!capabilities.globalShortcut}
                onChange={(v) => s.set({ globalShortcut: v })}
              />
            </Row>
          )}
          {platform !== 'windows' && (
            <Row label="Vibração" hint={capabilities.vibration ? undefined : onlyOn('Android')}>
              <Toggle
                label="Vibração"
                disabled={!capabilities.vibration}
                checked={s.vibration}
                onChange={(v) => s.set({ vibration: v })}
              />
            </Row>
          )}
        </Card>

        {capabilities.photoFrame && (
          <Card title="Porta-retratos">
            <Row label="Abrir no porta-retratos" hint="Ao iniciar o app">
              <Toggle
                label="Abrir no porta-retratos"
                checked={s.photoFrame.enabled}
                onChange={(v) => s.setPhotoFrame({ enabled: v })}
              />
            </Row>
            <Row label="Trocar foto a cada">
              <select
                className={select}
                value={s.photoFrame.intervalSec}
                onChange={(e) => s.setPhotoFrame({ intervalSec: Number(e.target.value) })}
              >
                {[5, 10, 20, 30, 60, 300].map((n) => (
                  <option key={n} value={n}>
                    {n < 60 ? `${n} s` : `${n / 60} min`}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Modo noturno" hint="Escurece a tela e continua ouvindo">
              <Toggle
                label="Modo noturno"
                checked={s.photoFrame.nightMode.enabled}
                onChange={(v) => s.setPhotoFrame({ nightMode: { ...s.photoFrame.nightMode, enabled: v } })}
              />
            </Row>
            {s.photoFrame.nightMode.enabled && (
              <Row label="Horário">
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    className={select}
                    value={s.photoFrame.nightMode.start}
                    onChange={(e) =>
                      s.setPhotoFrame({ nightMode: { ...s.photoFrame.nightMode, start: e.target.value } })
                    }
                  />
                  até
                  <input
                    type="time"
                    className={select}
                    value={s.photoFrame.nightMode.end}
                    onChange={(e) =>
                      s.setPhotoFrame({ nightMode: { ...s.photoFrame.nightMode, end: e.target.value } })
                    }
                  />
                </div>
              </Row>
            )}
          </Card>
        )}

        <Card title="Ferramentas">
          <Button onClick={() => go('diagnostics')}>
            <Stethoscope className="size-4" /> Diagnóstico de permissões
          </Button>
          <Button onClick={openChatGPT}>
            <ExternalLink className="size-4" /> Abrir ChatGPT
          </Button>
          <Button
            variant="ghost"
            onClick={() => useSettings.setState({ onboardingDone: false })}
          >
            <RotateCcw className="size-4" /> Refazer configuração inicial
          </Button>
        </Card>
      </div>
    </div>
  );
}
