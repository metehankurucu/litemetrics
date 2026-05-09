import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  ssgOptions: {
    entry: 'src/main.tsx',
    dirStyle: 'nested',
    formatting: 'none',
    crittersOptions: false,
  },
});
