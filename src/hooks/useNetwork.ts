/**
 * Hook personnalisé pour surveiller l'état du réseau et de la synchronisation
 */
import { useState, useEffect, useCallback } from 'react';
import { connectionState, syncWithServer, onConnectionStateChange, getPendingSyncCount, forceSyncNow } from '@/lib/sync';
import { useToast } from '@/hooks/use-toast';
import { backendAvailable } from '@/lib/backend';
export interface NetworkStatus {
    isOnline: boolean; // Internet connectivity (navigator)
    isBackendReachable: boolean; // Backend ping OK
    isSyncing: boolean;
    pendingCount: number;
    lastCheck: number;
}
export const useNetwork = () => {
    const [status, setStatus] = useState<NetworkStatus>({
        isOnline: connectionState.isOnline,
        isBackendReachable: false,
        isSyncing: connectionState.isSyncing,
        pendingCount: 0,
        lastCheck: connectionState.lastCheck,
    });
    const { toast } = useToast();
    // Mettre à jour le nombre d'items en attente
    const updatePendingCount = useCallback(async () => {
        const count = await getPendingSyncCount();
        setStatus(prev => ({ ...prev, pendingCount: count }));
    }, []);
    // S'abonner aux changements d'état
    useEffect(() => {
        let mounted = true;
        // Au montage, valider que le backend est joignable (pas seulement la connexion réseau)
        const checkBackend = async () => {
            try {
                const up = await backendAvailable();
                if (mounted)
                    setStatus(prev => ({ ...prev, isBackendReachable: up }));
            }
            catch (e) {
                if (mounted)
                    setStatus(prev => ({ ...prev, isBackendReachable: false }));
            }
        };
        // Vérification initiale
        checkBackend();
        // ✅ Vérifier quand la page redevient visible (écran sort de veille, retour depuis autre onglet)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkBackend();
            }
        };
        // ✅ Vérifier quand la fenêtre reprend le focus (retour d'une autre app)
        const handleFocus = () => {
            checkBackend();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        const unsubscribe = onConnectionStateChange((newState) => {
            (async () => {
                let backendUp = false;
                if (newState.isOnline) {
                    try {
                        backendUp = await backendAvailable();
                    }
                    catch (e) {
                        backendUp = false;
                    }
                }
                setStatus(prevStatus => {
                    // Toast only if backend reachability changes
                    if (prevStatus.isBackendReachable !== backendUp) {
                        if (backendUp) {
                            toast({
                                title: '🌐 Connexion au serveur rétablie',
                                description: 'Synchronisation en cours...',
                                variant: 'default',
                            });
                        }
                        else {
                            toast({
                                title: '📴 Serveur inaccessible',
                                description: 'Connexion Internet ok mais serveur indisponible',
                                variant: 'destructive',
                                duration: 5000,
                            });
                        }
                    }
                    return {
                        ...prevStatus,
                        isOnline: newState.isOnline,
                        isBackendReachable: backendUp,
                        isSyncing: newState.isSyncing,
                        lastCheck: newState.lastCheck,
                    };
                });
            })().catch(() => { });
        });
        // Mettre à jour le nombre d'items en attente périodiquement
        updatePendingCount();
        const interval = setInterval(updatePendingCount, 10000); // Toutes les 10 secondes
        return () => {
            mounted = false;
            unsubscribe();
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [toast, updatePendingCount]);
    // Fonction pour forcer une synchronisation manuelle
    const manualSync = useCallback(async () => {
        // Re-vérifier que le backend est joignable (même si navigator indique online)
        const backendUp = await backendAvailable();
        if (!backendUp) {
            toast({
                title: '📴 Serveur indisponible',
                description: 'Impossible de synchroniser : le serveur est inaccessible',
                variant: 'destructive',
            });
            return { success: false, reason: 'backend_unreachable' };
        }
        if (status.isSyncing) {
            toast({
                title: '⏳ Synchronisation en cours',
                description: 'Veuillez patienter...',
                variant: 'default',
            });
            return { success: false, reason: 'already_syncing' };
        }
        try {
            const result = await forceSyncNow();
            if (result.success) {
                toast({
                    title: '✅ Synchronisation réussie',
                    description: `${result.itemsCount || 0} élément(s) synchronisé(s)`,
                    variant: 'default',
                });
                // Mettre à jour le compteur
                await updatePendingCount();
            }
            else {
                toast({
                    title: '❌ Échec de la synchronisation',
                    description: 'Veuillez réessayer plus tard',
                    variant: 'destructive',
                });
            }
            return result;
        }
        catch (error) {
            toast({
                title: '❌ Erreur de synchronisation',
                description: error instanceof Error ? error.message : 'Une erreur est survenue',
                variant: 'destructive',
            });
            return { success: false, error };
        }
    }, [status.isSyncing, toast, updatePendingCount]);
    return {
        ...status,
        manualSync,
        refreshPendingCount: updatePendingCount,
    };
};
export default useNetwork;
