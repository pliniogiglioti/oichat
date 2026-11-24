// Abertura do ChatGPT oficial no Windows.
// 1) App da Microsoft Store, se instalado: localizado por Get-StartApps (cmdlet oficial do Windows)
//    e aberto via shell:AppsFolder — mecanismo padrão do Windows para abrir apps, não um deep link do ChatGPT.
// 2) Caso contrário, https://chatgpt.com/ no navegador padrão.
import { execFile } from 'node:child_process';
import { shell } from 'electron';

const CHATGPT_URL = 'https://chatgpt.com/';
const SAFE_APP_ID = /^[\w.\-{}!\\]+$/;

let cache: { appId: string | null; at: number } | undefined;

function findChatGPTApp(): Promise<string | null> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return Promise.resolve(cache.appId);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-StartApps | Where-Object { $_.Name -eq 'ChatGPT' } | Select-Object -First 1 -ExpandProperty AppID",
      ],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        const id = err ? '' : stdout.trim();
        const appId = id && SAFE_APP_ID.test(id) ? id : null;
        cache = { appId, at: Date.now() };
        resolve(appId);
      },
    );
  });
}

export async function chatGPTAppInstalled() {
  return (await findChatGPTApp()) !== null;
}

export async function openChatGPT(preferApp: boolean): Promise<{ via: 'app' | 'browser' }> {
  if (preferApp) {
    const appId = await findChatGPTApp();
    if (appId) {
      const ok = await new Promise<boolean>((resolve) =>
        execFile('explorer.exe', [`shell:AppsFolder\\${appId}`], { windowsHide: true }, () => resolve(true)),
      );
      if (ok) return { via: 'app' };
    }
  }
  await shell.openExternal(CHATGPT_URL);
  return { via: 'browser' };
}
