/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated tab ids to leave out of the build. See App.tsx. */
  readonly VITE_HIDDEN_TABS?: string;
}
