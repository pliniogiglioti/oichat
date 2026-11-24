# Oi Chat

Assistente de voz para Windows e Android. Ao ouvir **“Oi, Chat”**, abre o **ChatGPT oficial** dentro do próprio app e tenta ligar o modo de voz. Ao ouvir **“Tchau, Chat”** (ou quando a conversa por voz termina), fecha e volta a ouvir.

Não usa a API da OpenAI e não lê senhas, cookies nem tokens: o login é feito no site oficial.

## Status

| Fase | Descrição | Status |
|---|---|---|
| 1 | Estrutura do projeto e interface | ✅ |
| 2 | Onboarding e abertura do ChatGPT oficial | ✅ |
| 3 | Palavra de ativação local (Vosk, offline) | ✅ Web/Windows testado com microfone real; Android testado no emulador sem fala real |
| 4 | Windows (Electron): painel da bandeja, IPC seguro | ✅ Testado pelo usuário |
| 5 | Android (Capacitor + Kotlin, Foreground Service) | ✅ Compila e funciona no emulador; falta teste com fala real e celular |
| 6 | Modo de voz automático | 🧪 Experimental: funciona no Windows clicando no botão da página |
| 7 | Bateria, permissões, estabilidade | ⏳ |
| 8 | Instaladores EXE e APK | ⏳ EXE configurado (`npm run build:win`); APK de debug gerado |

Pendentes: porta-retratos nativo do Android (pasta lembrada, abrir no boot / Tela Inicial), instalador EXE testado, APK de release assinado.

## Comandos

```bash
npm install
npm run dev             # web (desenvolvimento): http://localhost:5173
npm run build           # checa tipos e gera dist/
npm run models          # baixa o modelo de voz pt-BR (web e Android)
npm run icons           # gera os ícones (Windows e Android)

npm run electron:dev    # Windows com recarga ao vivo
npm run electron:start  # Windows com o build de produção, sem instalar
npm run build:win       # instalador em release/OiChat-Setup-<versão>.exe

npm run cap:sync        # build web + sincroniza com o projeto Android
npm run android:open    # abre no Android Studio
npm run android:apk     # gera android/app/build/outputs/apk/debug/app-debug.apk
```

O Gradle do projeto Android foi atualizado para 9.2.1 para funcionar com o Java 25 do Android Studio. Para compilar fora dele: `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr`.

## Reconhecimento de voz: Vosk

O cadastro da Picovoice (Porcupine, previsto na especificação) passou a exigir e-mail corporativo. O projeto usa o **Vosk**: código aberto, sem conta, 100% offline.

- Modelo oficial `vosk-model-small-pt-0.3` (pt-BR, ~31 MB), baixado por `npm run models`.
- Gramática fechada: só conhece `oi chat` / `oi chá` / `oi xá` (mesmo som) ou `tchau chat` e variações; o resto vira `[unk]`. Nada é gravado.
- Web/Windows: `vosk-browser` (WebAssembly) — [src/services/voskEngine.ts](src/services/voskEngine.ts). Android: `vosk-android` nativo — [WakeWordService.kt](android/app/src/main/java/com/oichat/app/WakeWordService.kt).
- Sensibilidade: o Vosk não tem esse parâmetro; é aproximada pela confiança mínima das palavras.

## Windows (Electron)

- **Painel da bandeja:** sem moldura e fora da barra de tarefas, no canto inferior direito. Aparece ao ouvir “Oi, Chat” ou ao clicar no ícone. Volta para a bandeja quando a conversa termina ou ao clicar fora (só enquanto está apenas ouvindo).
- **Sempre ativo:** sem botão de pausar. Em erro, tenta de novo a cada 10 s.
- **ChatGPT dentro do painel** ([electron/services/chatGPTView.ts](electron/services/chatGPTView.ts)), sessão salva na partição `persist:chatgpt`.
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`; preload expõe só `window.oichat`; IPC valida a origem; microfone liberado só para o próprio app e para `chatgpt.com`.
- Configurações em `%APPDATA%/oichat/settings.json`.

## Android (Capacitor + Kotlin)

Arquivos em [android/app/src/main/java/com/oichat/app/](android/app/src/main/java/com/oichat/app/):

- **WakeWordService.kt:** Foreground Service do tipo microfone com notificação fixa (“Abrir ChatGPT” / “Encerrar”). Vosk nativo, beep e vibração opcionais. Libera o microfone antes de abrir o ChatGPT.
- **ChatGPTActivity.kt:** ChatGPT oficial numa WebView, com a barra do Oi Chat. Mesma lógica do Windows: clique no botão de voz, mensagem inicial, fim da conversa. Tarefa própria: ao fechar, o usuário volta para onde estava.
- **ChatGPTLauncher.kt:** decide como abrir. O Android só deixa abrir uma tela a partir do serviço com o app visível ou com a permissão **“Sobrepor a outros apps”**; sem ela, aparece uma notificação para tocar.
- **WakeWordPlugin.kt:** ponte com o React (iniciar/parar, permissões, diagnóstico, telas de ajuste do sistema).
- **MainActivity.kt:** registra o plugin.

Testado no emulador (Android 17): escuta ligada, notificação, ChatGPT abre, microfone liberado, volta a ouvir ao fechar, bibliotecas nativas compatíveis com páginas de 16 KB (vosk-android 0.3.75, JNA 5.19.1).

Limitações do Android:
- Android 14+: a escuta não pode começar sozinha no boot nem com o app em segundo plano. Ela religa quando o usuário abre o Oi Chat.
- Com a tela bloqueada, o ChatGPT só aparece depois de desbloquear (o app não contorna o bloqueio).
- Login com Google é bloqueado pelo Google dentro de WebView; e-mail/senha da OpenAI funcionam. Sem login, o modo de voz também funciona.
- “Tchau, Chat” pelo microfone fica desligado por padrão: disputaria o microfone com o modo de voz. O fim da conversa é detectado pela tela (última mensagem termina com “tchau chat” ou cartão “Como foi essa conversa?”).
- Fabricantes como Xiaomi e Samsung podem encerrar o serviço; o Diagnóstico mostra o ajuste certo.

## Modo de voz e fim da conversa (experimental)

Depende da interface do chatgpt.com e pode parar de funcionar quando o site mudar:

- **Ligar a voz:** procura `a`/`button` com aria-label contendo “voz”/“voice” (ex.: “Iniciar modo de voz” sem login, “Iniciar conversa por voz” com login), ignorando “Ditar”.
- **Mensagem inicial:** escreve a mensagem configurada (padrão “Oi, Chat!”) na caixa e envia.
- **Fim da conversa:** qualquer um destes — “Tchau, Chat” ouvido pelo Oi Chat; última mensagem do usuário termina com “tchau chat”; cartão “Como foi essa conversa?”. Só esses sinais são lidos; nenhum texto da conversa sai da página nem é salvo.

## Estrutura

```
src/               React (compartilhado): pages, components, stores (Zustand), services, hooks
electron/          processo principal, preload e serviços do Windows
android/           projeto Capacitor + código Kotlin
scripts/           download do modelo de voz e geração de ícones
resources/icons/   ícones gerados
```
