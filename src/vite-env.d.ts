/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_TRANSLATION_PROVIDER?: string
  readonly VITE_AI_PROVIDER?: string
  readonly VITE_STT_PROVIDER?: string
  readonly VITE_TTS_PROVIDER?: string
  readonly VITE_WEATHER_PROVIDER?: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
