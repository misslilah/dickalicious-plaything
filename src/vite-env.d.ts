/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MAX_VIDEO_BYTES?: string;
  readonly VITE_PATREON_PAGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
