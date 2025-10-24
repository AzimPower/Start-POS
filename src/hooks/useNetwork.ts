/**
 * Hook personnalisé pour surveiller l'état du réseau et de la synchronisation
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  connectionState, 
  syncWithServer, 
  onConnectionStateChange,
  getPendingSyncCount,
  forceSyncNow
} from '@/lib/sync';
import { useToast } from '@/hooks/use-toast';

export interface NetworkStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastCheck: number;
}

export const useNetwork = () => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: connectionState.isOnline,
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
    const unsubscribe = onConnectionStateChange((newState) => {
      setStatus(prevStatus => {
        // Afficher une notification lors du changement d'état
        if (prevStatus.isOnline !== newState.isOnline) {
          if (newState.isOnline) {
            toast({
              title: '🌐 Connexion rétablie',
              description: 'Synchronisation en cours...',
              variant: 'default',
            });
          } else {
            toast({
              title: '📴 Mode hors ligne',
              description: 'Les modifications seront synchronisées à la reconnexion',
              variant: 'destructive',
              duration: 5000,
            });
          }
        }

        return {
          ...prevStatus,
          isOnline: newState.isOnline,
          isSyncing: newState.isSyncing,
          lastCheck: newState.lastCheck,
        };
      });
    });

    // Mettre à jour le nombre d'items en attente périodiquement
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 10000); // Toutes les 10 secondes

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [toast, updatePendingCount]);

  // Fonction pour forcer une synchronisation manuelle
  const manualSync = useCallback(async () => {
    if (!status.isOnline) {
      toast({
        title: '📴 Hors ligne',
        description: 'Impossible de synchroniser en mode hors ligne',
        variant: 'destructive',
      });
      return { success: false, reason: 'offline' };
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
      } else {
        toast({
          title: '❌ Échec de la synchronisation',
          description: 'Veuillez réessayer plus tard',
          variant: 'destructive',
        });
      }
      
      return result;
    } catch (error) {
      toast({
        title: '❌ Erreur de synchronisation',
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
        variant: 'destructive',
      });
      return { success: false, error };
    }
  }, [status.isOnline, status.isSyncing, toast, updatePendingCount]);

  return {
    ...status,
    manualSync,
    refreshPendingCount: updatePendingCount,
  };
};

export default useNetwork;
