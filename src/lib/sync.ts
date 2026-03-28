// Module de synchronisation hors-ligne avec IndexedDB
import { openDB } from 'idb';
import { backendAvailable } from './backend';

export const SYNC_DB_NAME = 'pos_sync_db';
export const SYNC_STORE = 'pending_ops';

// État de connexion et de synchronisation
export const connectionState = {
	isOnline: navigator.onLine,
	isSyncing: false,
	lastCheck: Date.now(),
};

// Ouvrir la base IndexedDB pour les opérations en attente
async function getSyncDB() {
	return openDB(SYNC_DB_NAME, 1, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(SYNC_STORE)) {
				db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
			}
		},
	});
}

// Ajouter une opération à la file d’attente
export async function queueSyncOp(op) {
	const db = await getSyncDB();
	await db.add(SYNC_STORE, { ...op, createdAt: Date.now() });
}

async function writeSyncLog(entry: { level: 'info' | 'warn' | 'error'; message: string; entity?: string; details?: any }) {
	try {
		const { getDB } = await import('./db');
		const db = await getDB();
		await db.add('syncLogs' as any, {
			id: crypto.randomUUID(),
			level: entry.level,
			message: entry.message,
			entity: entry.entity,
			details: entry.details,
			createdAt: Date.now(),
		} as any);
	} catch (e) {
		console.log('Erreur écriture log sync:', e);
	}
}

// Récupérer toutes les opérations en attente
export async function getPendingSyncOps() {
	const db = await getSyncDB();
	return db.getAll(SYNC_STORE);
}

// Compter les opérations en attente
export async function getPendingSyncCount() {
	const db = await getSyncDB();
	return (await db.getAllKeys(SYNC_STORE)).length;
}

// Supprimer une opération synchronisée
export async function removeSyncOp(id) {
	const db = await getSyncDB();
	await db.delete(SYNC_STORE, id);
}

// Synchroniser toutes les opérations en attente avec le serveur
export async function syncWithServer() {
	// Vérifier la connexion internet et le backend (ping)
	if (!navigator.onLine) {
		return { success: false, reason: 'offline' };
	}
	const backendUp = await backendAvailable();
	if (!backendUp) {
		return { success: false, reason: 'backend_unreachable' };
	}

  // Traiter les emails en attente en premier
  try {
    const { pendingEmailService } = await import('./pendingEmailService');
    
    // Debug: Vérifier combien d'emails en attente
    const { getDB } = await import('./db');
    const db = await getDB();
    const pendingEmails = await db.getAll('pendingEmails');
    const pendingOnly = pendingEmails.filter(e => e.status === 'pending');
    
    console.log('🔍 [SYNC-DEBUG] Emails en base:', {
      total: pendingEmails.length,
      pending: pendingOnly.length,
      sent: pendingEmails.filter(e => e.status === 'sent').length,
      failed: pendingEmails.filter(e => e.status === 'failed').length
    });
    
    if (pendingOnly.length > 0) {
      console.log('📧 [SYNC-DEBUG] Premiers emails pending:', pendingOnly.slice(0, 3).map(e => ({
        id: e.id,
        type: e.type,
        email: e.email,
        attempts: e.attempts,
        createdAt: new Date(e.createdAt).toLocaleString()
      })));
    }
    
    const emailStats = await pendingEmailService.processPendingEmails();
    console.log('📧 [SYNC] Emails traités:', emailStats);
    
    // Nettoyer les anciens emails
    await pendingEmailService.cleanupOldEmails();
  } catch (emailError) {
    console.error('❌ [SYNC] Erreur traitement emails:', emailError);
  }	// Récupérer les opérations en attente
	const ops = await getPendingSyncOps();
	if (!ops.length) {
		// Rien à synchroniser, ne pas appeler le backend
		return { success: true, itemsCount: 0, skipped: true };
	}
	connectionState.isSyncing = true;
	let successCount = 0;
	for (const op of ops) {
		try {
			// Appel API backend (adapter selon le type d’opération)
			const res = await fetch(op.url, {
				method: op.method || 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(op.data),
			});
			if (res.ok) {
				await removeSyncOp(op.id);
				successCount++;
				writeSyncLog({ level: 'info', message: 'Op synchronisée', entity: op.table, details: { id: op.data?.id, url: op.url } });
			}
		} catch (e) {
			// On arrête si erreur réseau
			break;
		}
	}
	connectionState.isSyncing = false;
	return { success: true, itemsCount: successCount };
}
 
 // Helper générique pour récupérer et merger une entité depuis le backend
