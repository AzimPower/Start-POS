/**
 * Hook personnalise pour surveiller l'etat du reseau et de la synchronisation.
 * On evite de marquer le serveur "hors ligne" au premier echec passager.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { connectionState, onConnectionStateChange, getPendingSyncCount, forceSyncNow } from '@/lib/sync';
import { useToast } from '@/hooks/use-toast';
import { backendAvailable, getBackendAvailabilityState, getLastHealthProbeState, onBackendAvailabilityChange, onHealthProbeStateChange } from '@/lib/backend';
import { addNativeNetworkListener, getNativeNetworkState, getNativeNetworkStatus } from '@/lib/nativeNetwork';

export interface NetworkStatus {
    isOnline: boolean;
    isBackendReachable: boolean;
    isSyncing: boolean;
    pendingCount: number;
    lastCheck: number;
    nativeConnected: boolean | null;
    nativeConnectionType: string | null;
    lastHealthOk: boolean | null;
    lastHealthStatus: number | null;
    lastHealthError: string | null;
    lastHealthAt: number;
}

interface UseNetworkOptions {
    notifyOnStatusChange?: boolean;
}

const BACKEND_FAILURE_THRESHOLD = 3;
const BACKEND_PROBE_COOLDOWN_MS = 3000;

export const useNetwork = (options?: UseNetworkOptions) => {
    const backendState = getBackendAvailabilityState();
    const healthState = getLastHealthProbeState();
    const nativeState = getNativeNetworkState();
    const [status, setStatus] = useState<NetworkStatus>({
        isOnline: connectionState.isOnline || backendState.value === true,
        isBackendReachable: backendState.value === true,
        isSyncing: connectionState.isSyncing,
        pendingCount: 0,
        lastCheck: Math.max(connectionState.lastCheck, backendState.checkedAt || 0),
        nativeConnected: nativeState?.connected ?? null,
        nativeConnectionType: nativeState?.connectionType ?? null,
        lastHealthOk: healthState.ok,
        lastHealthStatus: healthState.status,
        lastHealthError: healthState.error,
        lastHealthAt: healthState.checkedAt,
    });
    const { toast } = useToast();
    const notifyOnStatusChange = options?.notifyOnStatusChange === true;
    const statusRef = useRef(status);
    const failureCountRef = useRef(0);
    const initializedRef = useRef(false);
    const inFlightProbeRef = useRef<Promise<boolean> | null>(null);
    const lastProbeAtRef = useRef(0);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    const updatePendingCount = useCallback(async () => {
        const count = await getPendingSyncCount();
        setStatus((prev) => ({ ...prev, pendingCount: count }));
    }, []);

    const commitBackendResult = useCallback((up: boolean) => {
        setStatus((prev) => {
            const nextLastCheck = Date.now();

            if (up) {
                failureCountRef.current = 0;
                const changed = !prev.isBackendReachable;
                initializedRef.current = true;

                if (changed && notifyOnStatusChange) {
                    toast({
                        title: 'Connexion au serveur retablie',
                        description: 'Le serveur repond a nouveau.',
                        variant: 'default',
                    });
                }

                return {
                    ...prev,
                    isOnline: true,
                    isBackendReachable: true,
                    lastCheck: nextLastCheck,
                };
            }

            failureCountRef.current += 1;
            initializedRef.current = true;

            const shouldStayOnline = prev.isBackendReachable && failureCountRef.current < BACKEND_FAILURE_THRESHOLD;
            if (shouldStayOnline) {
                return {
                    ...prev,
                    lastCheck: nextLastCheck,
                };
            }

            const changed = prev.isBackendReachable;
            if (changed && notifyOnStatusChange) {
                toast({
                    title: 'Serveur temporairement inaccessible',
                    description: 'Plusieurs verifications consecutives ont echoue. Nouvelle tentative automatique en cours.',
                    variant: 'destructive',
                    duration: 5000,
                });
            }

            return {
                ...prev,
                isBackendReachable: false,
                lastCheck: nextLastCheck,
            };
        });
    }, [notifyOnStatusChange, toast]);

    const checkBackend = useCallback(async (force = false) => {
        const now = Date.now();

        if (!force && inFlightProbeRef.current) {
            return inFlightProbeRef.current;
        }

        if (!force && now - lastProbeAtRef.current < BACKEND_PROBE_COOLDOWN_MS) {
            return statusRef.current.isBackendReachable;
        }

        lastProbeAtRef.current = now;
        inFlightProbeRef.current = (async () => {
            const up = await backendAvailable(5000, force);
            commitBackendResult(up);
            return up;
        })();

        try {
            return await inFlightProbeRef.current;
        }
        finally {
            inFlightProbeRef.current = null;
        }
    }, [commitBackendResult]);

    useEffect(() => {
        let mounted = true;

        getNativeNetworkStatus().then((nativeStatus) => {
            if (!mounted || !nativeStatus) {
                return;
            }
            setStatus((prev) => ({
                ...prev,
                isOnline: nativeStatus.connected ? true : prev.isOnline,
                nativeConnected: nativeStatus.connected,
                nativeConnectionType: nativeStatus.connectionType ?? null,
                lastCheck: Date.now(),
            }));
        }).catch(() => { });

        checkBackend(true).catch(() => {
            if (mounted) {
                commitBackendResult(false);
            }
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkBackend().catch(() => { });
            }
        };

        const handleFocus = () => {
            checkBackend().catch(() => { });
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        const unsubscribe = onConnectionStateChange((newState) => {
            setStatus((prev) => ({
                ...prev,
                isOnline: newState.isOnline || prev.isBackendReachable,
                isSyncing: newState.isSyncing,
                lastCheck: newState.lastCheck,
                isBackendReachable: prev.isBackendReachable,
            }));

            checkBackend(newState.isOnline).catch(() => { });
        });

        const unsubscribeBackend = onBackendAvailabilityChange((backendState) => {
            if (!mounted || backendState.value === null) {
                return;
            }

            setStatus((prev) => ({
                ...prev,
                isOnline: prev.isOnline || backendState.value === true,
                isBackendReachable: backendState.value === true,
                lastCheck: Math.max(prev.lastCheck, backendState.checkedAt || Date.now()),
            }));
        });

        const unsubscribeHealth = onHealthProbeStateChange((healthState) => {
            if (!mounted) {
                return;
            }

            setStatus((prev) => ({
                ...prev,
                lastHealthOk: healthState.ok,
                lastHealthStatus: healthState.status,
                lastHealthError: healthState.error,
                lastHealthAt: healthState.checkedAt,
            }));
        });

        let nativeListenerHandle: { remove: () => Promise<void> | void } | null = null;
        addNativeNetworkListener((nativeStatus) => {
            if (!mounted) {
                return;
            }

            setStatus((prev) => ({
                ...prev,
                isOnline: nativeStatus.connected ? true : prev.isBackendReachable,
                nativeConnected: nativeStatus.connected,
                nativeConnectionType: nativeStatus.connectionType ?? null,
                lastCheck: Date.now(),
            }));
        }).then((handle) => {
            nativeListenerHandle = handle;
        }).catch(() => { });

        updatePendingCount();
        const interval = setInterval(updatePendingCount, 30000);

        return () => {
            mounted = false;
            unsubscribe();
            unsubscribeBackend();
            unsubscribeHealth();
            if (nativeListenerHandle) {
                try {
                    nativeListenerHandle.remove();
                }
                catch (e) {
                }
            }
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [checkBackend, commitBackendResult, updatePendingCount]);

    const manualSync = useCallback(async () => {
        const backendUp = await checkBackend(true);
        if (!backendUp) {
            toast({
                title: 'Serveur indisponible',
                description: 'Impossible de synchroniser pour le moment. Reessaie dans quelques secondes.',
                variant: 'destructive',
            });
            return { success: false, reason: 'backend_unreachable' };
        }

        if (status.isSyncing) {
            toast({
                title: 'Synchronisation en cours',
                description: 'Veuillez patienter...',
                variant: 'default',
            });
            return { success: false, reason: 'already_syncing' };
        }

        try {
            const result = await forceSyncNow();
            if (result.success) {
                toast({
                    title: 'Synchronisation reussie',
                    description: `${result.itemsCount || 0} element(s) synchronise(s)`,
                    variant: 'default',
                });
                await updatePendingCount();
            }
            else {
                toast({
                    title: 'Echec de la synchronisation',
                    description: 'Veuillez reessayer plus tard',
                    variant: 'destructive',
                });
            }
            return result;
        }
        catch (error) {
            toast({
                title: 'Erreur de synchronisation',
                description: error instanceof Error ? error.message : 'Une erreur est survenue',
                variant: 'destructive',
            });
            return { success: false, error };
        }
    }, [checkBackend, status.isSyncing, toast, updatePendingCount]);

    return {
        ...status,
        manualSync,
        refreshPendingCount: updatePendingCount,
    };
};

export default useNetwork;
