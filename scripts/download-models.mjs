// Baixa o modelo Vosk pt-BR oficial e prepara:
//  - public/models/<nome>.tar.gz           → versão web/Windows (vosk-browser, pasta do modelo na raiz)
//  - android/app/src/main/assets/model-pt/ → versão Android (vosk-android, com arquivo "uuid")
// Uso: npm run models
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const NAME = 'vosk-model-small-pt-0.3';
const URL = `https://alphacephei.com/vosk/models/${NAME}.zip`;
const webOut = resolve('public/models', `${NAME}.tar.gz`);
const androidProject = resolve('android/app/src/main');
const androidOut = join(androidProject, 'assets', 'model-pt');

const needWeb = !existsSync(webOut);
const needAndroid = existsSync(androidProject) && !existsSync(join(androidOut, 'uuid'));

if (!needWeb && !needAndroid) {
  console.log('Modelo de voz já preparado.');
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'oichat-model-'));
try {
  console.log(`Baixando ${URL} …`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const zip = join(work, 'model.zip');
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));

  // bsdtar (Windows 10+ e macOS) abre .zip; no Linux use: unzip model.zip
  execFileSync('tar', ['-xf', zip, '-C', work], { stdio: 'inherit' });

  if (needWeb) {
    mkdirSync(resolve('public/models'), { recursive: true });
    execFileSync('tar', ['-czf', webOut, '-C', work, NAME], { stdio: 'inherit' });
    console.log(`Web/Windows: ${webOut}`);
  }
  if (needAndroid) {
    rmSync(androidOut, { recursive: true, force: true });
    cpSync(join(work, NAME), androidOut, { recursive: true });
    // O StorageService do vosk-android usa este arquivo para saber se precisa reextrair o modelo.
    writeFileSync(join(androidOut, 'uuid'), `${NAME}\n`);
    console.log(`Android: ${androidOut}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
