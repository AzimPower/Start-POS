import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getDB } from '@/lib/db';
import { getEmailSettings } from '@/lib/emailSettingsCache';
import * as secureStorage from '@/lib/secureStorage';
import { refreshAllFromBackend } from '@/lib/sync';
import { backendAvailable } from '@/lib/backend';
import { pendingEmailService } from '@/lib/pendingEmailService';

// Function to force refresh admin cache for a specific store
const forceRefreshAdminCache = async (storeId: string) => {
  try {
    const db = await getDB();
    // Supprimer le cache existant pour forcer la mise à jour
    await db.delete('adminCache', storeId);
    console.log('🔄 [FORCE-REFRESH] Cache admin supprimé pour store:', storeId);
    
    // Recréer le cache
    return await cacheAdminData(storeId);
  } catch (error) {
    console.error('❌ [FORCE-REFRESH] Erreur lors du rafraichissement forcé:', error);
    return null;
  }
};

// Function to cache admin data locally for a specific store
const cacheAdminData = async (storeId: string) => {
  try {
    const db = await getDB();
    console.log('🔍 [CACHE-ADMIN] Récupération admins pour store:', storeId);
    
    // Vérifier d'abord si on a déjà un cache récent (moins de 5min pour test et debug)
    try {
      const existingCache = await db.get('adminCache', storeId);
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // Réduit à 5min pour test
      if (existingCache && existingCache.cachedAt > fiveMinutesAgo && existingCache.allStoreAdmins && existingCache.allStoreAdmins.length > 0) {
        console.log(`✅ [CACHE-ADMIN] Cache récent déjà disponible (${existingCache.allStoreAdmins.length} admins), skip update`);
        // Debug : afficher les admins en cache
        console.log('🔍 [CACHE-DEBUG] Admins en cache:', existingCache.allStoreAdmins.map((a: any) => ({
          username: a.username,
          email: a.email,
          storeId: a.storeId
        })));
        return existingCache;
      } else if (existingCache) {
        console.log('🔄 [CACHE-ADMIN] Cache existant mais expiré ou incomplet, mise à jour nécessaire');
      }
    } catch (e) {
      console.log('🔍 [CACHE-ADMIN] Pas de cache existant ou erreur lecture');
    }
    
    // Vérifier la connectivité avant de tenter la récupération
    if (!navigator.onLine) {
      console.log('📵 [CACHE-ADMIN] Hors ligne, impossible de mettre à jour le cache admins');
      return null;
    }
    
    // Récupérer tous les users depuis le backend
    const usersResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (usersResponse.ok) {
      const users = await usersResponse.json();
      console.log('🔍 [CACHE-ADMIN] Nombre d\'utilisateurs récupérés:', users.length);
      
      // Debug: montrer tous les admins avec leurs stores
      const allAdmins = users.filter((u: any) => u.role === 'admin');
      console.log('🔍 [DEBUG] TOUS les admins dans le système:');
      allAdmins.forEach((admin: any) => {
        console.log(`  - ${admin.username} (${admin.email || 'no email'}): storeId=${admin.storeId}, storeIds=${JSON.stringify(admin.storeIds)}`);
      });
      
      // Chercher TOUS les admins de ce store qui ont un email
      // Utiliser la même logique que l'API users.php
      const storeAdmins = users.filter((u: any) => {
        const isAdmin = u.role === 'admin';
        const hasEmail = u.email && u.email.trim() !== '';
        
        // Vérifier si l'admin est associé à ce store
        let isAssociatedToStore = false;
        
        // Méthode 1: storeId direct (legacy) - comme dans users.php
        if (u.storeId === storeId) {
          isAssociatedToStore = true;
        }
        
        // Méthode 2: storeIds array (système principal) - comme dans users.php
        if (u.storeIds && Array.isArray(u.storeIds) && u.storeIds.includes(storeId)) {
          isAssociatedToStore = true;
        }
        
        const result = isAdmin && hasEmail && isAssociatedToStore;
        
        // Debug détaillé pour chaque admin avec email
        if (isAdmin && hasEmail) {
          console.log(`🔍 [FILTER] Admin ${u.username} (${u.email}):`);
          console.log(`  - storeId: ${u.storeId}`);
          console.log(`  - storeIds: ${JSON.stringify(u.storeIds)}`);
          console.log(`  - Recherche pour store: ${storeId}`);
          console.log(`  - Associé: ${isAssociatedToStore}`);
          console.log(`  - Inclus: ${result}`);
        }
        
        return result;
      });
      
      console.log('🔍 [CACHE-ADMIN] Admins trouvés pour store', storeId, ':', storeAdmins.length);
      console.log('🔍 [CACHE-ADMIN] Liste des admins trouvés:', storeAdmins.map(a => ({
        username: a.username,
        email: a.email,
        storeId: a.storeId,
        storeIds: a.storeIds
      })));
      
      // Debug supplémentaire : tous les admins avec email du système
      const allAdminsWithEmail = users.filter((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
      console.log('🔍 [DEBUG] TOUS les admins avec email dans le système:', allAdminsWithEmail.map(a => ({
        username: a.username,
        email: a.email,
        storeId: a.storeId,
        storeIds: a.storeIds
      })));
      
      if (storeAdmins.length > 0) {
        // Prendre le premier admin avec email pour ce store
        const admin = storeAdmins[0];
        
        // Stocker l'admin en cache avec timestamp et storeId pour chaque admin
        const adminCache = {
          id: storeId, // Utiliser storeId comme clé
          username: admin.username,
          email: admin.email,
          role: admin.role,
          storeId: admin.storeId,
          cachedAt: Date.now(),
          allStoreAdmins: storeAdmins.map(a => ({ // Sauver tous les admins du store avec leur storeId
            id: a.id,
            username: a.username,
            email: a.email,
            storeId: a.storeId || storeId // S'assurer que chaque admin a bien le storeId
          }))
        };
        
        await db.put('adminCache', adminCache);
        console.log('✅ [CACHE-ADMIN] Admin principal mis en cache pour store', storeId, ':', admin.email);
        console.log('✅ [CACHE-ADMIN] Tous les admins du store sauvés:', adminCache.allStoreAdmins);
        return adminCache;
      } else {
        console.log('⚠️ [CACHE-ADMIN] Aucun admin avec email trouvé pour store', storeId);
        
        // Fallback : chercher un admin avec email dans n'importe quel store
        const anyAdmin = users.find((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
        if (anyAdmin) {
          const adminCache = {
            id: storeId,
            username: anyAdmin.username,
            email: anyAdmin.email,
            role: anyAdmin.role,
            storeId: anyAdmin.storeId,
            cachedAt: Date.now(),
            isFallback: true
          };
          
          await db.put('adminCache', adminCache);
          console.log('🔄 [CACHE-ADMIN] Admin fallback mis en cache:', anyAdmin.email);
          return adminCache;
        }
        
        // Debug : montrer les rôles et stores disponibles
        const roles = users.map(u => u.role).filter(r => r);
        const stores = users.map(u => u.storeId).filter(s => s);
        console.log('🔍 [CACHE-ADMIN] Rôles trouvés:', [...new Set(roles)]);
        console.log('🔍 [CACHE-ADMIN] Stores trouvés:', [...new Set(stores)]);
      }
    } else {
      console.log('❌ [CACHE-ADMIN] Erreur HTTP récupération users:', usersResponse.status);
    }
  } catch (error) {
    console.error('❌ [CACHE-ADMIN] Erreur lors de la mise en cache admin:', error);
  }
  return null;
};

// Function to get cached admin emails (for offline use)
const getCachedAdminEmails = async (storeId: string): Promise<string[]> => {
  try {
    const db = await getDB();
    const cachedAdmin = await db.get('adminCache', storeId);
    
    if (cachedAdmin && cachedAdmin.allStoreAdmins && cachedAdmin.allStoreAdmins.length > 0) {
      // Filtrer strictement par storeId
      const emails = cachedAdmin.allStoreAdmins
        .filter((admin: any) => {
          const hasValidEmail = admin.email && admin.email.trim() !== '';
          const isCorrectStore = !admin.storeId || admin.storeId === storeId;
          return hasValidEmail && isCorrectStore;
        })
        .map((admin: any) => admin.email);
      console.log('📧 [CACHE-ADMIN] Emails admin en cache pour store', storeId, ':', emails.length);
      return emails;
    }
    
    // Fallback: utiliser l'admin principal en cache s'il correspond au store
    if (cachedAdmin && cachedAdmin.email && cachedAdmin.email.trim() !== '' &&
        (!cachedAdmin.storeId || cachedAdmin.storeId === storeId)) {
      console.log('📧 [CACHE-ADMIN] Utilisation admin principal en cache:', cachedAdmin.email);
      return [cachedAdmin.email];
    }
    
    console.log('⚠️ [CACHE-ADMIN] Aucun email admin en cache pour store:', storeId);
    return [];
  } catch (error) {
    console.error('❌ [CACHE-ADMIN] Erreur récupération emails cache:', error);
    return [];
  }
};

// Function to clean up admin cache and remove invalid or cross-store entries
const cleanupAdminCache = async () => {
  try {
    const db = await getDB();
    console.log('🧹 [CACHE-CLEANUP] Nettoyage du cache admin...');
    
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
          console.log(`🧹 [CACHE-CLEANUP] Store ${cache.id}: ${originalCount} -> ${updatedCache.allStoreAdmins.length} admins`);
        }
      }
      
      // Supprimer les caches trop anciens (plus de 7 jours)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (cache.cachedAt && cache.cachedAt < sevenDaysAgo) {
        await db.delete('adminCache', cache.id);
        cleaned++;
        console.log(`🧹 [CACHE-CLEANUP] Cache expiré supprimé pour store: ${cache.id}`);
        continue;
      }
      
      // Mettre à jour si nécessaire
      if (needsUpdate) {
        await db.put('adminCache', updatedCache);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`✅ [CACHE-CLEANUP] ${cleaned} entrées nettoyées/mises à jour`);
    }
    
    return cleaned;
  } catch (error) {
    console.error('❌ [CACHE-CLEANUP] Erreur nettoyage cache admin:', error);
    return 0;
  }
};

