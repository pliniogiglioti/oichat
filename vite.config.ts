import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base relativa: necessário para Electron (file://) e Capacitor carregarem o build.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // O vosk-browser (~5,8 MB, WebAssembly) é carregado sob demanda, só ao ativar a escuta.
  build: { outDir: 'dist', chunkSizeWarningLimit: 6500 },
});
