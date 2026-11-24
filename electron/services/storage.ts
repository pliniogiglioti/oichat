// Armazenamento local das configurações em JSON na pasta de dados do usuário.
// Nada vai para servidores (seção 9).
import { app } from 'electron';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const file = () => join(app.getPath('userData'), 'settings.json');
let data: Record<string, string> = {};
let timer: NodeJS.Timeout | undefined;

export function loadStorage() {
  try {
    data = JSON.parse(readFileSync(file(), 'utf8'));
  } catch {
    data = {};
  }
}

function flush() {
  const f = file();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(`${f}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${f}.tmp`, f); // escrita atômica
}

export const storage = {
  get: (k: string) => (k in data ? data[k] : null),
  set: (k: string, v: string) => {
    data[k] = v;
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  },
  remove: (k: string) => {
    delete data[k];
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  },
  flushNow: () => {
    clearTimeout(timer);
    flush();
  },
};