// Function to send login notification email to admin
const sendLoginNotificationEmail = async (userData: User) => {
  try {
    const db = await getDB();
    
    // Vérifier les paramètres d'email pour les connexions (lit depuis le backend = source de vérité)
    const emailSettings = await getEmailSettings(userData.storeId || '');
    const shouldSendEmail = emailSettings.logins;
    
    if (!shouldSendEmail) {
      console.log('📧 Email désactivé pour les connexions utilisateur');
      return;
    }
    
    // Récupérer l'admin - d'abord en local, puis fallback vers backend
    let admin = null;
    
    // 1. Essayer de récupérer l'admin depuis le stockage local
    try {
      const storedAdmin = await db.get('adminCache', userData.storeId);
      if (storedAdmin && storedAdmin.email && storedAdmin.email.trim() !== '') {
        console.log('🎯 [DEBUG] Admin trouvé en cache local pour email connexion');
        admin = storedAdmin;
      }
    } catch (e) {
      console.log('⚠️ [DEBUG] Erreur lecture admin cache local:', e);
    }
    
    // 2. Si pas trouvé en local, fallback vers backend
    if (!admin) {
      try {
        const usersResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
        if (usersResponse.ok) {
          const users = await usersResponse.json();
          admin = users.find((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
          console.log('🌐 [DEBUG] Admin récupéré depuis backend pour email connexion');
        }
      } catch (adminError) {
        console.error('❌ [DEBUG] Erreur récupération admin depuis backend:', adminError);
      }
    }
    
    if (admin && admin.email) {
      
      // Récupérer le nom du magasin
      const store = await db.get('stores', userData.storeId);
      const storeName = store?.name || userData.storeId || 'Magasin';
      
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
        console.log('🔄 [DEBUG] Envoi email connexion à TOUS les admins du store...');
        const result = await pendingEmailService.sendToAllAdmins({
          message: resume,
          storeName: storeName,
          type: 'receipt', // Utiliser 'receipt' comme type générique pour les connexions
          relatedId: userData.id,
          storeId: userData.storeId,
          userId: userData.id
        });
        
        console.log(`✅ Email de connexion: ${result.sent} envoyés, ${result.queued} en attente sur ${result.totalAdmins} admins`);
        result.results.forEach(r => {
          if (r.sent) {
            console.log('✅ Email connexion envoyé directement à', r.email);
          } else if (r.queued) {
            console.log('📦 Email connexion mis en attente pour', r.email);
          }
        });
      } catch (e) {
        console.warn('❌ Erreur service email connexion:', e);
      }
    } else {
      console.log('⚠️ [DEBUG] Aucun admin avec email trouvé pour la connexion');
    }
  } catch (e) {
    console.warn('❌ Erreur lors de l\'envoi automatique du mail de connexion:', e);
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
}

interface UserRecord extends User {
  password?: string;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [pinFailState, setPinFailState] = useState<{ userId?: string; count: number }>({ count: 0 });
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
        } catch (e) {
          // secure storage plugin might not be available in this environment
          storedUser = null;
        }

        if (!storedUser) {
          try {
            storedUser = localStorage.getItem('pos-user');
          } catch (e) {
            storedUser = null;
          }
        }

  if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            
            // Check if user has PIN enabled before locking
            const db = await getDB();
            let userRecord = await db.get('users', parsed.id) as any;
            
            // For existing users without pinEnabled field, initialize it to false
            let hasPinEnabled = false;
            if (userRecord) {
              // If pinEnabled is explicitly undefined, null, or not present, set it to false in the database
              if (userRecord.pinEnabled === undefined || userRecord.pinEnabled === null || !('pinEnabled' in userRecord)) {
                console.log('🔓 [PIN] Initializing pinEnabled to false for user:', parsed.username);
                try {
                  const updated = { ...userRecord, pinEnabled: false };
                  await db.put('users', updated);
                  userRecord = updated; // Use the updated record
                  hasPinEnabled = false;
                } catch (e) {
                  console.warn('Failed to initialize pinEnabled field:', e);
                  hasPinEnabled = false;
                }
              } else {
                // Check explicitly for true or 1 (anything else is considered disabled)
                hasPinEnabled = userRecord.pinEnabled === true || (typeof userRecord.pinEnabled === 'number' && userRecord.pinEnabled === 1);
                console.log('🔓 [PIN] User PIN enabled status:', hasPinEnabled, 'value:', userRecord.pinEnabled);
              }
            } else {
              console.warn('⚠️ [PIN] No user record found in DB for:', parsed.id);
              hasPinEnabled = false;
            }
            
            // On cold start, restore the user object
            setUser(parsed);
            setPendingUser(null);
            
            // Only lock if PIN is enabled for this user
            if (hasPinEnabled) {
              console.log('🔒 [PIN] Locking session - PIN is enabled');
              // Activate PIN mode: set flag and proactively close existing dialogs so
              // they don't intercept the first PIN click. Also set body attribute
              // so CSS can immediately disable pointer-events on underlying overlays.
              try {
                document.body.setAttribute('data-pin-active', 'true');
              } catch (e) {}
              try {
                const REGISTRY_KEY = '__radix_dialog_registry_v1';
                const reg = (window as any)[REGISTRY_KEY];
                if (reg && typeof reg.forEach === 'function') {
                  reg.forEach((entry: any) => {
                    try { if (entry && typeof entry.forceClose === 'function') entry.forceClose(); } catch (e) {}
                  });
                }
              } catch (e) {}
              setIsLocked(true);
            } else {
              console.log('✅ [PIN] Session unlocked - PIN is disabled');
              // PIN not enabled, don't lock the session
              setIsLocked(false);
            }
            
            // ensure localStorage mirror exists for PIN/visibility flows
            try {
              localStorage.setItem('pos-user', JSON.stringify(parsed));
            } catch (e) {
              // ignore
            }
          } catch (e) {
            console.warn('restore pos-user parse error', e);
          }
        }

        // Rafraîchissement complet désactivé au démarrage : il doit être déclenché explicitement par l'utilisateur (bouton Synchroniser dans le layout)
      } catch (e) {
        console.warn('secureStorage read pos-user error', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (phone: string, password: string): Promise<boolean> => {
    try {
      const db = await getDB();
      // Normalize phone (allow passing with or without +226)
      const candidatePhones = [] as string[];
      const raw = String(phone || '').replace(/[^0-9+]/g, '');
      if (raw.startsWith('+')) candidatePhones.push(raw);
      else candidatePhones.push(`+226${raw}`);
      candidatePhones.push(raw.replace(/^\+/, ''));

      const backendIsUp = await backendAvailable();
      let remoteUser: UserRecord | undefined = undefined;
      let localUser: UserRecord | undefined = undefined;

      // 1. Toujours prioriser la vérification sur le serveur si possible
      if (backendIsUp) {
        try {
          const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
          if (res.ok) {
            const remoteUsers = (await res.json()) as UserRecord[];
            remoteUser = remoteUsers.find((u) => candidatePhones.includes(String(u.phone || '')) && u.password === password);
            if (remoteUser) {
              // persist into local DB for future offline login
              try {
                const toSave = {
                  id: remoteUser.id,
                  username: remoteUser.username,
                  phone: remoteUser.phone,
                  password: remoteUser.password || '',
                  pin: remoteUser.pin || '',
                  pinEnabled: (remoteUser as any).pinEnabled || false,
                  role: remoteUser.role,
                  storeId: remoteUser.storeId,
                  storeIds: (remoteUser as any).storeIds || (remoteUser.storeId ? [remoteUser.storeId] : []),
                  active: remoteUser.active,
                  createdAt: (remoteUser.createdAt as number) || Date.now(),
                  updatedAt: remoteUser.updatedAt || Date.now(),
                } as any;
                await db.put('users', toSave);
              } catch (e) {
                console.warn('put remote user to db error', e);
              }
              const userData = {
                id: remoteUser.id,
                username: remoteUser.username,
                phone: remoteUser.phone,
                email: remoteUser.email,
                role: remoteUser.role,
                storeId: remoteUser.storeId,
                storeIds: (remoteUser as any).storeIds || (remoteUser.storeId ? [remoteUser.storeId] : []),
                active: remoteUser.active,
                pinEnabled: (remoteUser as any).pinEnabled || false,
              };
              setUser(userData);
              setPendingUser(null);
              setIsLocked(false);
              try {
                await secureStorage.setItem('pos-user', JSON.stringify(userData));
                try { localStorage.setItem('pos-user', JSON.stringify(userData)); } catch (e) {}
              } catch (e) {
                console.warn('secureStorage set pos-user error', e);
                try { localStorage.setItem('pos-user', JSON.stringify(userData)); } catch (ee) {}
              }
              // reset pin failures and locked flag when logging in fresh from backend
              try {
                localStorage.removeItem(`pos-pin-fails-${userData.id}`);
                localStorage.removeItem(`pos-pin-locked-${userData.id}`);
              } catch (e) {
                console.warn('clear pin flags after backend login error', e);
              }
              setPinFailState({ userId: userData.id, count: 0 });
              localStorage.removeItem('pos-login-last-error');
              // Mise en cache de l'admin pour les futurs emails
              try {
                const cacheResult = await cacheAdminData(userData.storeId);
                if (cacheResult) {
                  const adminCount = (cacheResult as any)?.allStoreAdmins?.length || 1;
                  console.log('✅ [AUTH] Cache admins rafraichi lors reconnexion:', adminCount, 'admins');
                } else {
                  console.log('⚠️ [AUTH] Pas de mise à jour cache admins lors reconnexion');
                }
              } catch (cacheError) {
                console.warn('⚠️ [AUTH] Échec cache admins lors reconnexion:', cacheError);
              }
              // Envoi automatique d'un email à l'admin après connexion réussie
              try {
                await sendLoginNotificationEmail(userData);
              } catch (e) {
                console.warn('Failed to send login notification email:', e);
              }
              return true;
            }
          }
        } catch (e) {
          console.warn('backend users fetch error during login', e);
        }
      }

      // 2. Si offline ou si le backend n'a pas validé, tenter la connexion locale (hors-ligne)
      for (const p of candidatePhones) {
        try {
          localUser = (await db.getFromIndex('users', 'by-phone', p)) as UserRecord | undefined;
          if (localUser && localUser.password === password) {
            if (localUser.active === false) {
              return false; // Utilisateur désactivé
            }
            // login local (hors-ligne)
            const userData = {
              id: localUser.id,
              username: localUser.username,
              phone: localUser.phone,
              email: localUser.email,
              role: localUser.role,
              storeId: localUser.storeId,
              storeIds: (localUser as any).storeIds || (localUser.storeId ? [localUser.storeId] : []),
              active: localUser.active,
              pinEnabled: (localUser as any).pinEnabled || false,
            };
            setUser(userData);
            setPendingUser(null);
            setIsLocked(false);
            try {
              await secureStorage.setItem('pos-user', JSON.stringify(userData));
              try { localStorage.setItem('pos-user', JSON.stringify(userData)); } catch (e) {}
            } catch (e) {
              console.warn('secureStorage set pos-user error', e);
              try { localStorage.setItem('pos-user', JSON.stringify(userData)); } catch (ee) {}
            }
            // reset pin failures and locked flag for this user
            try {
              localStorage.removeItem(`pos-pin-fails-${userData.id}`);
              localStorage.removeItem(`pos-pin-locked-${userData.id}`);
            } catch (e) {
              console.warn('clear pin flags error', e);
            }
            setPinFailState({ userId: userData.id, count: 0 });
            localStorage.removeItem('pos-login-last-error');
            // Mise en cache de l'admin pour les futurs emails (offline)
            try {
              await cleanupAdminCache();
            } catch (e) {
              console.warn('⚠️ [AUTH] Échec nettoyage cache admin:', e);
            }
            return true;
          }
        } catch (e) {
          console.warn('getFromIndex error', e);
        }
      }

      // Si aucune méthode n'a fonctionné
      if (!backendIsUp) {
        localStorage.setItem('pos-login-last-error', 'Première connexion: une connexion Internet est requise.');
      } else {
        localStorage.setItem('pos-login-last-error', 'Numéro de téléphone ou mot de passe incorrect');
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setPendingUser(null);
    setIsLocked(false);
    // remove from secure storage and localStorage (fire-and-forget)
    secureStorage.removeItem('pos-user').catch(() => {});
    try { localStorage.removeItem('pos-user'); } catch (e) {}
  };

  const setActiveStore = async (storeId: string) => {
    // update in-memory user and persist to secure/local storage and local DB
    try {
      if (!user) return;
      const newUser = { ...user, storeId } as User;
      setUser(newUser);
      try {
        await secureStorage.setItem('pos-user', JSON.stringify(newUser));
        try { localStorage.setItem('pos-user', JSON.stringify(newUser)); } catch (e) {}
      } catch (e) {
        try { localStorage.setItem('pos-user', JSON.stringify(newUser)); } catch (e) {}
      }
      // Also update local DB primary storeId for this user (for compatibility)
      try {
        const db = await getDB();
        const rec = await db.get('users', newUser.id);
        if (rec) {
          await db.put('users', { ...rec, storeId });
        }
      } catch (e) {
        console.warn('setActiveStore db update failed', e);
      }
    } catch (e) {
      console.warn('setActiveStore error', e);
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
            try { localStorage.setItem('pos-user', stored); } catch (e) {}
          }
        } catch (e) {
          console.warn('secureStorage read pos-user in verifyPin error', e);
        }
      }
      if (!stored) return false;
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
        } catch (e) {
          console.warn('clear pos-user after missing record error', e);
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
      console.log('🔓 [verifyPin] PIN enabled status:', isPinEnabled, 'value:', record.pinEnabled);
      if (!isPinEnabled) {
        console.log('✅ [verifyPin] PIN disabled - auto-unlocking');
        // PIN not enabled, automatically unlock
        setUser(parsed);
        setPendingUser(null);
        setIsLocked(false);
        return true;
      }
      
      console.log('🔐 [verifyPin] PIN enabled - checking PIN...');
      
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
        } catch (e) {
          console.warn('clear pin fail after success error', e);
        }
        setPinFailState({ userId: parsed.id, count: 0 });
        return true;
      }

      // wrong pin: increment failure count
      // Debug: log masked stored vs input to help diagnose mismatches
      try {
        const mask = (s: string) => (s.length <= 2 ? s : `${'*'.repeat(s.length - 2)}${s.slice(-2)}`);
        console.debug('PIN mismatch', { stored: mask(storedDigits), input: mask(inputDigits), storedLen: storedDigits.length, inputLen: inputDigits.length });
      } catch (e) {
        // ignore logging errors
      }
      const key = `pos-pin-fails-${parsed.id}`;
      const prev = parseInt(localStorage.getItem(key) || '0', 10) || 0;
      const next = prev + 1;
      try {
        localStorage.setItem(key, String(next));
      } catch (e) {
        console.warn('set pin fail count error', e);
      }
      setPinFailState({ userId: parsed.id, count: next });
      // if reached 5 attempts, mark as locked (require full login)
      if (next >= 5) {
        // we leave pendingUser in place but indicate locked via localStorage
        try {
          localStorage.setItem(`pos-pin-locked-${parsed.id}`, '1');
        } catch (e) {
          console.warn('set pin locked flag error', e);
        }
      }
      return false;
    } catch (err) {
      console.error('verifyPin err', err);
      return false;
    }
  };

  const getPinFailedCount = () => {
    const stored = localStorage.getItem('pos-user');
    if (!stored) return 0;
    try {
      const parsed: User = JSON.parse(stored);
      const key = `pos-pin-fails-${parsed.id}`;
      return parseInt(localStorage.getItem(key) || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  };

  const isPinLocked = () => {
    const stored = localStorage.getItem('pos-user');
    if (!stored) return false;
    try {
      const parsed: User = JSON.parse(stored);
      return localStorage.getItem(`pos-pin-locked-${parsed.id}`) === '1';
    } catch (e) {
      return false;
    }
  };

  const resetPinFailures = () => {
    const stored = localStorage.getItem('pos-user');
    if (!stored) return;
    try {
      const parsed: User = JSON.parse(stored);
      localStorage.removeItem(`pos-pin-fails-${parsed.id}`);
      localStorage.removeItem(`pos-pin-locked-${parsed.id}`);
      setPinFailState({ userId: parsed.id, count: 0 });
    } catch (e) {}
  };

  // Auto-lock on page visibility change / blur: when user switches app, require PIN again
  useEffect(() => {
    const handleVisibility = async () => {
      // Respect a temporary suppression flag (e.g., file picker/upload flows)
      try {
        if ((window as any).__suppressPinLock) return;
      } catch (e) {}
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
            
            console.log('👁️ [Visibility] Tab hidden - PIN enabled:', isPinEnabled);
            
            // Only lock if PIN is enabled
            if (!isPinEnabled) {
              console.log('✅ [Visibility] PIN disabled - not locking');
              return;
            }
            
            console.log('🔒 [Visibility] Locking session');
            // move to pending state (require PIN to unlock)
            // keep the user object but mark session as locked so overlay appears
            setUser(parsed);
            setPendingUser(null);
            // Activate PIN mode early: set body attribute and force-close any dialogs
            try {
              document.body.setAttribute('data-pin-active', 'true');
            } catch (e) {}
            try {
              const REGISTRY_KEY = '__radix_dialog_registry_v1';
              const reg = (window as any)[REGISTRY_KEY];
              if (reg && typeof reg.forEach === 'function') {
                reg.forEach((entry: any) => {
                  try { if (entry && typeof entry.forceClose === 'function') entry.forceClose(); } catch (e) {}
                });
              }
            } catch (e) {}
            setIsLocked(true);
          } catch (e) {
            console.warn('Error in visibility handler:', e);
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

  return (
    <AuthContext.Provider value={{ user, pendingUser, login, logout, verifyPin, getPinFailedCount, isPinLocked, resetPinFailures, isLocked, isLoading, setPendingUser, setActiveStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context as AuthContextType & { setPendingUser: (u: any) => void };
}
