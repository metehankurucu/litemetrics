/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LITEMETRICS_URL: string;
  readonly VITE_LITEMETRICS_SITE_ID: string;
  readonly VITE_LITEMETRICS_SECRET_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