export async function fetchAndMerge(endpoint: string, storeName: string, tableName?: string, normalizeFn?: (item: any)=>any, params?: Record<string, string>) {
 	 try {
 		 // Append query params only when provided (avoid storeId=undefined)
 		 let url = endpoint;
 		 if (params && Object.keys(params).length > 0) {
 			 const qs = new URLSearchParams(params).toString();
 			 url = endpoint + (endpoint.includes('?') ? '&' : '?') + qs;
 		 }
 		 const res = await fetch(url);
		 if (!res.ok) return;
		 let backendItems: any = await res.json();
		 // If backend returned an object with a wrapper (e.g. { data: [...] })
		 if (!Array.isArray(backendItems)) {
			 // try common wrapper fields
			 if (backendItems && Array.isArray(backendItems.data)) {
				 backendItems = backendItems.data;
			 } else if (backendItems && Array.isArray(backendItems.items)) {
				 backendItems = backendItems.items;
			 } else {
				 console.warn(`fetchAndMerge: unexpected response for ${endpoint}, expected array but got`, backendItems);
				 writeSyncLog({ level: 'warn', message: `Unexpected response shape from ${endpoint}`, entity: storeName, details: { endpoint, responseType: typeof backendItems } });
				 // Avoid throwing — treat as empty list to avoid crashing the whole refresh
				 backendItems = [];
			 }
		 }
		 
		 // Filtrage côté client pour sécurité : si storeId est passé en paramètre, ne garder que les items de ce store
		 // Exception: stores table n'a pas besoin d'être filtré (on veut tous les stores pour afficher les noms)
		 if (params?.storeId && storeName !== 'stores') {
			 backendItems = backendItems.filter((item: any) => {
				 // Vérifier si l'item appartient au store demandé
				 return item.storeId === params.storeId;
			 });
		 }
		 
		 const { getDB } = await import('./db');
		 const db = await getDB();
		 const pending = await db.getAll('syncQueue');
		 const pendingIds = new Set(pending.filter((op: any) => op.table === (tableName || storeName)).map((op: any) => op.data?.id));
		 const normalized = (backendItems || []).map((it: any) => normalizeFn ? normalizeFn(it) : ({ ...it }));
		 const backendMap = new Map<string, any>(normalized.map((it: any) => [it.id, it]));
		 const localItems = await db.getAll(storeName as any);
 
		 // Build merged map: start with backend items
		 const mergedMap = new Map<string, any>(normalized.map((it: any) => [it.id, it]));
 
		 // Merge local items: if item exists on backend, choose latest by updatedAt, otherwise keep local
		 for (const local of localItems) {
			 const id = local.id;
			 const backend = mergedMap.get(id);
			 const localUpdated = typeof local.updatedAt === 'number' ? local.updatedAt : 0;
			 const backendUpdated = backend && typeof backend.updatedAt === 'number' ? backend.updatedAt : 0;
 
			 if (!backend) {
				 // Not present on backend: if local has pending ops or was created locally, preserve it
				 if (pendingIds.has(id) || !backendMap.has(id)) {
					 mergedMap.set(id, local);
				 }
			 } else {
				 // Present on both: keep the most recent according to updatedAt
				 if (localUpdated > backendUpdated) {
					 // For 'stores' be conservative: prefer backend logo unless the local change
					 // is a very recent local upload (marked by storeLogo_ts). This avoids
					 // an old local logo overwriting a newer backend upload during sync.
					 if (storeName === 'stores') {
						 try {
							 const localLogoTs = Number(localStorage.getItem('storeLogo_ts') || '0');
							 const RECENT_MS = 5 * 60 * 1000; // 5 minutes
							 if (!localLogoTs || (Date.now() - localLogoTs) > RECENT_MS) {
								 // local update is not recent — prefer backend instead
								 // do nothing here, backend remains in mergedMap
							 } else {
								 mergedMap.set(id, local);
								 continue;
							 }
						 } catch (e) {
							 // on error, fall back to previous behavior and keep local
							 mergedMap.set(id, local);
							 continue;
						 }
					 } else {
						 mergedMap.set(id, local);
					 }
				 } else {
		 	 	 	 // keep backend (already in mergedMap)
		 	 	 	 // Special-case for stores: if backend explicitly removed logo (null or missing),
		 	 	 	 // ensure we remove it locally even if local has newer updatedAt.
		 	 	 	 if (storeName === 'stores') {
		 	 	 	 	 const backendHasLogo = backend && ('logo' in backend) && backend.logo != null;
		 	 	 	 	 if (!backendHasLogo) {
		 	 	 	 	 	 // remove logo from local copy
		 	 	 	 	 	 const localCopy = { ...local } as any;
		 	 	 	 	 	 if ('logo' in localCopy) delete localCopy.logo;
		 	 	 	 	 	 mergedMap.set(id, localCopy);
		 	 	 	 	 continue;
		 	 	 	 	 }
		 	 	 	 }
				 }
			 }
		 }
 
		 // Persist merged list
		 const merged = Array.from(mergedMap.values());
		 const tx = db.transaction(storeName as any, 'readwrite');
		 await tx.store.clear();
		 for (const it of merged) await tx.store.put(it as any);
		 await tx.done;
		 console.log(`${storeName} locaux synchronisés avec ${endpoint}`);
		 writeSyncLog({ level: 'info', message: `Merged ${storeName} from backend`, entity: storeName, details: { endpoint, count: merged.length } });
	 } catch (e) {
		 console.log(`Erreur lors de la synchronisation de ${storeName}:`, e);
		 writeSyncLog({ level: 'error', message: `Erreur merge ${storeName}`, entity: storeName, details: { error: String(e) } });
	 }
 }

