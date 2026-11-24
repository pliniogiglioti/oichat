import { useEffect } from 'react';
import { create } from 'zustand';
import { desktop } from '../services/platform';
import type { ApplySettingsResult } from '../shared/desktopApi';
import { useAssistant } from '../stores/assistantStore';
import { useSettings } from '../stores/settingsStore';
import { useUi } from '../stores/uiStore';

/** Resultado da última aplicação de configurações no Windows (atalho, autostart). */
export const useDesktopStatus = create<{ result: ApplySettingsResult | null }>()(() => ({ result: null }));

/** Liga o renderer ao processo principal do Electron. Sem efeito fora do Windows. */
export function useDesktopBridge(ready: boolean) {
  useEffect(() => {
    if (!desktop || !ready) return;

    // Estado do assistente → ícone/menu da bandeja
    desktop.setAssistantState(useAssistant.getState().state);
    const offState = useAssistant.subscribe((s, prev) => {
      if (s.state !== prev.state) desktop!.setAssistantState(s.state);
    });

    // Configurações → atalho global, autostart, segundo plano
    let last = '';
    const apply = () => {
      const { autoStart, runInBackground, globalShortcut, preferChatGPTApp, chatGPTMode, autoVoice, greeting } =
        useSettings.getState();
      const payload = {
        autoStart,
        runInBackground,
        globalShortcut,
        preferChatGPTApp,
        chatGPTMode,
        autoVoice,
        greeting,
      };
      const key = JSON.stringify(payload);
      if (key === last) return;
      last = key;
      desktop!.applySettings(payload).then((result) => useDesktopStatus.setState({ result }));
    };
    apply();
    const offSettings = useSettings.subscribe(apply);

    // Comandos da bandeja e do atalho global
    const offCmd = desktop.onCommand((cmd) => {
      const a = useAssistant.getState();
      if (cmd === 'toggle') a.toggle();
      else if (cmd === 'resume') a.resume();
      else if (cmd === 'open-chatgpt') a.openChatGPT();
      else if (cmd === 'settings') useUi.getState().go('settings');
    });

    // Eventos do ChatGPT embutido
    const offEvent = desktop.onEvent((ev) => {
      if (ev.type === 'voice') {
        useUi.setState({ voice: ev.voice });
        if (ev.voice.status === 'not-found') {
          console.warn('[oichat] botão de voz não encontrado. Botões vistos:', ev.voice.candidates);
        }
      } else if (ev.type === 'chatgpt-login') {
        useUi.setState({ chatLoggedIn: ev.loggedIn });
        // Na tela de boas-vindas: login detectado → segue sozinho para a configuração.
        if (ev.loggedIn && !useSettings.getState().loginConfirmed) {
          setTimeout(() => {
            useSettings.getState().confirmLogin();
            desktop!.closeChatGPT();
          }, 1500);
        }
      } else if (ev.type === 'chatgpt-view') {
        // O último status de voz é mantido para aparecer no Diagnóstico.
        useUi.setState({ chatEmbedded: ev.open });
        // Conversa terminou ("Tchau, Chat", fim da voz ou Fechar): o painel volta para a bandeja.
        // Durante a configuração inicial ele continua aberto.
        const s = useSettings.getState();
        if (!ev.open && s.loginConfirmed && s.onboardingDone) {
          useUi.getState().go('home');
          desktop!.hidePanel();
        }
        // Fechado por outro caminho (bandeja etc.): volta a ouvir
        if (!ev.open && useAssistant.getState().state === 'released') useAssistant.getState().enable();
      }
    });

    return () => {
      offState();
      offSettings();
      offCmd();
      offEvent();
    };
  }, [ready]);
}
