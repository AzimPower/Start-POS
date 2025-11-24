import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getDB } from '@/lib/db';
import * as secureStorage from '@/lib/secureStorage';
import { refreshAllFromBackend } from '@/lib/sync';
import { backendAvailable } from '@/lib/backend';

interface User {
  id: string;
  username: string;
  phone: string; // Téléphone unique pour la connexion
  role: 'super_admin' | 'admin' | 'cashier';
  storeId: string;
  storeIds?: string[]; // liste des magasins liés à l'utilisateur
  active?: boolean;
}

interface UserRecord extends User {
  password?: string;
  pin?: string;
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
            // On cold start, restore the user object but mark the session as locked.
            // Keeping `user` defined prevents pages from unmounting or losing local
            // component state; `isLocked` controls access and shows the PIN overlay.
            setUser(parsed);
            setPendingUser(null);
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
      // also include raw digits
      candidatePhones.push(raw.replace(/^\+/, ''));

      let userRecord: UserRecord | undefined = undefined;
  for (const p of candidatePhones) {
        try {
          // db.getFromIndex may return unknown; cast to UserRecord
          userRecord = (await db.getFromIndex('users', 'by-phone', p)) as UserRecord | undefined;
          if (userRecord) break;
        } catch (e) {
          console.warn('getFromIndex error', e);
        }
    }
    // Check backend reachability once and reuse the result for subsequent decisions
  const backendIsUp = await backendAvailable();
  if (userRecord && userRecord.password === password) {
        // Vérifier si l'utilisateur est actif
        if (userRecord.active === false) {
          return false; // Utilisateur désactivé
        }
  // If backend is reachable, verify coherence with backend user (ensure server didn't change password/active)
  if (backendIsUp) {
          try {
            const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
            if (res.ok) {
              const remoteUsers = (await res.json()) as UserRecord[];
              const remote = remoteUsers.find((u) => candidatePhones.includes(String(u.phone || '')));
              if (remote) {
                // If server record differs (password or active), require re-login online
                if (remote.active === false || remote.password !== userRecord.password || (remote.updatedAt && userRecord.updatedAt && remote.updatedAt !== userRecord.updatedAt)) {
                  localStorage.setItem('pos-login-last-error', 'Votre compte a été modifié côté serveur. Veuillez vous reconnecter en ligne.');
                  return false;
                }
              }
            }
          } catch (e) {
            console.warn('users fetch error (coherence check)', e);
          }
        }

        const userData = {
          id: userRecord.id,
          username: userRecord.username,
          phone: userRecord.phone,
          role: userRecord.role,
          storeId: userRecord.storeId,
          storeIds: (userRecord as any).storeIds || (userRecord.storeId ? [userRecord.storeId] : []),
          active: userRecord.active,
        };
  // successful local login (either offline or coherence verified)
  // persist user for future PIN-based unlocks
  setUser(userData);
  setPendingUser(null);
  // interactive login should unlock the session immediately
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
  // If backend is reachable, refresh user record from backend to get up-to-date PIN
  if (backendIsUp) {
          try {
            const localDb = await getDB();
            const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
            if (res.ok) {
              const remoteUsers = (await res.json()) as UserRecord[];
              const remote = remoteUsers.find((u) => String(u.phone || '') === String(userData.phone));
              if (remote) {
                try {
                  const toSave = {
                    id: remote.id,
                    username: remote.username,
                    phone: remote.phone,
                    password: remote.password || '',
                    pin: remote.pin || '',
                    role: remote.role,
                    storeId: remote.storeId,
                    storeIds: (remote as any).storeIds || (remote.storeId ? [remote.storeId] : []),
                    active: remote.active,
                    createdAt: (remote.createdAt as number) || Date.now(),
                  } as any;
                  await localDb.put('users', toSave);
                } catch (e) {
                  console.warn('put remote user to db error', e);
                }
                // after syncing remote user, ensure local PIN lock state is cleared
                try {
                  localStorage.removeItem(`pos-pin-fails-${userData.id}`);
                  localStorage.removeItem(`pos-pin-locked-${userData.id}`);
                } catch (e) {
                  console.warn('clear pin flags after sync error', e);
                }
                setPinFailState({ userId: userData.id, count: 0 });
              }
            }
          } catch (e) {
            console.warn('refresh remote user error', e);
          }
        }
        return true;
      }

      // If no local user, require backend access for first-time login
      if (!userRecord && !backendIsUp) {
        localStorage.setItem('pos-login-last-error', 'Première connexion: une connexion Internet est requise.');
        return false;
      }

      // Try to verify against backend when reachable
      if (!userRecord && backendIsUp) {
        try {
          const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
          if (res.ok) {
            const backendUsers = (await res.json()) as UserRecord[];
            const found = backendUsers.find((u) => candidatePhones.includes(String(u.phone || '')) && u.password === password);
            if (found) {
              // persist into local DB for future offline login
              try {
                const toSave = {
                  id: found.id,
                  username: found.username,
                  phone: found.phone,
                  password: found.password || '',
                  pin: found.pin || '',
                  role: found.role,
                  storeId: found.storeId,
                  storeIds: (found as any).storeIds || (found.storeId ? [found.storeId] : []),
                  active: found.active,
                  createdAt: found.createdAt || Date.now(),
                } as any;
                await db.put('users', toSave);
              } catch (e) {
                console.warn('put found user to db error', e);
              }
              const userData = {
                id: found.id,
                username: found.username,
                phone: found.phone,
                role: found.role,
                storeId: found.storeId,
                storeIds: (found as any).storeIds || (found.storeId ? [found.storeId] : []),
                active: found.active,
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
              return true;
            }
          }
        } catch (e) {
          console.warn('backend users fetch error during login', e);
        }
      }

      // default: failed login
      localStorage.setItem('pos-login-last-error', 'Numéro de téléphone ou mot de passe incorrect');
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
    const handleVisibility = () => {
      // Respect a temporary suppression flag (e.g., file picker/upload flows)
      try {
        if ((window as any).__suppressPinLock) return;
      } catch (e) {}
      if (document.hidden) {
        // move to pending state (require PIN to unlock)
        // keep the user object but mark session as locked so overlay appears
        const stored = localStorage.getItem('pos-user');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
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
          } catch (e) {}
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