// Réconcilier les ventes "orphelines" vers le dernier shift fermé par utilisateur + magasin.
// Règle: si une vente n'a pas de shiftId, ou son shiftId n'existe pas localement,
// ou si la vente a un timestamp > closedAt du shift (shift fermé),
// alors on la rattache au dernier shift fermé du même user/store.
// Le closedAt du shift devient le max entre son closedAt actuel et la vente la plus récente rattachée.
export async function reconcileSalesToLastClosedShift(storeId?: string) {
	try {
		const { getDB } = await import('./db');
		const db = await getDB();
		let shifts = await db.getAll('shifts');
		let sales = await db.getAll('sales');

		if (storeId) {
			shifts = shifts.filter((s: any) => s.storeId === storeId);
			sales = sales.filter((s: any) => s.storeId === storeId);
		}

		if (!shifts.length || !sales.length) return;

		const shiftById = new Map<string, any>(shifts.map((s: any) => [String(s.id), s]));

		// Index last closed shift per user+store
		const lastClosedByUserStore = new Map<string, any>();
		for (const s of shifts) {
			if (s.status !== 'closed' || !s.closedAt) continue;
			const key = `${s.userId}__${s.storeId}`;
			const prev = lastClosedByUserStore.get(key);
			if (!prev || (s.closedAt > prev.closedAt)) {
				lastClosedByUserStore.set(key, s);
			}
		}

		const salesToUpdate: any[] = [];
		const shiftsToUpdate = new Map<string, any>();

		for (const sale of sales) {
			const saleTime = sale.createdAt || sale.timestamp || 0;
			const saleShiftId = sale.shiftId ? String(sale.shiftId) : '';
			const shift = saleShiftId ? shiftById.get(saleShiftId) : null;

			const isShiftMissing = !shift;
			const isShiftClosedPastSale = Boolean(shift && shift.status === 'closed' && shift.closedAt && saleTime > shift.closedAt);
			const needsReattach = !saleShiftId || isShiftMissing || isShiftClosedPastSale;

			if (!needsReattach) continue;

			const key = `${sale.userId}__${sale.storeId}`;
			const lastClosed = lastClosedByUserStore.get(key);
			if (!lastClosed) continue;

			// Re-rattacher la vente
			if (String(lastClosed.id) !== String(sale.shiftId)) {
				salesToUpdate.push({ ...sale, shiftId: lastClosed.id });
			}

			// Étendre openedAt / closedAt si besoin
			const updatedShift = shiftsToUpdate.get(String(lastClosed.id)) || { ...lastClosed };
			if (!updatedShift.openedAt || saleTime < updatedShift.openedAt) {
				updatedShift.openedAt = saleTime;
			}
			if (!updatedShift.closedAt || saleTime > updatedShift.closedAt) {
				updatedShift.closedAt = saleTime;
			}
			shiftsToUpdate.set(String(lastClosed.id), updatedShift);
		}

		if (salesToUpdate.length === 0 && shiftsToUpdate.size === 0) return;

		const tx = db.transaction(['sales', 'shifts'], 'readwrite');
		for (const s of salesToUpdate) {
			await tx.objectStore('sales').put(s);
		}
		for (const sh of shiftsToUpdate.values()) {
			await tx.objectStore('shifts').put(sh);
		}
		await tx.done;

		// Propager les corrections vers le backend si possible
		if (navigator.onLine) {
			try {
				const salesUpdates = salesToUpdate.map((s: any) =>
					fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(s),
					})
				);
				const shiftUpdates = Array.from(shiftsToUpdate.values()).map((sh: any) =>
					fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(sh),
					})
				);
				await Promise.all([...salesUpdates, ...shiftUpdates]);
			} catch (e) {
				console.log('Erreur sync backend après reconciliation:', e);
			}
		}
	} catch (e) {
		console.log('Erreur reconciliation ventes->shift fermé:', e);
	}
}

