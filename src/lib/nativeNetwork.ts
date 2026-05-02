export interface NativeNetworkStatus {
    connected: boolean;
    connectionType?: string;
}

interface NativeNetworkListenerHandle {
    remove: () => Promise<void> | void;
}

type NetworkStatusChangeCallback = (status: NativeNetworkStatus) => void;
let nativeNetworkState: NativeNetworkStatus | null = null;
const nativeNetworkListeners = new Set<NetworkStatusChangeCallback>();

function emitNativeNetworkState() {
    if (!nativeNetworkState) {
        return;
    }

    const snapshot = { ...nativeNetworkState };
    nativeNetworkListeners.forEach((listener) => {
        try {
            listener(snapshot);
        }
        catch (e) {
        }
    });
}

function setNativeNetworkState(status: NativeNetworkStatus | null) {
    nativeNetworkState = status ? { ...status } : null;
    emitNativeNetworkState();
}

async function loadCapacitorNetwork() {
    try {
        const importer: any = new Function("return import('@capacitor/network')");
        return await importer();
    }
    catch (e) {
        return null;
    }
}

export async function getNativeNetworkStatus(): Promise<NativeNetworkStatus | null> {
    if (nativeNetworkState) {
        return { ...nativeNetworkState };
    }

    const mod = await loadCapacitorNetwork();
    if (!mod?.Network?.getStatus) {
        return null;
    }

    try {
        const status = await mod.Network.getStatus();
        const nextStatus = {
            connected: !!status?.connected,
            connectionType: status?.connectionType,
        };
        setNativeNetworkState(nextStatus);
        return nextStatus;
    }
    catch (e) {
        return null;
    }
}

export async function addNativeNetworkListener(callback: NetworkStatusChangeCallback): Promise<NativeNetworkListenerHandle | null> {
    nativeNetworkListeners.add(callback);
    if (nativeNetworkState) {
        callback({ ...nativeNetworkState });
    }

    const mod = await loadCapacitorNetwork();
    if (!mod?.Network?.addListener) {
        nativeNetworkListeners.delete(callback);
        return null;
    }

    try {
        const handle = await mod.Network.addListener('networkStatusChange', (status: any) => {
            const nextStatus = {
                connected: !!status?.connected,
                connectionType: status?.connectionType,
            };
            setNativeNetworkState(nextStatus);
        });
        return {
            remove: async () => {
                nativeNetworkListeners.delete(callback);
                await handle.remove();
            },
        };
    }
    catch (e) {
        nativeNetworkListeners.delete(callback);
        return null;
    }
}

export function getNativeNetworkState(): NativeNetworkStatus | null {
    return nativeNetworkState ? { ...nativeNetworkState } : null;
}
