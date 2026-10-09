/// <reference types="vite/client" />
declare const APP_VERSION: string;

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
}
