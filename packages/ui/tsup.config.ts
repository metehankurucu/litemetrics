import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    'react', 'react-dom', 'recharts',
    '@tanstack/react-query', 'react-simple-maps',
    '@litemetrics/client', '@litemetrics/core',
    'react-icons', 'react-icons/si', 'react-icons/fa6', 'react-icons/hi',
  ],
});