export async function refreshAllFromBackend(storeId?: string) {
	 if (!navigator.onLine) return;
	 // Double-check backend reachability before attempting the full refresh
	 try {
		 const backendUp = await backendAvailable();
		 if (!backendUp) {
			 console.log('refreshAllFromBackend: backend ping failed — skipping refresh');
			 return;
		 }
	 } catch (e) {
		 console.log('refreshAllFromBackend: backendAvailable check error, skipping refresh', e);
		 return;
	 }
	 const params = storeId ? { storeId } : undefined;
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/products.php', 'products', 'products', (p: any) => ({ ...p, stock: p.stock || {} }), params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/customers.php', 'customers', 'customers', undefined, params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/categories.php', 'categories', 'categories', undefined, params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expense_categories.php', 'expenseCategories', 'expenseCategories', undefined, params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php', 'stores', 'stores', undefined, params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php', 'users', 'users', undefined, params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/shifts.php', 'shifts', 'shifts', undefined, params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/sales.php', 'sales', 'sales', undefined, params);
	 await reconcileSalesToLastClosedShift(storeId);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses.php', 'expenses', 'expenses', undefined, params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/expenses_advanced.php', 'expensesAdvanced', 'expensesAdvanced', undefined, params);
	 await fetchAndMerge('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stock_signals.php', 'stockSignals', 'stockSignals', undefined, params);
 }

// Forcer la synchronisation manuelle
export async function forceSyncNow() {
	return syncWithServer();
}

// S’abonner aux changements d’état réseau
const listeners = [];
export function onConnectionStateChange(cb) {
	listeners.push(cb);
	return () => {
		const idx = listeners.indexOf(cb);
		if (idx > -1) listeners.splice(idx, 1);
	};
}

// Écouteur global pour détecter la reconnexion et lancer la sync
window.addEventListener('online', async () => {
	connectionState.isOnline = true;
	connectionState.lastCheck = Date.now();
	listeners.forEach(l => l(connectionState));
	// Only attempt network sync if backend is reachable
	try {
		const backendUp = await backendAvailable();
		if (!backendUp) {
			console.log('Online event: internet available but backend ping failed — skipping sync');
			return;
		}
		// First try to flush pending operations
		await syncWithServer();
		// Ne rafraîchit plus automatiquement les données locales depuis le backend
		// L'utilisateur doit cliquer sur un bouton ou déclencher manuellement refreshAllFromBackend
	} catch (e) {
		console.log('Erreur lors de la synchronisation initiale depuis le backend:', e);
	}
});
window.addEventListener('offline', () => {
	connectionState.isOnline = false;
	connectionState.lastCheck = Date.now();
	listeners.forEach(l => l(connectionState));
});
