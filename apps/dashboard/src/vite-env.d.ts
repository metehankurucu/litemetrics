/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INSAYT_URL: string;
  readonly VITE_INSAYT_SITE_ID: string;
  readonly VITE_INSAYT_ADMIN_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
