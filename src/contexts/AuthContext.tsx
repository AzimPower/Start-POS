import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getDB } from '@/lib/db';
import { getEmailSettings } from '@/lib/emailSettingsCache';
import * as secureStorage from '@/lib/secureStorage';
import { refreshAllFromBackend } from '@/lib/sync';
import { BACKEND_BASE, backendAvailable } from '@/lib/backend';
import { pendingEmailService } from '@/lib/pendingEmailService';
import { getStoreAccessState, isActiveFlag } from '@/lib/status';
import { sendStoreAdminNotification } from '@/lib/storeAdminNotifications';
import { hashPasswordForCache } from '@/lib/auth';
import { clearAuthToken, getAuthToken, setAuthToken } from '@/lib/apiAuth';
function normalizePhoneDigits(phone?: string | null): string {
    return String(phone || '').replace(/\D/g, '');
}
function buildPhoneCandidates(phone?: string | null): string[] {
    const raw = String(phone || '').replace(/[^0-9+]/g, '');
    const digits = normalizePhoneDigits(raw);
    const last8 = digits.slice(-8);
    const values = new Set<string>();
    if (raw.startsWith('+')) {
        values.add(raw);
    }
    if (digits) {
        values.add(`+${digits}`);
        values.add(digits);
    }
    if (last8) {
        values.add(last8);
        values.add(`+226${last8}`);
        values.add(`226${last8}`);
    }
    return Array.from(values).filter(Boolean);
}
function phonesMatch(candidatePhone: string, storedPhone?: string | null): boolean {
    const candidateDigits = normalizePhoneDigits(candidatePhone);
    const storedDigits = normalizePhoneDigits(storedPhone);
    if (!candidateDigits || !storedDigits) {
        return false;
    }
    if (candidateDigits === storedDigits) {
        return true;
    }
    return candidateDigits.slice(-8) === storedDigits.slice(-8);
}
function resolvePrimaryStoreId(storeId?: string | null, storeIds?: Array<string | null | undefined>): string {
    const candidates = [storeId, ...(storeIds || [])];
    for (const candidate of candidates) {
        const normalized = String(candidate || '').trim();
        if (normalized) {
            return normalized;
        }
    }
    return '';
}
// Function to force refresh admin cache for a specific store
const forceRefreshAdminCache = async (storeId: string) => {
    try {
        const cacheStoreId = resolvePrimaryStoreId(storeId);
        if (!cacheStoreId) {
            return null;
        }
        const db = await getDB();
        // Supprimer le cache existant pour forcer la mise à jour
        await db.delete('adminCache', cacheStoreId);
        // Recréer le cache
        return await cacheAdminData(cacheStoreId);
    }
    catch (error) {
        return null;
    }
};
// Function to cache admin data locally for a specific store
const cacheAdminData = async (storeId: string) => {
    const remoteAttempted = false;
    const remoteReachable = true;
    const localUser = null;
    try {
        const cacheStoreId = resolvePrimaryStoreId(storeId);
        if (!cacheStoreId) {
            return null;
        }
        const db = await getDB();
        // Vérifier d'abord si on a déjà un cache récent (moins de 5min pour test et debug)
        try {
            const existingCache = await db.get('adminCache', cacheStoreId);
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // Réduit à 5min pour test
            if (existingCache && existingCache.cachedAt > fiveMinutesAgo && existingCache.allStoreAdmins && existingCache.allStoreAdmins.length > 0) {
                return existingCache;
            }
            else if (existingCache) {
            }
        }
        catch (e) {
        }
        // Vérifier la connectivité avant de tenter la récupération
        if (!await backendAvailable()) {
            return null;
        }
        // Récupérer tous les users depuis le backend
        const usersResponse = await fetch(`${BACKEND_BASE}/api/users.php`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (usersResponse.ok) {
            const users = await usersResponse.json();
            // Debug: montrer tous les admins avec leurs stores
            const allAdmins = users.filter((u: any) => u.role === 'admin');
            allAdmins.forEach((admin: any) => {
            });
            // Chercher TOUS les admins de ce store qui ont un email
            // Utiliser la même logique que l'API users.php
            const storeAdmins = users.filter((u: any) => {
                const isAdmin = u.role === 'admin';
                const hasEmail = u.email && u.email.trim() !== '';
                // Vérifier si l'admin est associé à ce store
                let isAssociatedToStore = false;
                // Méthode 1: storeId direct (legacy) - comme dans users.php
                if (u.storeId === cacheStoreId) {
                    isAssociatedToStore = true;
                }
                // Méthode 2: storeIds array (système principal) - comme dans users.php
                if (u.storeIds && Array.isArray(u.storeIds) && u.storeIds.includes(cacheStoreId)) {
                    isAssociatedToStore = true;
                }
                const result = isAdmin && hasEmail && isAssociatedToStore;
                // Debug détaillé pour chaque admin avec email
                if (isAdmin && hasEmail) {
                }
                return result;
            });
            // Debug supplémentaire : tous les admins avec email du système
            const allAdminsWithEmail = users.filter((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
            if (storeAdmins.length > 0) {
                // Prendre le premier admin avec email pour ce store
                const admin = storeAdmins[0];
                // Stocker l'admin en cache avec timestamp et storeId pour chaque admin
                const adminCache = {
                    id: cacheStoreId,
                    username: admin.username,
                    email: admin.email,
                    role: admin.role,
                    storeId: admin.storeId,
                    cachedAt: Date.now(),
                    allStoreAdmins: storeAdmins.map(a => ({
                        id: a.id,
                        username: a.username,
                        email: a.email,
                        storeId: a.storeId || cacheStoreId // S'assurer que chaque admin a bien le storeId
                    }))
                };
                await db.put('adminCache', adminCache);
                return adminCache;
            }
            else if (remoteAttempted && !remoteReachable && !localUser) {
                localStorage.setItem('pos-login-last-error', 'Connexion au serveur instable. RÃ©essayez dans un instant.');
            }
            else {
                // Fallback : chercher un admin avec email dans n'importe quel store
                const anyAdmin = users.find((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
                if (anyAdmin) {
                    const adminCache = {
                        id: cacheStoreId,
                        username: anyAdmin.username,
                        email: anyAdmin.email,
                        role: anyAdmin.role,
                        storeId: anyAdmin.storeId,
                        cachedAt: Date.now(),
                        isFallback: true
                    };
                    await db.put('adminCache', adminCache);
                    return adminCache;
                }
                // Debug : montrer les rôles et stores disponibles
                const roles = users.map(u => u.role).filter(r => r);
                const stores = users.map(u => u.storeId).filter(s => s);
            }
        }
        else {
        }
    }
    catch (error) {
    }
    return null;
};
// Function to get cached admin emails (for offline use)
const getCachedAdminEmails = async (storeId: string): Promise<string[]> => {
    try {
        const cacheStoreId = resolvePrimaryStoreId(storeId);
        if (!cacheStoreId) {
            return [];
        }
        const db = await getDB();
        const cachedAdmin = await db.get('adminCache', cacheStoreId);
        if (cachedAdmin && cachedAdmin.allStoreAdmins && cachedAdmin.allStoreAdmins.length > 0) {
            // Filtrer strictement par storeId
            const emails = cachedAdmin.allStoreAdmins
                .filter((admin: any) => {
                const hasValidEmail = admin.email && admin.email.trim() !== '';
                const isCorrectStore = !admin.storeId || admin.storeId === cacheStoreId;
                return hasValidEmail && isCorrectStore;
            })
                .map((admin: any) => admin.email);
            return emails;
        }
        // Fallback: utiliser l'admin principal en cache s'il correspond au store
        if (cachedAdmin && cachedAdmin.email && cachedAdmin.email.trim() !== '' &&
            (!cachedAdmin.storeId || cachedAdmin.storeId === cacheStoreId)) {
            return [cachedAdmin.email];
        }
        return [];
    }
    catch (error) {
        return [];
    }
};
// Function to clean up admin cache and remove invalid or cross-store entries
const cleanupAdminCache = async () => {
    try {
        const db = await getDB();
        const allCaches = await db.getAll('adminCache');
        let cleaned = 0;
        for (const cache of allCaches) {
            let needsUpdate = false;
            const updatedCache = { ...cache };
            // Nettoyer allStoreAdmins : supprimer uniquement les admins sans email valide
            // Ne pas filtrer par storeId car les admins peuvent être associés de différentes manières
            if (cache.allStoreAdmins && Array.isArray(cache.allStoreAdmins)) {
                const originalCount = cache.allStoreAdmins.length;
                updatedCache.allStoreAdmins = cache.allStoreAdmins.filter((admin: any) => {
                    const hasValidEmail = admin.email && admin.email.trim() !== '';
                    // Ne plus filtrer par storeId - garder tous les admins avec email valide
                    return hasValidEmail;
                });
                if (updatedCache.allStoreAdmins.length !== originalCount) {
                    needsUpdate = true;
                }
            }
            // Supprimer les caches trop anciens (plus de 7 jours)
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            if (cache.cachedAt && cache.cachedAt < sevenDaysAgo) {
                await db.delete('adminCache', cache.id);
                cleaned++;
                continue;
            }
            // Mettre à jour si nécessaire
            if (needsUpdate) {
                await db.put('adminCache', updatedCache);
                cleaned++;
            }
        }
        if (cleaned > 0) {
        }
        return cleaned;
    }
    catch (error) {
        return 0;
    }
};
// Function to send login notification email to admin
const sendLoginNotificationEmail = async (userData: User) => {
    try {
        const db = await getDB();
        const primaryStoreId = resolvePrimaryStoreId(userData.storeId, userData.storeIds);
        // Vérifier les paramètres d'email pour les connexions (lit depuis le backend = source de vérité)
        const emailSettings = await getEmailSettings(primaryStoreId);
        const shouldSendEmail = emailSettings.logins;
        if (!shouldSendEmail) {
            return;
        }
        // Récupérer l'admin - d'abord en local, puis fallback vers backend
        let admin = null;
        // 1. Essayer de récupérer l'admin depuis le stockage local
        try {
            const storedAdmin = primaryStoreId ? await db.get('adminCache', primaryStoreId) : null;
            if (storedAdmin && storedAdmin.email && storedAdmin.email.trim() !== '') {
                admin = storedAdmin;
            }
        }
        catch (e) {
        }
        // 2. Si pas trouvé en local, fallback vers backend
        if (!admin) {
            try {
                const usersResponse = await fetch(`${BACKEND_BASE}/api/users.php`);
                if (usersResponse.ok) {
                    const users = await usersResponse.json();
                    admin = users.find((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
                }
            }
            catch (adminError) {
            }
        }
        if (admin && admin.email) {
            // Récupérer le nom du magasin
            const store = primaryStoreId ? await db.get('stores', primaryStoreId) : null;
            const storeName = store?.name || primaryStoreId || 'Magasin';
            const loginTime = new Date().toLocaleString('fr-FR', {
                dateStyle: 'full',
                timeStyle: 'medium'
            });
            const resume = `
<div style="margin: 20px 0;">
  <div class="info-block">
    <h3 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">🔐 Connexion Utilisateur</h3>
    <div class="info-row">
      <span class="info-label">Utilisateur :&nbsp;</span>
      <span class="info-value" style="font-weight: 600;">${userData.username}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Rôle :&nbsp;</span>
      <span class="info-value">${userData.role === 'admin' ? '👨‍💼 Administrateur' : userData.role === 'cashier' ? '💰 Caissier' : userData.role === 'manager' ? '👥 Gestionnaire' : '🔧 Super Admin'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Téléphone :&nbsp;</span>
      <span class="info-value">${userData.phone}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date et heure :&nbsp;</span>
      <span class="info-value">${loginTime}</span>
    </div>
  </div>
  
  <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 4px; font-size: 12px; color: #6c757d;">
    <strong>ID Utilisateur :&nbsp;</strong>${userData.id}
  </div>
</div>
`;
            const emailPayload = {
                name: userData.username,
                email: admin.email,
                message: resume,
                storeName: storeName
            };
            // Utiliser le service d'emails en attente pour la connexion
            try {
                const result = await pendingEmailService.sendToAllAdmins({
                    message: resume,
                    storeName: storeName,
                    type: 'receipt', // Utiliser 'receipt' comme type générique pour les connexions
                    relatedId: userData.id,
                    storeId: primaryStoreId,
                    userId: userData.id
                });
                result.results.forEach(r => {
                    if (r.sent) {
                    }
                    else if (r.queued) {
                    }
                });
            }
            catch (e) {
            }
        }
        else {
        }
    }
    catch (e) {
    }
};

const sendLoginInboxNotification = async (userData: User) => {
    try {
        const primaryStoreId = resolvePrimaryStoreId(userData.storeId, userData.storeIds);
        if (!primaryStoreId) {
            return;
        }

        const db = await getDB();
        const store = await db.get('stores', primaryStoreId);
        const storeName = store?.name || primaryStoreId || 'Magasin';
        const loginTime = new Date().toLocaleString('fr-FR', {
            dateStyle: 'full',
            timeStyle: 'medium',
        });
        const roleLabel = userData.role === 'admin'
            ? 'Administrateur'
            : userData.role === 'cashier'
                ? 'Caissier'
                : userData.role === 'manager'
                    ? 'Gestionnaire'
                    : 'Super Admin';

        await sendStoreAdminNotification({
            event: 'login',
            senderUserId: userData.id,
            storeId: primaryStoreId,
            relatedId: userData.id,
            type: 'info',
            title: `Connexion utilisateur: ${userData.username}`,
            message: `${userData.username} (${roleLabel}) s'est connecté au magasin ${storeName} le ${loginTime}. Téléphone: ${userData.phone}.`,
        });
    }
    catch (e) {
    }
};
interface User {
    id: string;
    username: string;
    phone: string; // Téléphone unique pour la connexion
    email?: string; // Email optionnel
    role: 'super_admin' | 'admin' | 'cashier' | 'manager';
    storeId: string;
    storeIds?: string[]; // liste des magasins liés à l'utilisateur
    active?: boolean;
    pinEnabled?: boolean; // Activation du code PIN
    authToken?: string;
}
interface UserRecord extends User {
    password?: string;
    passwordHash?: string;
    pin?: string;
    pinEnabled?: boolean;
    createdAt?: number;
    updatedAt?: string | number;
}
interface AuthContextType {
    user: User | null;
    pendingUser: User | null; // kept for compatibility; prefer using isLocked
    login: (phone: string, password: string) => Promise<boolean>;
    logout: () => void;
    verifyPin: (pin: string) => Promise<boolean>;
    getPinFailedCount: () => number;
    isPinLocked: () => boolean;
    resetPinFailures: () => void;
    setActiveStore: (storeId: string) => Promise<void>;
    isLocked: boolean;
    isLoading: boolean;
    setPendingUser: (u: User | null) => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: {
    children: ReactNode;
}) {
    const [user, setUser] = useState<User | null>(null);
    const [pendingUser, setPendingUser] = useState<User | null>(null);
    const [isLocked, setIsLocked] = useState<boolean>(false);
    const [pinFailState, setPinFailState] = useState<{
        userId?: string;
        count: number;
    }>({ count: 0 });
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        // Check for existing session in secure storage (preferred). Mirror to localStorage
        // so synchronous PIN logic keeps working.
        (async () => {
            try {
                // Prefer secure storage, but fall back to localStorage if secure read fails
                let storedUser: string | null = null;
                try {
                    storedUser = await secureStorage.getItem('pos-user');
                }
                catch (e) {
                    // secure storage plugin might not be available in this environment
                    storedUser = null;
                }
                if (!storedUser) {
                    try {
                        storedUser = localStorage.getItem('pos-user');
                    }
                    catch (e) {
                        storedUser = null;
                    }
                }
                if (storedUser) {
                    try {
                        const parsed = JSON.parse(storedUser);
                        if (parsed?.authToken || parsed?.token) {
                            await setAuthToken(String(parsed.authToken || parsed.token));
                        }
                        // Check if user has PIN enabled before locking
                        const db = await getDB();
                        let userRecord = await db.get('users', parsed.id) as any;
                        // For existing users without pinEnabled field, initialize it to false
                        let hasPinEnabled = false;
                        if (userRecord) {
                            // If pinEnabled is explicitly undefined, null, or not present, set it to false in the database
                            if (userRecord.pinEnabled === undefined || userRecord.pinEnabled === null || !('pinEnabled' in userRecord)) {
                                try {
                                    const updated = { ...userRecord, pinEnabled: false };
                                    await db.put('users', updated);
                                    userRecord = updated; // Use the updated record
                                    hasPinEnabled = false;
                                }
                                catch (e) {
                                    hasPinEnabled = false;
                                }
                            }
                            else {
                                // Check explicitly for true or 1 (anything else is considered disabled)
                                hasPinEnabled = userRecord.pinEnabled === true || (typeof userRecord.pinEnabled === 'number' && userRecord.pinEnabled === 1);
                            }
                        }
                        else {
                            hasPinEnabled = false;
                        }
                        // On cold start, restore the user object
                        setUser(parsed);
                        setPendingUser(null);
                        // Only lock if PIN is enabled for this user
                        if (hasPinEnabled) {
                            // Let the mounted PIN overlay own body mutations and dialog dismissal.
                            setIsLocked(true);
                        }
                        else {
                            // PIN not enabled, don't lock the session
                            setIsLocked(false);
                        }
                        // ensure localStorage mirror exists for PIN/visibility flows
                        try {
                            localStorage.setItem('pos-user', JSON.stringify(parsed));
                        }
                        catch (e) {
                            // ignore
                        }
                    }
                    catch (e) {
                    }
                }
                // Rafraîchissement complet désactivé au démarrage : il doit être déclenché explicitement par l'utilisateur (bouton Synchroniser dans le layout)
            }
            catch (e) {
            }
            finally {
                setIsLoading(false);
            }
        })();
    }, []);
    const login = async (phone: string, password: string): Promise<boolean> => {
        try {
            const db = await getDB();
            // Normalize phone (allow passing with or without +226)
            const candidatePhones = buildPhoneCandidates(phone);
            let backendIsUp = false;
            let remoteAttempted = false;
            let remoteReachable = false;
            try {
                backendIsUp = await backendAvailable(5000, true);
            }
            catch (e) {
                backendIsUp = false;
            }
            let remoteUser: UserRecord | undefined = undefined;
            let localUser: UserRecord | undefined = undefined;
            // 1. Toujours prioriser la vérification sur le serveur si possible
            if (backendIsUp) {
                try {
                    remoteAttempted = true;
                    const res = await fetch(`${BACKEND_BASE}/api/auth_login.php`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phoneCandidates: candidatePhones, password }),
                    });
                    remoteReachable = true;
                    if (res.ok) {
                        remoteUser = (await res.json()) as UserRecord;
                        if (remoteUser) {
                            if ((remoteUser as any).token) {
                                await setAuthToken(String((remoteUser as any).token));
                            }
                            const primaryStoreId = resolvePrimaryStoreId(remoteUser.storeId, (remoteUser as any).storeIds);
                            let remoteStoreIsInactive = false;
                            if (remoteUser.role !== 'super_admin' && primaryStoreId) {
                                try {
                                    const storesRes = await fetch(`${BACKEND_BASE}/api/stores.php?include_inactive=1&_ts=` + Date.now(), { cache: 'no-store' });
                                    if (storesRes.ok) {
                                        const remoteStores = await storesRes.json();
                                        const currentStore = Array.isArray(remoteStores)
                                            ? remoteStores.find((store: any) => String(store?.id) === String(primaryStoreId))
                                            : null;
                                        if (currentStore) {
                                            try {
                                                await db.put('stores', currentStore);
                                            }
                                            catch (e) {
                                            }
                                            remoteStoreIsInactive = !isActiveFlag(currentStore.active);
                                        }
                                    }
                                }
                                catch (e) {
                                }
                            }
                            if (!isActiveFlag(remoteUser.active) && !remoteStoreIsInactive) {
                                localStorage.setItem('pos-login-last-error', 'Votre compte est désactivé.');
                                return false;
                            }
                            // persist into local DB for future offline login
                            try {
                                const toSave = {
                                    id: remoteUser.id,
                                    username: remoteUser.username,
                                    phone: remoteUser.phone,
                                    passwordHash: await hashPasswordForCache(password),
                                    pin: remoteUser.pin || '',
                                    pinEnabled: (remoteUser as any).pinEnabled || false,
                                    role: remoteUser.role,
                                    storeId: primaryStoreId,
                                    storeIds: (remoteUser as any).storeIds || (primaryStoreId ? [primaryStoreId] : []),
                                    active: remoteUser.active,
                                    createdAt: (remoteUser.createdAt as number) || Date.now(),
                                    updatedAt: remoteUser.updatedAt || Date.now(),
                                } as any;
                                await db.put('users', toSave);
                            }
                            catch (e) {
                            }
                            const userData = {
                                id: remoteUser.id,
                                username: remoteUser.username,
                                phone: remoteUser.phone,
                                email: remoteUser.email,
                                role: remoteUser.role,
                                storeId: primaryStoreId,
                                storeIds: (remoteUser as any).storeIds || (primaryStoreId ? [primaryStoreId] : []),
                                active: remoteUser.active,
                                pinEnabled: (remoteUser as any).pinEnabled || false,
                                authToken: (remoteUser as any).token ? String((remoteUser as any).token) : undefined,
                            };
                            setUser(userData);
                            setPendingUser(null);
                            setIsLocked(false);
                            try {
                                await secureStorage.setItem('pos-user', JSON.stringify(userData));
                                try {
                                    localStorage.setItem('pos-user', JSON.stringify(userData));
                                }
                                catch (e) { }
                            }
                            catch (e) {
                                try {
                                    localStorage.setItem('pos-user', JSON.stringify(userData));
                                }
                                catch (ee) { }
                            }
                            // reset pin failures and locked flag when logging in fresh from backend
                            try {
                                localStorage.removeItem(`pos-pin-fails-${userData.id}`);
                                localStorage.removeItem(`pos-pin-locked-${userData.id}`);
                            }
                            catch (e) {
                            }
                            setPinFailState({ userId: userData.id, count: 0 });
                            localStorage.removeItem('pos-login-last-error');
                            // Mise en cache de l'admin pour les futurs emails
                            try {
                                const cacheResult = await cacheAdminData(userData.storeId);
                                if (cacheResult) {
                                    const adminCount = (cacheResult as any)?.allStoreAdmins?.length || 1;
                                }
                                else {
                                }
                            }
                            catch (cacheError) {
                            }
                            // Envoi automatique d'un email à l'admin après connexion réussie
                            try {
                                await sendLoginNotificationEmail(userData);
                            }
                            catch (e) {
                            }
                            try {
                                await sendLoginInboxNotification(userData);
                            }
                            catch (e) {
                            }
                            return true;
                        }
                    }
                    if (res.status === 401 || res.status === 403) {
                        localStorage.setItem('pos-login-last-error', 'NumÃ©ro de tÃ©lÃ©phone ou mot de passe incorrect');
                    }
                }
                catch (e) {
                }
            }
            // 2. Si offline ou si le backend n'a pas validé, tenter la connexion locale (hors-ligne)
            for (const p of candidatePhones) {
                try {
                    localUser = (await db.getFromIndex('users', 'by-phone', p)) as UserRecord | undefined;
                    const localPasswordHash = localUser?.passwordHash;
                    const candidateHash = localPasswordHash ? await hashPasswordForCache(password) : '';
                    const legacyPasswordMatches = !!(localUser && localUser.password === password);
                    const hashedPasswordMatches = !!(localUser && localPasswordHash && localPasswordHash === candidateHash);
                    if (localUser && (legacyPasswordMatches || hashedPasswordMatches)) {
                        const primaryStoreId = resolvePrimaryStoreId(localUser.storeId, (localUser as any).storeIds);
                        let localStoreIsInactive = false;
                        if (localUser.role !== 'super_admin' && primaryStoreId) {
                            try {
                                const localStore = await db.get('stores', primaryStoreId);
                                if (localStore) {
                                    localStoreIsInactive = !isActiveFlag(localStore.active);
                                }
                            }
                            catch (e) {
                            }
                        }
                        if (!isActiveFlag(localUser.active) && !localStoreIsInactive) {
                            return false; // Utilisateur désactivé
                        }
                        // login local (hors-ligne)
                        const userData = {
                            id: localUser.id,
                            username: localUser.username,
                            phone: localUser.phone,
                            email: localUser.email,
                            role: localUser.role,
                            storeId: primaryStoreId,
                            storeIds: (localUser as any).storeIds || (primaryStoreId ? [primaryStoreId] : []),
                            active: localUser.active,
                            pinEnabled: (localUser as any).pinEnabled || false,
                            authToken: await getAuthToken() || undefined,
                        };
                        setUser(userData);
                        setPendingUser(null);
                        setIsLocked(false);
                        try {
                            await secureStorage.setItem('pos-user', JSON.stringify(userData));
                            try {
                                localStorage.setItem('pos-user', JSON.stringify(userData));
                            }
                            catch (e) { }
                        }
                        catch (e) {
                            try {
                                localStorage.setItem('pos-user', JSON.stringify(userData));
                            }
                            catch (ee) { }
                        }
                        // reset pin failures and locked flag for this user
                        try {
                            localStorage.removeItem(`pos-pin-fails-${userData.id}`);
                            localStorage.removeItem(`pos-pin-locked-${userData.id}`);
                        }
                        catch (e) {
                        }
                        setPinFailState({ userId: userData.id, count: 0 });
                        localStorage.removeItem('pos-login-last-error');
                        // Mise en cache de l'admin pour les futurs emails (offline)
                        try {
                            await cleanupAdminCache();
                        }
                        catch (e) {
                        }
                        try {
                            await sendLoginInboxNotification(userData);
                        }
                        catch (e) {
                        }
                        return true;
                    }
                }
                catch (e) {
                }
            }
            // Si aucune méthode n'a fonctionné
            if (!localUser) {
                try {
                    const allUsers = await db.getAll('users') as UserRecord[];
                    localUser = allUsers.find((candidate) => candidatePhones.some((p) => phonesMatch(p, candidate.phone)));
                    if (localUser) {
                        const localPasswordHash = localUser.passwordHash;
                        const candidateHash = localPasswordHash ? await hashPasswordForCache(password) : '';
                        const legacyPasswordMatches = !!(localUser.password === password);
                        const hashedPasswordMatches = !!(localPasswordHash && localPasswordHash === candidateHash);
                        if (legacyPasswordMatches || hashedPasswordMatches) {
                            const primaryStoreId = resolvePrimaryStoreId(localUser.storeId, (localUser as any).storeIds);
                            let localStoreIsInactive = false;
                            if (localUser.role !== 'super_admin' && primaryStoreId) {
                                try {
                                    const localStore = await db.get('stores', primaryStoreId);
                                    if (localStore) {
                                        localStoreIsInactive = !isActiveFlag(localStore.active);
                                    }
                                }
                                catch (e) {
                                }
                            }
                            if (!isActiveFlag(localUser.active) && !localStoreIsInactive) {
                                return false;
                            }
                            const userData = {
                                id: localUser.id,
                                username: localUser.username,
                                phone: localUser.phone,
                                email: localUser.email,
                                role: localUser.role,
                                storeId: primaryStoreId,
                                storeIds: (localUser as any).storeIds || (primaryStoreId ? [primaryStoreId] : []),
                                active: localUser.active,
                                pinEnabled: (localUser as any).pinEnabled || false,
                                authToken: await getAuthToken() || undefined,
                            };
                            setUser(userData);
                            setPendingUser(null);
                            setIsLocked(false);
                            try {
                                await secureStorage.setItem('pos-user', JSON.stringify(userData));
                                try {
                                    localStorage.setItem('pos-user', JSON.stringify(userData));
                                }
                                catch (e) { }
                            }
                            catch (e) {
                                try {
                                    localStorage.setItem('pos-user', JSON.stringify(userData));
                                }
                                catch (ee) { }
                            }
                            try {
                                localStorage.removeItem(`pos-pin-fails-${userData.id}`);
                                localStorage.removeItem(`pos-pin-locked-${userData.id}`);
                            }
                            catch (e) {
                            }
                            setPinFailState({ userId: userData.id, count: 0 });
                            localStorage.removeItem('pos-login-last-error');
                            try {
                                await cleanupAdminCache();
                            }
                            catch (e) {
                            }
                            try {
                                await sendLoginInboxNotification(userData);
                            }
                            catch (e) {
                            }
                            return true;
                        }
                    }
                }
                catch (e) {
                }
            }
            if (!remoteAttempted && !backendIsUp) {
                localStorage.setItem('pos-login-last-error', 'Première connexion: une connexion Internet est requise.');
            }
            else {
                localStorage.setItem('pos-login-last-error', 'Numéro de téléphone ou mot de passe incorrect');
            }
            return false;
        }
        catch (error) {
            return false;
        }
    };
    const logout = () => {
        setUser(null);
        setPendingUser(null);
        setIsLocked(false);
        clearAuthToken().catch(() => { });
        // remove from secure storage and localStorage (fire-and-forget)
        secureStorage.removeItem('pos-user').catch(() => { });
        try {
            localStorage.removeItem('pos-user');
        }
        catch (e) { }
    };
    const setActiveStore = async (storeId: string) => {
        // update in-memory user and persist to secure/local storage and local DB
        try {
            if (!user)
                return;
            const previousStoreId = String(user.storeId || '').trim();
            const nextStoreId = String(storeId || '').trim();
            if (!nextStoreId) {
                throw new Error('Magasin invalide');
            }
            try {
                const db = await getDB();
                const targetStore = await db.get('stores', nextStoreId);
                if (targetStore) {
                    const accessState = getStoreAccessState(targetStore);
                    if (!accessState.active) {
                        throw new Error(accessState.reason === 'expired'
                            ? `Le magasin ${targetStore.name || nextStoreId} est expire. Retour sur le magasin precedent.`
                            : `Le magasin ${targetStore.name || nextStoreId} est desactive. Retour sur le magasin precedent.`);
                    }
                }
            }
            catch (validationError) {
                if (validationError instanceof Error) {
                    throw validationError;
                }
                throw new Error(previousStoreId
                    ? 'Impossible de verifier le magasin cible. Retour sur le magasin precedent.'
                    : 'Impossible de verifier le magasin cible.');
            }
            const newUser = { ...user, storeId: nextStoreId } as User;
            setUser(newUser);
            try {
                await secureStorage.setItem('pos-user', JSON.stringify(newUser));
                try {
                    localStorage.setItem('pos-user', JSON.stringify(newUser));
                }
                catch (e) { }
            }
            catch (e) {
                try {
                    localStorage.setItem('pos-user', JSON.stringify(newUser));
                }
                catch (e) { }
            }
            // Also update local DB primary storeId for this user (for compatibility)
            try {
                const db = await getDB();
                const rec = await db.get('users', newUser.id);
                if (rec) {
                    await db.put('users', { ...rec, storeId: nextStoreId });
                }
            }
            catch (e) {
            }
        }
        catch (e) {
            throw e;
        }
    };
    // Verify PIN: the PINs are expected to be stored in the local DB users table
    const verifyPin = async (pin: string): Promise<boolean> => {
        try {
            const db = await getDB();
            // Prefer localStorage for sync performance, but fallback to secure storage
            let stored = localStorage.getItem('pos-user');
            if (!stored) {
                try {
                    stored = await secureStorage.getItem('pos-user');
                    if (stored) {
                        try {
                            localStorage.setItem('pos-user', stored);
                        }
                        catch (e) { }
                    }
                }
                catch (e) {
                }
            }
            if (!stored)
                return false;
            const parsed: User = JSON.parse(stored);
            // fetch user record from local DB
            const record = (await db.get('users', parsed.id)) as UserRecord | undefined;
            if (!record) {
                // Local DB was cleared or user record is missing. In that case,
                // drop the local "pos-user" and require a full login (online).
                try {
                    localStorage.removeItem('pos-user');
                    // set a helpful message for the login screen
                    localStorage.setItem('pos-login-last-error', 'Données locales manquantes. Veuillez vous reconnecter en ligne.');
                }
                catch (e) {
                }
                // clear in-memory state
                setUser(null);
                setPendingUser(null);
                setPinFailState({ count: 0 });
                return false;
            }
            // Check if PIN is enabled for this user
            // Treat undefined, null, 0, and false as "PIN disabled"
            const isPinEnabled = record.pinEnabled === true || (typeof record.pinEnabled === 'number' && record.pinEnabled === 1);
            if (!isPinEnabled) {
                // PIN not enabled, automatically unlock
                setUser(parsed);
                setPendingUser(null);
                setIsLocked(false);
                return true;
            }
            const storedPinRaw = String(record.pin || '').trim();
            const inputPinRaw = String(pin || '').trim();
            const storedDigits = storedPinRaw.replace(/\D/g, '');
            const inputDigits = inputPinRaw.replace(/\D/g, '');
            if (storedDigits && storedDigits === inputDigits) {
                // unlock session: keep `user` as-is and clear the locked flag so the app
                // resumes without remounting underlying pages.
                setUser(parsed);
                setPendingUser(null);
                setIsLocked(false);
                // reset failures
                try {
                    localStorage.removeItem(`pos-pin-fails-${parsed.id}`);
                }
                catch (e) {
                }
                setPinFailState({ userId: parsed.id, count: 0 });
                return true;
            }
            // wrong pin: increment failure count
            // Debug: log masked stored vs input to help diagnose mismatches
            try {
                const mask = (s: string) => (s.length <= 2 ? s : `${'*'.repeat(s.length - 2)}${s.slice(-2)}`);
            }
            catch (e) {
                // ignore logging errors
            }
            const key = `pos-pin-fails-${parsed.id}`;
            const prev = parseInt(localStorage.getItem(key) || '0', 10) || 0;
            const next = prev + 1;
            try {
                localStorage.setItem(key, String(next));
            }
            catch (e) {
            }
            setPinFailState({ userId: parsed.id, count: next });
            // if reached 5 attempts, mark as locked (require full login)
            if (next >= 5) {
                // we leave pendingUser in place but indicate locked via localStorage
                try {
                    localStorage.setItem(`pos-pin-locked-${parsed.id}`, '1');
                }
                catch (e) {
                }
            }
            return false;
        }
        catch (err) {
            return false;
        }
    };
    const getPinFailedCount = () => {
        const stored = localStorage.getItem('pos-user');
        if (!stored)
            return 0;
        try {
            const parsed: User = JSON.parse(stored);
            const key = `pos-pin-fails-${parsed.id}`;
            return parseInt(localStorage.getItem(key) || '0', 10) || 0;
        }
        catch (e) {
            return 0;
        }
    };
    const isPinLocked = () => {
        const stored = localStorage.getItem('pos-user');
        if (!stored)
            return false;
        try {
            const parsed: User = JSON.parse(stored);
            return localStorage.getItem(`pos-pin-locked-${parsed.id}`) === '1';
        }
        catch (e) {
            return false;
        }
    };
    const resetPinFailures = () => {
        const stored = localStorage.getItem('pos-user');
        if (!stored)
            return;
        try {
            const parsed: User = JSON.parse(stored);
            localStorage.removeItem(`pos-pin-fails-${parsed.id}`);
            localStorage.removeItem(`pos-pin-locked-${parsed.id}`);
            setPinFailState({ userId: parsed.id, count: 0 });
        }
        catch (e) { }
    };
    // Auto-lock on page visibility change / blur: when user switches app, require PIN again
    useEffect(() => {
        const handleVisibility = async () => {
            // Respect a temporary suppression flag (e.g., file picker/upload flows)
            try {
                if ((window as any).__suppressPinLock)
                    return;
            }
            catch (e) { }
            if (document.hidden) {
                // Check if PIN is enabled before locking
                const stored = localStorage.getItem('pos-user');
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        // Check if user has PIN enabled
                        const db = await getDB();
                        const userRecord = await db.get('users', parsed.id) as any;
                        const isPinEnabled = userRecord && (userRecord.pinEnabled === true || (typeof userRecord.pinEnabled === 'number' && userRecord.pinEnabled === 1));
                        // Only lock if PIN is enabled
                        if (!isPinEnabled) {
                            return;
                        }
                        // move to pending state (require PIN to unlock)
                        // keep the user object but mark session as locked so overlay appears
                        setUser(parsed);
                        setPendingUser(null);
                        setIsLocked(true);
                    }
                    catch (e) {
                    }
                }
            }
        };
        window.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('blur', handleVisibility);
        return () => {
            window.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('blur', handleVisibility);
        };
    }, []);
    return (<AuthContext.Provider value={{ user, pendingUser, login, logout, verifyPin, getPinFailedCount, isPinLocked, resetPinFailures, isLocked, isLoading, setPendingUser, setActiveStore }}>
      {children}
    </AuthContext.Provider>);
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context as AuthContextType & {
        setPendingUser: (u: any) => void;
    };
}
