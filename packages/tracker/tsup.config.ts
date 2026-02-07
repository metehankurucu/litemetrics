import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    outDir: 'dist',
    dts: true,
    clean: true,
    sourcemap: true,
    outExtension({ format }) {
      return { js: format === 'esm' ? '.js' : '.cjs' };
    },
    esbuildOptions(options) {
      options.outbase = 'src';
      options.entryNames = 'insayt';
    },
  },
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    outDir: 'dist',
    globalName: 'Insayt',
    minify: true,
    outExtension() {
      return { js: '.global.js' };
    },
    esbuildOptions(options) {
      options.outbase = 'src';
      options.entryNames = 'insayt';
    },
  },
]);
