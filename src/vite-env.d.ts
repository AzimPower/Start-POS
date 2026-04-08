/// <reference types="vite/client" />
/// <reference types="vite/client" />
// Variables globales définies par Vite
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
interface ImportMetaEnv {
    readonly VITE_APP_VERSION: string;
    readonly VITE_BUILD_TIME: string;
}
interface ImportMeta {
    readonly env: ImportMetaEnv;
}
declare module 'virtual:pwa-register' {
    import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
    export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
declare module 'virtual:pwa-register/react' {
    import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
    import type { Dispatch, SetStateAction } from 'react';
    export function useRegisterSW(options?: RegisterSWOptions): {
        needRefresh: [
            boolean,
            Dispatch<SetStateAction<boolean>>
        ];
        offlineReady: [
            boolean,
            Dispatch<SetStateAction<boolean>>
        ];
        updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
    };
}
