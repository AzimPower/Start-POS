import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as NativePrinter from '@/lib/nativePrinter';
import * as secureStorage from '@/lib/secureStorage';
import { useAuth } from '@/contexts/AuthContext';
// Helpers: dynamic Capacitor Storage/App usage with localStorage fallback.
async function storageGet(key: string): Promise<string | null> {
    try {
    // Use runtime import via Function to avoid bundler static analysis
    const importer: any = new Function("return import('@capacitor/storage')");
    const mod = await importer();
    const r = await (mod.Storage.get({ key } as any) as Promise<any>);
    return r && r.value !== undefined ? r.value : localStorage.getItem(key);
  } catch (e) {
    return localStorage.getItem(key);
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  try {
    const importer: any = new Function("return import('@capacitor/storage')");
    const mod = await importer();
    await (mod.Storage.set({ key, value } as any));
  } catch (e) {
    try { localStorage.setItem(key, value); } catch (err) { /* ignore */ }
  }
}

async function addAppResumeListener(cb: (isActive: boolean) => void) {
  try {
    const importer: any = new Function("return import('@capacitor/app')");
    const mod = await importer();
    const listener = mod.App.addListener('appStateChange', (state: any) => cb(state && state.isActive));
    return { remove: () => { try { listener.remove(); } catch (e) {} } };
  } catch (e) {
    // Not available on web; return noop
    return { remove: () => {} };
  }
}
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sun, Printer, ImageIcon, Trash, Check, ZapOff, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getDB, performSyncOp } from '@/lib/db';
import { versionManager } from '@/lib/versionManager';
import { checkForUpdates, forceUpdateApp } from '@/registerServiceWorker';

// BluetoothSerialPlugin type removed — native printing handled via NativePrinter helper

export default function Settings() {
  const { user } = useAuth();
  // Store balance admin section state
  const [store, setStore] = useState<any | null>(null);
  const [loadingStore, setLoadingStore] = useState(false);
  const [manualValue, setManualValue] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Fond de roulement dialog state
  const [fondDialogOpen, setFondDialogOpen] = useState(false);
  const [fondValue, setFondValue] = useState<string>('');
  const [fondNote, setFondNote] = useState<string>('');
  // Bénéfice dialog state
  const [benefDialogOpen, setBenefDialogOpen] = useState(false);
  const [benefValue, setBenefValue] = useState<string>('');
  const [benefNote, setBenefNote] = useState<string>('');
  // Expense categories mapping state
  const [categories, setCategories] = useState<Array<any>>([]);
  const [selectedFondCats, setSelectedFondCats] = useState<Array<string>>([]);
  const [selectedBenefCats, setSelectedBenefCats] = useState<Array<string>>([]);
  // Format currency for XOF
  function formatCurrency(v: number | string | undefined | null) {
    const n = Number(v) || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 2 }).format(n);
  }

  // Fetch store info for admin
  const fetchStore = async () => {
    setLoadingStore(true);
    try {
      const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php');
      if (!res.ok) throw new Error('Erreur fetch stores');
      const data = await res.json();
      const myStore = data && Array.isArray(data) ? data.find((s: any) => s.id === user?.storeId) : null;
      setStore(myStore);
      if (myStore) {
        setFondValue(String(typeof myStore.fond_roulement !== 'undefined' && myStore.fond_roulement !== null ? myStore.fond_roulement : 0));
        setBenefValue(String(typeof myStore.benefice !== 'undefined' && myStore.benefice !== null ? myStore.benefice : 0));
        // load configured categories if provided by API
        try {
          const fc = Array.isArray(myStore.fondCategories) ? myStore.fondCategories.map(String) : [];
          const bc = Array.isArray(myStore.beneficeCategories) ? myStore.beneficeCategories.map(String) : [];
          // ensure mutual exclusivity: if an id is in fond, remove it from benef
          const sanitizedBenef = bc.filter((id: string) => !fc.includes(id));
          setSelectedFondCats(fc);
          setSelectedBenefCats(sanitizedBenef);
        } catch (e) {
          // ignore
        }
      }
      if (myStore && myStore.solde_manual !== null && myStore.solde_manual !== undefined) {
        setManualValue(String(myStore.solde_manual));
      } else if (myStore && typeof myStore.solde !== 'undefined') {
        setManualValue(String(myStore.solde));
      }
    } catch (e) {
      console.warn('fetchStore error', e);
      toast.error('Impossible de récupérer les informations du magasin');
    } finally {
      setLoadingStore(false);
    }
  };

  // Set manual balance handler
  const handleSetManualConfirmed = async () => {
    if (!store) return;
    const value = parseFloat(manualValue as any);
    if (isNaN(value)) {
      toast.error('Valeur invalide');
      return;
    }
    try {
      setLoadingStore(true);
      const body = {
        action: 'set_balance',
        storeId: store.id,
        value: value,
        appliedAt: Date.now(),
        userId: user?.id,
        note: note,
      };
      const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resp = await res.json();
      if (resp && resp.success) {
        toast.success('Solde manuel mis à jour');
        setConfirmOpen(false);
        await fetchStore();
      } else {
        console.warn('set balance error', resp);
        toast.error('Erreur lors de la mise à jour');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur réseau');
    } finally {
      setLoadingStore(false);
    }
  };

  // Set Fond de roulement handler
  const handleSetFondConfirmed = async () => {
    if (!store) return;
    const value = parseFloat(fondValue as any);
    if (isNaN(value)) {
      toast.error('Valeur invalide');
      return;
    }
    try {
      setLoadingStore(true);
      const body = {
        action: 'set_fond_roulement',
        storeId: store.id,
        value: value,
        appliedAt: Date.now(),
        userId: user?.id,
        note: fondNote,
      };
      const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resp = await res.json();
      if (resp && resp.success) {
        toast.success('Fond de roulement mis à jour');
        setFondDialogOpen(false);
        await fetchStore();
      } else {
        console.warn('set fond error', resp);
        toast.error('Erreur lors de la mise à jour');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur réseau');
    } finally {
      setLoadingStore(false);
    }
  };

  // Set Bénéfice handler
  const handleSetBenefConfirmed = async () => {
    if (!store) return;
    const value = parseFloat(benefValue as any);
    if (isNaN(value)) {
      toast.error('Valeur invalide');
      return;
    }
    try {
      setLoadingStore(true);
      const body = {
        action: 'set_benefice',
        storeId: store.id,
        value: value,
        appliedAt: Date.now(),
        userId: user?.id,
        note: benefNote,
      };
      const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resp = await res.json();
      if (resp && resp.success) {
        toast.success('Bénéfice mis à jour');
        setBenefDialogOpen(false);
        await fetchStore();
      } else {
        console.warn('set benef error', resp);
        toast.error('Erreur lors de la mise à jour');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur réseau');
    } finally {
      setLoadingStore(false);
    }
  };

  // Fetch store info on mount for admin/super_admin
  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'super_admin')) {
      fetchStore();
    }
    // eslint-disable-next-line
  }, [user]);

  // Fetch expense categories for mapping UI (filtered to current store)
  useEffect(() => {
    if (!user || !store) return;
    (async () => {
      try {
        const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
        const url = API_BASE + '/api/expense_categories.php?storeId=' + encodeURIComponent(store.id);
        const res = await fetch(url);
        if (!res.ok) return;
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body && body.categories ? body.categories : []);
        setCategories(list || []);
      } catch (e) {
        console.warn('Failed to load expense categories', e);
      }
    })();
  }, [user, store]);

  const toggleFondCat = (id: string) => {
    setSelectedFondCats(prev => {
      const exists = prev.includes(id);
      if (exists) {
        // remove from fond
        return prev.filter(x => x !== id);
      }
      // add to fond and remove from benef if present
      setSelectedBenefCats(bprev => bprev.filter(x => x !== id));
      return [...prev, id];
    });
  };
  const toggleBenefCat = (id: string) => {
    setSelectedBenefCats(prev => {
      const exists = prev.includes(id);
      if (exists) {
        // remove from benef
        return prev.filter(x => x !== id);
      }
      // add to benef and remove from fond if present
      setSelectedFondCats(fprev => fprev.filter(x => x !== id));
      return [...prev, id];
    });
  };

  const handleSaveCategoryMappings = async () => {
    if (!store) return;
    try {
      setLoadingStore(true);
      const body = {
        action: 'set_balance_settings',
        storeId: store.id,
        fondCategories: selectedFondCats,
        beneficeCategories: selectedBenefCats,
      };
      const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resp = await res.json();
      if (resp && resp.success) {
        toast.success('Paramètres de répartition enregistrés');
        await fetchStore();
      } else {
        console.warn('save balance settings error', resp);
        toast.error('Erreur lors de la sauvegarde');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur réseau');
    } finally {
      setLoadingStore(false);
    }
  };
  const [printerConnected, setPrinterConnected] = useState(false);
  const [nativePrinterAvailable, setNativePrinterAvailable] = useState(false);
  const [paired, setPaired] = useState<Array<{ name: string; id: string }>>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [printerAutoConnect, setPrinterAutoConnect] = useState<boolean>(true);
  const [scanning, setScanning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [lastTest, setLastTest] = useState<{ ok: boolean; at: string; message?: string } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    const s = localStorage.getItem('auto_print');
    return s === null ? true : s === 'true';
  });
  const [paperSize, setPaperSize] = useState<string>(() => {
    const p = localStorage.getItem('printer_paper');
    return p || '80';
  });
  const navigate = useNavigate();

  // Verify that a remote logo URL actually exists on the server. If the server
  // returns 404 or not-ok, clear local copies (localStorage + IndexedDB) so the
  // removed file is not displayed from cache.
  const verifyRemoteLogo = async (logoUrl: string | null, storeId?: string | null) => {
    if (!logoUrl) return;
    try {
      // If we have a storeId, prefer asking the stores API for the logo field
      // instead of fetching the raw image (which can be blocked by CORS).
      if (storeId) {
        try {
          const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
          const resStore = await fetch(`${API_BASE}/api/stores.php?id=${encodeURIComponent(storeId)}`);
          if (!resStore.ok) {
            if (resStore.status === 404) {
              // store not found -> remove local copies
              setLogo(null);
              setLogoPreview(null);
              try { localStorage.removeItem('storeLogo'); } catch (e) { /* ignore */ }
              try {
                const db = await getDB();
                const rec = await db.get('stores', storeId);
                if (rec && 'logo' in rec) {
                  const updated = { ...rec } as any;
                  delete updated.logo;
                  await db.put('stores', updated);
                }
              } catch (err) {
                console.warn('Failed to clear logo from IndexedDB during verify', err);
              }
            }
            return;
          }
          const body = await resStore.json();
          const store = Array.isArray(body) ? body[0] : body;
          const backendHasLogo = store && ('logo' in store) && store.logo != null;
          if (!backendHasLogo) {
            // Backend does not have the logo -> clear local copies
            setLogo(null);
            setLogoPreview(null);
            try { localStorage.removeItem('storeLogo'); } catch (e) { /* ignore */ }
            try {
              const db = await getDB();
              const rec = await db.get('stores', storeId);
              if (rec && 'logo' in rec) {
                const updated = { ...rec } as any;
                delete updated.logo;
                await db.put('stores', updated);
              }
            } catch (err) {
              console.warn('Failed to clear logo from IndexedDB during verify', err);
            }
          }
          return;
        } catch (err) {
          console.warn('Failed to verify store via API during verifyRemoteLogo', err);
          return;
        }
      }
      // If we don't have a storeId, fall back to a direct HEAD/GET on the image URL.
      // Be conservative: if the fetch fails due to network/CORS, do not delete local.
      let res: Response | null = null;
      try {
        res = await fetch(logoUrl, { method: 'HEAD' });
      } catch (e) {
        try { res = await fetch(logoUrl, { method: 'GET' }); } catch (err) { res = null; }
      }
      if (!res || !res.ok) {
        // Not found on server (or HEAD/GET failed) -> attempt local cleanup only
        setLogo(null);
        setLogoPreview(null);
        try { localStorage.removeItem('storeLogo'); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      // Don't aggressively delete local copies on network/CORS errors — just log.
      console.warn('Logo verification failed (network/CORS?), skipping delete', err);
    }
  };

  useEffect(() => {
    // Charger les paramètres depuis le localStorage ou la DB si besoin
    (async () => {
      try {
        // darkMode (keep localStorage fallback)
        const savedDark = localStorage.getItem('darkMode');
        if (savedDark) setDarkMode(savedDark === 'true');

        // autoPrint (try Storage first)
        try {
          const ap = await storageGet('auto_print');
          if (ap !== null) setAutoPrint(ap === 'true');
        } catch (e) {
          const apLocal = localStorage.getItem('auto_print');
          if (apLocal !== null) setAutoPrint(apLocal === 'true');
        }

        // printer selection (try secureStorage then Storage then localStorage)
        let storedPrinter: string | null = null;
        try {
          storedPrinter = await secureStorage.getItem('printer_mac');
        } catch (e) {
          storedPrinter = null;
        }
        if (!storedPrinter) {
          try {
            const p = await storageGet('printer_mac');
            if (p) storedPrinter = p;
          } catch (e) {
            if (!storedPrinter) storedPrinter = localStorage.getItem('printer_mac');
          }
        }
        if (storedPrinter) {
          setSelectedPrinter(storedPrinter);
          // load persisted auto-connect flag (secureStorage -> Storage -> localStorage)
          let storedAuto: string | null = null;
          try {
            storedAuto = await secureStorage.getItem('printer_auto_connect');
          } catch (e) {
            storedAuto = null;
          }
          if (!storedAuto) {
            try {
              storedAuto = await storageGet('printer_auto_connect');
            } catch (e) {
              if (!storedAuto) storedAuto = localStorage.getItem('printer_auto_connect');
            }
          }
          const shouldAuto = storedAuto === null ? true : (storedAuto === '1' || storedAuto === 'true');
          setPrinterAutoConnect(shouldAuto);
          // attempt to auto-connect only when enabled
          if (shouldAuto) {
            try {
              const res = await NativePrinter.connect(storedPrinter);
              setPrinterConnected(!!res.ok);
            } catch (e) {
              console.warn('auto-connect on load failed', e);
              setPrinterConnected(false);
            }
          } else {
            setPrinterConnected(false);
          }
        }

        const savedLogo = localStorage.getItem('storeLogo');
        if (savedLogo) {
          setLogoPreview(savedLogo);
          // Don't try to verify the remote file here because `user` may not be
          // available yet and direct HEAD/GET to the static file can trigger
          // CORS errors. The check will run in the `user`-dependent effect which
          // queries the `stores.php` API.
        }
      } catch (err) {
        console.warn('settings init error', err);
      }
    })();

  // Detect native bluetooth serial
    try {
      type CordovaWindow = { plugins?: { printer?: unknown; bluetoothSerial?: unknown } };
      const w = window as unknown as { cordova?: CordovaWindow; bluetoothSerial?: unknown; BluetoothSerial?: unknown };
      const cordova = w.cordova;
      const hasBtSerial = !!(cordova && cordova.plugins && cordova.plugins.bluetoothSerial) || !!(w.bluetoothSerial || w.BluetoothSerial);
      setNativePrinterAvailable(hasBtSerial);
    } catch (err) {
      setNativePrinterAvailable(false);
    }
    // listen to app resume to attempt reconnect if a printer is selected
    let removeListener = () => {};
    try {
      // don't await here (useEffect must not be async) - use promise then()
      addAppResumeListener(async (isActive) => {
        if (isActive) {
          try {
            let p: string | null = null;
            if (selectedPrinter) p = selectedPrinter;
            else {
              try { p = await secureStorage.getItem('printer_mac'); } catch (e) { p = null; }
              if (!p) {
                try { p = await storageGet('printer_mac'); } catch (e) { p = null; }
                if (!p) p = localStorage.getItem('printer_mac');
              }
            }
            if (p) {
              const res = await NativePrinter.connect(p as string);
              setPrinterConnected(!!res.ok);
            }
          } catch (e) {
            // ignore
          }
        }
      }).then(sub => { if (sub && typeof sub.remove === 'function') removeListener = sub.remove; }).catch(() => {});
    } catch (e) { /* ignore */ }

    return () => { try { removeListener(); } catch (e) {} };
  }, []);

  // When user is available, try fetching store metadata (logo) from backend
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const storeId = (user as any)?.storeId;
        if (!storeId) return;
        const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
        const url = `${API_BASE}/api/stores.php?id=${encodeURIComponent(storeId)}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) {
          // If backend returns 404 it likely means the logo (or store) was removed
          console.warn('Failed to fetch store metadata', res.status);
          if (res.status === 404) {
            setLogo(null);
            setLogoPreview(null);
            try { localStorage.removeItem('storeLogo'); } catch (e) { /* ignore */ }
            try {
              const db = await getDB();
              const storeRecord = await db.get('stores', storeId);
              if (storeRecord && 'logo' in storeRecord) {
                const updated = { ...storeRecord } as any;
                delete updated.logo;
                await db.put('stores', updated);
              }
            } catch (err) {
              console.warn('Failed to clear logo from IndexedDB', err);
            }
          }
          return;
        }
        const body = await res.json();
        // API might return an array or an object
        const store = Array.isArray(body) ? body[0] : body;
        if (store && store.logo) {
          const logoUrl = store.logo.startsWith('http') ? store.logo : `${API_BASE}/${String(store.logo).replace(/^\/+/, '')}`;
          try {
            const localTs = Number(localStorage.getItem('storeLogo_ts') || '0');
            const localLogo = localStorage.getItem('storeLogo');
            const now = Date.now();
            const RECENT_MS = 5 * 60 * 1000; // 5 minutes
            // If the user just uploaded a new logo locally, prefer it for display
            // to avoid being immediately overwritten by a backend copy that may
            // still be stale.
            if (localLogo && localTs && (now - localTs) < RECENT_MS) {
              setLogoPreview(localLogo);
              setLogo(localLogo);
              // ensure IndexedDB stores record is updated to keep local copy
              try {
                const db = await getDB();
                const rec = await db.get('stores', storeId);
                if (rec) {
                  const updated = { ...rec } as any;
                  updated.logo = localLogo;
                  await db.put('stores', updated);
                }
              } catch (err) {
                console.warn('Failed to persist local logo to IndexedDB', err);
              }
            } else {
              setLogoPreview(logoUrl);
              setLogo(logoUrl);
              try { localStorage.setItem('storeLogo', logoUrl); } catch (e) { /* ignore */ }
              try { localStorage.removeItem('storeLogo_ts'); } catch (e) { /* ignore */ }
            }
          } catch (err) {
            // Fallback: if anything goes wrong, use backend logo
            setLogoPreview(logoUrl);
            setLogo(logoUrl);
            try { localStorage.setItem('storeLogo', logoUrl); } catch (e) { /* ignore */ }
          }
          // Verify remote file exists (in case backend points to removed file)
          try { await verifyRemoteLogo(logoUrl, storeId); } catch (e) { /* ignore */ }
        } else {
          // No logo field -> ensure local state is cleared
          setLogo(null);
          setLogoPreview(null);
          try { localStorage.removeItem('storeLogo'); } catch (e) { /* ignore */ }
          try {
            const db = await getDB();
            const storeRecord = await db.get('stores', storeId);
            if (storeRecord && 'logo' in storeRecord) {
              const updated = { ...storeRecord } as any;
              delete updated.logo;
              await db.put('stores', updated);
            }
          } catch (err) {
            console.warn('Failed to clear logo from IndexedDB', err);
          }
        }
      } catch (e) {
        console.warn('Error fetching store metadata', e);
      }
    })();
  }, [user]);

  const handleAutoPrint = (checked: boolean) => {
    setAutoPrint(checked);
    try {
      localStorage.setItem('auto_print', checked ? 'true' : 'false');
      toast.success(checked ? 'Impression automatique activée' : 'Impression automatique désactivée');
      try { window.dispatchEvent(new Event('auto_print_changed')); } catch (e) { /* ignore */ }
    } catch (e) {
      console.warn('auto_print save error', e);
      toast.error('Impossible d\'enregistrer le paramètre d\'impression automatique');
    }
  };

  const handlePaperSize = (size: string) => {
    setPaperSize(size);
    try {
      localStorage.setItem('printer_paper', size);
      try { storageSet('printer_paper', size); } catch (e) { /* ignore */ }
      toast.success(size === '58' ? 'Papier 58mm sélectionné' : 'Papier 80mm sélectionné');
    } catch (e) {
      console.warn('save paper size error', e);
    }
  };

  const handleRemoveLogo = () => {
    // Supprime le logo du backend si c'est une image uploadée
    const stored = localStorage.getItem('storeLogo');
    if (stored && stored.includes('img_products/')) {
      try {
        const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
        // On envoie juste le chemin relatif au backend
        const urlRel = stored.startsWith(API_BASE) ? stored.replace(API_BASE + '/', '') : stored;
        fetch(API_BASE + '/api/upload_image.php', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlRel }),
        }).catch((e) => console.warn('delete logo remote error', e));
      } catch (e) {
        console.warn('remove logo remote exception', e);
      }
    }
    (async () => {
      try {
        // Clear local UI state
        setLogo(null);
        setLogoPreview(null);

        // Remove localStorage entries related to the store logo (including timestamp)
        try {
          const stored = localStorage.getItem('storeLogo');
          try { localStorage.removeItem('storeLogo'); } catch (e) { /* ignore */ }
          try { localStorage.removeItem('storeLogo_ts'); } catch (e) { /* ignore */ }
          // remove any other localStorage keys that include 'storeLogo' to be safe
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (!key) continue;
              if (key.includes('storeLogo')) {
                try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
              }
            }
          } catch (e) { /* ignore */ }

          // Also attempt to remove cached responses matching the stored URL or img_products path
          try {
            if (stored && 'caches' in window) {
              const cacheNames = await (caches as any).keys();
              for (const cn of cacheNames) {
                try {
                  const cache = await (caches as any).open(cn);
                  // try exact delete
                  try { await cache.delete(stored); } catch (e) { /* ignore */ }
                  // scan cached requests and delete matches
                  try {
                    const requests = await cache.keys();
                    for (const req of requests) {
                      try {
                        const url = req && (req as any).url ? (req as any).url as string : '';
                        if (!url) continue;
                        if (stored && url.includes(stored)) {
                          await cache.delete(req);
                        } else if (url.includes('/img_products/') && stored && stored.includes('/img_products/')) {
                          // if both URLs reference img_products path, delete to be safe
                          await cache.delete(req);
                        }
                      } catch (e) { /* ignore per-request errors */ }
                    }
                  } catch (e) { /* ignore */ }
                } catch (e) { /* ignore per-cache errors */ }
              }
            }
          } catch (e) {
            console.warn('Cache cleanup failed', e);
          }
        } catch (err) {
          console.warn('localStorage cleanup error', err);
        }

        // Also remove logo fields from any IndexedDB records that reference this store or the removed URL.
        try {
          const storeId = (user as any)?.storeId;
          if (storeId) {
            const db = await getDB();
            // first, clear logo on the canonical stores record
            try {
              const rec = await db.get('stores', storeId);
              if (rec && 'logo' in rec) {
                const updated = { ...rec } as any;
                delete updated.logo;
                await db.put('stores', updated);
              }
            } catch (e) {
              console.warn('Failed to clear logo on stores record', e);
            }

            // iterate all object stores and clear image/logo properties that belong to
            // this store or refer to the removed URL. Use the captured `stored` value
            // (earlier retrieved) rather than re-reading localStorage which has been cleared.
            try {
              const objNames = Array.from((db as any).objectStoreNames || []);
              for (const obj of objNames) {
                try {
                  const items = await db.getAll(obj as any);
                  for (const item of items || []) {
                    if (!item) continue;
                    let changed = false;
                    // If the record belongs to the store: remove common image fields
                    if (item.storeId && item.storeId === storeId) {
                      if ('logo' in item) { delete (item as any).logo; changed = true; }
                      if ('imageUrl' in item) { delete (item as any).imageUrl; changed = true; }
                      if ('image' in item) { delete (item as any).image; changed = true; }
                      if (Array.isArray((item as any).images)) {
                        try {
                          (item as any).images = (item as any).images.filter((s: any) => !(s && stored && s === stored));
                          if ((item as any).images.length === 0) delete (item as any).images;
                          changed = true;
                        } catch (e) { /* ignore */ }
                      }
                    }

                    // If the record references the exact removed URL in common fields, remove them
                    if (!changed && stored) {
                      if ('logo' in item && item.logo && item.logo === stored) { delete (item as any).logo; changed = true; }
                      if ('imageUrl' in item && item.imageUrl && item.imageUrl === stored) { delete (item as any).imageUrl; changed = true; }
                      if ('image' in item && item.image && item.image === stored) { delete (item as any).image; changed = true; }
                      if (Array.isArray((item as any).images) && (item as any).images.some((s: any) => s === stored)) {
                        try {
                          (item as any).images = (item as any).images.filter((s: any) => s !== stored);
                          if ((item as any).images.length === 0) delete (item as any).images;
                          changed = true;
                        } catch (e) { /* ignore */ }
                      }
                    }

                    if (changed) {
                      try { await db.put(obj as any, item); } catch (e) { /* ignore put errors for incompatible shapes */ }
                    }
                  }
                } catch (e) {
                  // ignore per-store iteration errors
                }
              }
            } catch (e) {
              console.warn('IndexedDB wide cleanup failed', e);
            }

            // Propagate deletion to backend using performSyncOp (will queue if offline)
            try {
              const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
              await performSyncOp({ url: API_BASE + '/api/stores.php', method: 'PUT', data: { id: storeId, logo: null } });
            } catch (e) {
              console.warn('Failed to queue store logo removal', e);
            }
          }
        } catch (err) {
          console.warn('Failed to clear logo from IndexedDB or propagate to backend', err);
        }

        toast.success('Logo supprimé');
      } catch (e) {
        console.warn('handleRemoveLogo error', e);
        toast.error('Erreur lors de la suppression du logo');
      }
    })();
  };

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('darkMode', darkMode ? 'true' : 'false');
      // persist auto_print to Storage as well as localStorage
      localStorage.setItem('auto_print', autoPrint ? 'true' : 'false');
      try { window.dispatchEvent(new Event('auto_print_changed')); } catch (e) { /* ignore */ }
  try { storageSet('auto_print', autoPrint ? 'true' : 'false'); } catch (e) { /* ignore */ }
      if (logo) localStorage.setItem('storeLogo', logo);
      else localStorage.removeItem('storeLogo');
      toast.success('Paramètres enregistrés');
    } catch (err) {
      console.error('Save settings error', err);
      toast.error('Impossible d\'enregistrer les paramètres');
    }
  };

  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'cashier') {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Paramètres</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">Accès réservé aux administrateurs et caissiers.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unified test-print function: prefer using NativePrinter.printHtml which handles
  // connecting and sending via the configured native plugin. If no native plugin
  // is available, show an informative toast.
  const handleTestPrint = async () => {
    setIsTesting(true);
    setLastTest(null);
    try {
      const html = `<div style="font-family:monospace; white-space:pre">TEST IMPRESSION\nPOS App\n${new Date().toLocaleString()}\n\nMerci</div>`;
      const deviceId = selectedPrinter || undefined;
      const ok = await NativePrinter.printHtml(html, deviceId as any);
      const at = new Date().toLocaleString();
      setLastTest({ ok: !!ok, at, message: ok ? 'Test imprimé' : 'Échec impression — vérifiez la connexion native' });
      if (ok) {
        toast.success('Test imprimé');
        setPrinterConnected(true);
      } else {
        toast.error('Échec impression — vérifiez la connexion native');
        setPrinterConnected(NativePrinter.isConnected());
      }
    } catch (err) {
      console.error('handleTestPrint error', err);
      const at = new Date().toLocaleString();
      setLastTest({ ok: false, at, message: 'Erreur lors du test d\'impression' });
      toast.error('Erreur lors du test d\'impression');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDarkMode = (checked: boolean) => {
    setDarkMode(checked);
    localStorage.setItem('darkMode', checked ? 'true' : 'false');
    document.documentElement.classList.toggle('dark', checked);
    toast.success(checked ? 'Mode sombre activé' : 'Mode clair activé');
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Suppress PIN auto-lock while user is selecting/uploading a logo
    try { (window as any).__suppressPinLock = true; } catch (err) {}
    // safety fallback
    try { setTimeout(() => { (window as any).__suppressPinLock = false; }, 30000); } catch (err) {}
    if (file) {
      // Avant d'uploader, supprimer l'ancien logo du backend si présent
      const oldLogo = localStorage.getItem('storeLogo');
      if (oldLogo && oldLogo.includes('img_products/')) {
        try {
          const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
          const urlRel = oldLogo.startsWith(API_BASE) ? oldLogo.replace(API_BASE + '/', '') : oldLogo;
          fetch(API_BASE + '/api/upload_image.php', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlRel }),
          }).catch((e) => console.warn('delete old logo remote error', e));
        } catch (e) {
          console.warn('delete old logo remote exception', e);
        }
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setLogo(dataUrl);
        // Try to upload to backend like product images
        (async () => {
          const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
          try {
            const res = await fetch(API_BASE + '/api/upload_image.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: dataUrl }),
            });
            if (res.ok) {
              const body = await res.json();
              if (body && body.url) {
                const full = API_BASE + '/' + body.url.replace(/^\/+/, '');
                setLogoPreview(full);
                setLogo(full);
                    localStorage.setItem('storeLogo', full);
                    try { localStorage.setItem('storeLogo_ts', String(Date.now())); } catch (e) { /* ignore */ }
                    // Also persist to IndexedDB so sync merge sees the update
                    try {
                      const storeId = (user as any)?.storeId;
                      if (storeId) {
                        const db = await getDB();
                        const rec = await db.get('stores', storeId);
                        const updated = rec ? { ...rec } as any : { id: storeId } as any;
                        updated.logo = full;
                        updated.updatedAt = Date.now();
                        await db.put('stores', updated);
                      }
                    } catch (err) {
                      console.warn('Failed to persist logo to IndexedDB after upload', err);
                    }
                // persist logo to server-side store record if we have a storeId
                try {
                  const storeId = (user as any)?.storeId;
                  if (storeId) {
                    const putRes = await fetch(API_BASE + '/api/stores.php', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: storeId, name: undefined, address: undefined, logo: full, active: true, createdAt: Date.now() }),
                    });
                    if (!putRes.ok) {
                      toast.error('Erreur lors de la sauvegarde du logo côté serveur');
                      console.warn('Failed to persist store logo', await putRes.text());
                    }
                  }
                } catch (e) {
                  toast.error('Erreur lors de la sauvegarde du logo côté serveur');
                  console.warn('persist store logo error', e);
                }
                toast.success('Logo enregistré sur le serveur');
                return;
              } else {
                toast.error('Le serveur n\'a pas retourné d\'URL pour le logo');
                setLogoPreview(null);
                setLogo(null);
                return;
              }
            } else {
              toast.error('Échec de l\'upload du logo (réponse serveur)');
              setLogoPreview(null);
              setLogo(null);
              return;
            }
          } catch (err) {
            toast.error('Erreur lors de l\'upload du logo');
            console.warn('upload logo failed', err);
            setLogoPreview(null);
            setLogo(null);
            return;
          }
          // fallback: keep dataURL locally
          setLogoPreview(dataUrl);
          setLogo(dataUrl);
          localStorage.setItem('storeLogo', dataUrl);
          try { localStorage.setItem('storeLogo_ts', String(Date.now())); } catch (e) { /* ignore */ }
          try {
            const storeId = (user as any)?.storeId;
            if (storeId) {
              const db = await getDB();
              const rec = await db.get('stores', storeId);
              const updated = rec ? { ...rec } as any : { id: storeId } as any;
              updated.logo = dataUrl;
              updated.updatedAt = Date.now();
              await db.put('stores', updated);
            }
          } catch (err) {
            console.warn('Failed to persist local dataURL logo to IndexedDB', err);
          }
          toast.success('Logo enregistré localement');
        })();
      };
      reader.readAsDataURL(file);
    }
  };

  return (

    <div className="w-full p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Main page title and subtitle at the very top */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Paramètres</h1>
            <p className="text-muted-foreground">
                Gérez les préférences de l'application et le matériel connecté.
            </p>
          </div>
        </div>

        {/* Admin Store Balance Section */}
        {(user.role === 'admin' || user.role === 'super_admin') && (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className="col-span-2">
                <CardHeader>
                  <CardTitle>Solde du magasin</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingStore ? (
                    <div className="space-y-4 animate-pulse">{/* ...squelettes... */}</div>
                  ) : !store ? (
                    <p>Aucun magasin trouvé pour votre compte.</p>
                  ) : (
                    <div className="space-y-4">
                      {/* Bloc principal solde + nouveaux indicateurs */}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                          <div className="flex items-center gap-4">
                            {store.logo ? (
                              <img src={store.logo} alt="logo" className="w-16 h-16 sm:w-20 sm:h-20 rounded-md object-cover border" />
                            ) : (
                              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-gray-100 flex items-center justify-center text-gray-400 border">🏬</div>
                            )}
                            <div>
                              <p className="text-sm text-muted-foreground">Magasin</p>
                              <p className="text-lg font-semibold truncate max-w-[180px] sm:max-w-none">{store.name || 'Inconnu'}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[220px] sm:max-w-none">{store.address || 'Inconnu'}</p>
                              <div className="mt-2">
                                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                  (store.active !== false) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {(store.active !== false) ? 'Actif' : 'Inactif'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="w-full sm:w-auto sm:text-right text-left">
                            <p className="text-sm text-muted-foreground">Solde calculé</p>
                            <div className="flex items-center gap-2 justify-start sm:justify-end">
                              <p className={`text-lg sm:text-2xl font-bold ${
                                store && typeof store.solde !== 'undefined'
                                  ? Number(store.solde) < 0
                                    ? 'text-red-600'
                                    : Number(store.solde) > 0
                                    ? 'text-orange-500'
                                    : 'text-gray-700'
                                  : 'text-gray-700'
                              }`}>{formatCurrency(store.solde)}</p>
                              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" aria-label="Éditer le solde">
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Confirmer l'ajustement</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <p>Vous allez appliquer le solde manuel suivant :</p>
                                    <p className={`font-semibold text-lg ${
                                      Number(manualValue) < 0
                                        ? 'text-red-600'
                                        : Number(manualValue) > 0
                                        ? 'text-green-600'
                                        : 'text-gray-700'
                                    }`}>{formatCurrency(Number(manualValue))}</p>
                                    <div>
                                      <Label>Nouvelle valeur (XOF)</Label>
                                      <Input
                                        value={manualValue}
                                        onChange={(e) => setManualValue(e.target.value)}
                                        disabled={loadingStore}
                                        placeholder="Ex: 12500"
                                      />
                                    </div>
                                    <div>
                                      <Label>Note (facultatif)</Label>
                                      <Input value={note} onChange={(e) => setNote(e.target.value)} />
                                    </div>
                                    <p className="text-xs text-muted-foreground">L'ajustement manuel devient la base — les ventes/dépenses postérieures seront prises en compte automatiquement.</p>
                                    <div className="flex gap-2">
                                      <Button variant="outline" className="w-1/2" onClick={() => setConfirmOpen(false)} disabled={loadingStore}>Annuler</Button>
                                      <Button className="w-1/2" onClick={handleSetManualConfirmed} disabled={loadingStore}>{loadingStore ? 'Traitement...' : 'Confirmer'}</Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                            {store.solde_manual_appliedAt && (
                              <p className="text-xs text-muted-foreground">Ajusté le {new Date(store.solde_manual_appliedAt).toLocaleString()}</p>
                            )}
                            <div className="mt-2 text-right text-xs text-muted-foreground">
                              {store.subscriptionEnd && (
                                <div>
                                  Expire le: {new Date(store.subscriptionEnd).toLocaleDateString()}
                                  {store.subscriptionEnd > Date.now() && (
                                    <span className="ml-2 text-[11px] text-blue-600">({Math.ceil((store.subscriptionEnd - Date.now())/(1000*60*60*24))} jours restants)</span>
                                  )}
                                  {store.subscriptionEnd <= Date.now() && (
                                    <span className="ml-2 text-[11px] text-red-600">(EXPIRÉ)</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Indicators displayed as two cards side-by-side */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4 max-w-none">
                          <Card className="w-full min-w-0 ring-2 ring-blue-400">
                            <CardHeader>
                              <CardTitle className="text-sm">Fond</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between">
                                <div className={`font-bold text-2xl sm:text-2xl ${Number(store.fond_roulement) < 0 ? 'text-red-600' : Number(store.fond_roulement) > 0 ? 'text-blue-600' : 'text-gray-700'}`}>{formatCurrency(store.fond_roulement)}</div>
                                <Dialog open={fondDialogOpen} onOpenChange={setFondDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" aria-label="Éditer le fond de roulement">
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Modifier le fond de roulement</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <p>Valeur actuelle : <span className="font-semibold">{formatCurrency(store.fond_roulement)}</span></p>
                                      <div>
                                        <Label>Nouvelle valeur (XOF)</Label>
                                        <Input value={fondValue} onChange={(e) => setFondValue(e.target.value)} disabled={loadingStore} placeholder="Ex: 50000" />
                                      </div>
                                      <div>
                                        <Label>Note (facultatif)</Label>
                                        <Input value={fondNote} onChange={(e) => setFondNote(e.target.value)} />
                                      </div>
                                      <div className="pt-2">
                                        <Label className="font-medium">Catégories indirectes affectées au Fond</Label>
                                        <div className="space-y-2 max-h-40 overflow-auto mt-1">
                                          {categories.filter((c: any) => c.type === 'indirect').length === 0 ? (
                                            <div className="text-xs text-muted-foreground">Aucune catégorie indirecte trouvée</div>
                                          ) : (
                                            categories.filter((c: any) => c.type === 'indirect').map((c: any) => (
                                              <label key={c.id} className="flex items-center gap-2">
                                                <input type="checkbox" checked={selectedFondCats.includes(String(c.id))} onChange={() => toggleFondCat(String(c.id))} />
                                                <span className="text-sm">{c.name || c.title || c.label || String(c.id)}</span>
                                              </label>
                                            ))
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">Seules les catégories de type <strong>indirect</strong> sont affichées. Les dépenses directes sont automatiquement soustraites du Fond.</p>
                                        <div className="mt-2 flex items-center gap-2">
                                          <Button onClick={handleSaveCategoryMappings} disabled={loadingStore}>{loadingStore ? 'Enregistrement...' : 'Enregistrer les catégories'}</Button>
                                          <Button variant="ghost" onClick={fetchStore} disabled={loadingStore}>Annuler</Button>
                                        </div>
                                      </div>
                                      <p className="text-xs text-muted-foreground">La valeur manuelle sera prise en compte comme base pour les prochains calculs.</p>
                                      <div className="flex gap-2">
                                        <Button variant="outline" className="w-1/2" onClick={() => setFondDialogOpen(false)} disabled={loadingStore}>Annuler</Button>
                                        <Button className="w-1/2" onClick={handleSetFondConfirmed} disabled={loadingStore}>{loadingStore ? 'Traitement...' : 'Confirmer'}</Button>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="w-full min-w-0 ring-2 ring-green-400">
                            <CardHeader>
                              <CardTitle className="text-sm">Bénéfice</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between">
                                <div className={`font-bold text-2xl sm:text-2xl ${Number(store.benefice) < 0 ? 'text-red-600' : Number(store.benefice) > 0 ? 'text-green-600' : 'text-gray-700'}`}>{formatCurrency(store.benefice)}</div>
                                <Dialog open={benefDialogOpen} onOpenChange={setBenefDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" aria-label="Éditer le bénéfice">
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Modifier le bénéfice</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <p>Valeur actuelle : <span className="font-semibold">{formatCurrency(store.benefice)}</span></p>
                                      <div>
                                        <Label>Nouvelle valeur (XOF)</Label>
                                        <Input value={benefValue} onChange={(e) => setBenefValue(e.target.value)} disabled={loadingStore} placeholder="Ex: 25000" />
                                      </div>
                                      <div>
                                        <Label>Note (facultatif)</Label>
                                        <Input value={benefNote} onChange={(e) => setBenefNote(e.target.value)} />
                                      </div>
                                      <div className="pt-2">
                                        <Label className="font-medium">Catégories indirectes affectées au Bénéfice</Label>
                                        <div className="space-y-2 max-h-40 overflow-auto mt-1">
                                          {categories.filter((c: any) => c.type === 'indirect').length === 0 ? (
                                            <div className="text-xs text-muted-foreground">Aucune catégorie indirecte trouvée</div>
                                          ) : (
                                            categories.filter((c: any) => c.type === 'indirect').map((c: any) => (
                                              <label key={c.id} className="flex items-center gap-2">
                                                <input type="checkbox" checked={selectedBenefCats.includes(String(c.id))} onChange={() => toggleBenefCat(String(c.id))} />
                                                <span className="text-sm">{c.name || c.title || c.label || String(c.id)}</span>
                                              </label>
                                            ))
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">Seules les catégories de type <strong>indirect</strong> sont affichées. Les dépenses opérationnelles sont automatiquement soustraites du Bénéfice.</p>
                                        <div className="mt-2 flex items-center gap-2">
                                          <Button onClick={handleSaveCategoryMappings} disabled={loadingStore}>{loadingStore ? 'Enregistrement...' : 'Enregistrer les catégories'}</Button>
                                          <Button variant="ghost" onClick={fetchStore} disabled={loadingStore}>Annuler</Button>
                                        </div>
                                      </div>
                                      <p className="text-xs text-muted-foreground">La valeur manuelle sera prise en compte comme base pour les prochains calculs.</p>
                                      <div className="flex gap-2">
                                        <Button variant="outline" className="w-1/2" onClick={() => setBenefDialogOpen(false)} disabled={loadingStore}>Annuler</Button>
                                        <Button className="w-1/2" onClick={handleSetBenefConfirmed} disabled={loadingStore}>{loadingStore ? 'Traitement...' : 'Confirmer'}</Button>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                      {store.solde_manual_note && (
                        <p className="text-xs text-muted-foreground">Dernière note : {store.solde_manual_note}</p>
                      )}
                      <p className="text-xs text-muted-foreground">L'ajustement manuel devient la base — les ventes/dépenses postérieures seront prises en compte automatiquement.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="hidden md:block">
                <CardHeader>
                  <CardTitle>Informations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Seuls les comptes admin peuvent voir et modifier le solde manuel du magasin. Les ajustements sont historisés dans la base de données.</p>
                  <div className="mt-4">
                    <Button variant="ghost" onClick={fetchStore} disabled={loadingStore}>Rafraîchir</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}





        <div className="grid grid-cols-1 gap-4">
          {/* Printer card */}
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-md sm:hidden">
                  <Printer size={18} />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">Imprimante</CardTitle>
                  <p className="text-xs text-muted-foreground">Connectez une imprimante thermique via Bluetooth ou utilisez les plugins natifs sur mobile.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <Button onClick={async () => {
                    // Open native paired devices list / test print flow
                    try {
                      const devices = await NativePrinter.listPaired();
                      setPaired(devices || []);
                      if (!devices || devices.length === 0) toast.info('Aucune imprimante appairée trouvée');
                    } catch (e) {
                      console.error('listPaired err', e);
                      toast.error('Impossible de lister les appareils appairés');
                    }
                  }} className="w-full sm:w-auto">Rechercher imprimantes</Button>
                  <div className="flex-1" />
                  {/* Test d'impression disponible ci-dessous — un seul bouton centralisé */}
                </div>

                {/* Afficher l'avertissement et la liste des imprimantes directement
                    sous le bouton Rechercher imprimantes pour une meilleure UX */}
                {paired.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">Aucune imprimante appairée trouvée. Assurez-vous que l'imprimante est appairée au téléphone via les paramètres Android.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {paired.map(d => (
                      <div key={d.id} className={`p-2 border rounded flex items-center justify-between ${selectedPrinter === d.id ? 'bg-muted' : ''}`}>
                        <div>
                          <div className="font-medium">{d.name}</div>
                          <div className="text-xs text-muted-foreground">{d.id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={async () => {
                            const res = await NativePrinter.connect(d.id);
                            const ok = res && res.ok;
                            setPrinterConnected(!!ok);
                            if (ok) {
                              // persist selection
                              try { await secureStorage.setItem('printer_mac', d.id); } catch (e) {}
                              try { await storageSet('printer_mac', d.id); } catch (e) {}
                              try { localStorage.setItem('printer_mac', d.id); } catch (e) {}
                              setSelectedPrinter(d.id);
                              // enable auto-connect when user manually connects
                              try { await secureStorage.setItem('printer_auto_connect', '1'); } catch (e) {}
                              try { await storageSet('printer_auto_connect', '1'); } catch (e) {}
                              try { localStorage.setItem('printer_auto_connect', '1'); } catch (e) {}
                              setPrinterAutoConnect(true);
                              toast.success('Connecté');
                            } else {
                              const msg = res && res.error ? String(res.error) : 'Connexion échouée';
                              console.warn('connect failed', res);
                              toast.error(`Connexion échouée: ${msg}`);
                            }
                          }}>Connecter</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Affichage synthétique de l'imprimante sélectionnée / connexion */}
                <div className="mt-3 p-2 border rounded bg-white">
                  {selectedPrinter ? (
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium">Imprimante sélectionnée</div>
                        <div className="text-xs text-muted-foreground">{paired.find(p => p.id === selectedPrinter)?.name || selectedPrinter}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`inline-flex items-center gap-2 px-2 py-1 rounded text-sm ${printerConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          <span>{printerConnected ? 'Connectée' : 'Déconnectée'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Aucune imprimante sélectionnée.</div>
                  )}
                </div>

                <div className="py-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">Impression automatique après vente</div>
                    <Switch checked={autoPrint} onCheckedChange={(v) => handleAutoPrint(!!v)} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Si activé, l'application imprimera automatiquement le reçu après chaque vente validée.</p>
                </div>
                <div className="py-2">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm">Largeur du papier</div>
                    <div className="flex items-center gap-3">
                      <Button aria-pressed={paperSize === '58'} size="sm" variant={paperSize === '58' ? 'secondary' : 'ghost'} onClick={() => handlePaperSize('58')}>58 mm</Button>
                      <Button aria-pressed={paperSize === '80'} size="sm" variant={paperSize === '80' ? 'secondary' : 'ghost'} onClick={() => handlePaperSize('80')}>80 mm</Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Sélectionnez la largeur du papier pour aligner correctement les colonnes.</p>
                </div>

                <div className="border-t pt-3">
                  <div className="flex items-center gap-3 mb-2">
                      <Button onClick={handleTestPrint} title="Test d'impression" aria-label="Test d'impression" className="inline-flex items-center gap-2 px-3 py-2">
                        <Printer className="w-4 h-4" />
                      </Button>
                      <Button className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500 text-white hover:bg-orange-600" variant="outline" onClick={async () => {
                        const ok = NativePrinter.isConnected();
                        setPrinterConnected(ok);
                        toast.info(ok ? 'Imprimante native connectée' : 'Aucune connexion native');
                      }} title="Statut imprimante" aria-label="Statut imprimante">
                        <Check className="w-4 h-4" />
                        <span className="text-sm">Statut</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                          try {
                            await NativePrinter.disconnect();
                          } catch (e) {
                            console.warn('disconnect error', e);
                          }
                          // clear stored selection
                          try { await secureStorage.removeItem('printer_mac'); } catch (e) {}
                          try { await storageSet('printer_mac', ''); } catch (e) {}
                          try { localStorage.removeItem('printer_mac'); } catch (e) {}
                          // disable auto-connect when user manually disconnects
                          try { await secureStorage.setItem('printer_auto_connect', '0'); } catch (e) {}
                          try { await storageSet('printer_auto_connect', '0'); } catch (e) {}
                          try { localStorage.setItem('printer_auto_connect', '0'); } catch (e) {}
                          setPrinterAutoConnect(false);
                          setSelectedPrinter(null);
                          setPrinterConnected(false);
                          toast.success('Imprimante dissociée et déconnectée (auto-connexion désactivée)');
                        }}>Déconnecter</Button>
                    </div>

                  

                  
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Updates and Version Management card */}
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-md">
                  <RefreshCw size={18} className="text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-sm">Mises à jour</CardTitle>
                  <p className="text-xs text-muted-foreground">Gérez les versions et mises à jour de l'application.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Version actuelle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Version actuelle</p>
                    <p className="text-xs text-muted-foreground">{versionManager.getVersionString()}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      versionManager.getCurrentVersion().environment === 'development' 
                        ? 'bg-orange-100 text-orange-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {versionManager.getCurrentVersion().environment === 'development' ? 'Développement' : 'Production'}
                    </span>
                  </div>
                </div>

                {/* Statut mise à jour */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Statut</p>
                    <p className="text-xs text-muted-foreground">
                      {versionManager.isOutdated() ? 'Mise à jour recommandée' : 'À jour'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await checkForUpdates();
                        toast.success('Vérification terminée');
                      } catch (error) {
                        toast.error('Erreur lors de la vérification');
                      }
                    }}
                    className="w-full flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Vérifier les mises à jour
                  </Button>

                  {versionManager.getCurrentVersion().environment === 'production' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (confirm('Êtes-vous sûr de vouloir forcer une mise à jour ? Cette action rechargera l\'application.')) {
                          forceUpdateApp();
                        }
                      }}
                      className="w-full flex items-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Forcer la mise à jour
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Appearance / Logo card */}
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-md">
                  <Sun size={18} />
                </div>
                <div>
                  <CardTitle className="text-sm">Apparence</CardTitle>
                  <p className="text-xs text-muted-foreground">Personnalisez le thème et l'identité visuelle.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label id="dark-mode-label">Mode sombre</Label>
                    <p className="text-xs text-muted-foreground">Activez pour une interface sombre (sauvegardé localement).</p>
                  </div>
                  <Switch aria-labelledby="dark-mode-label" checked={darkMode} onCheckedChange={handleDarkMode} />
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 bg-muted rounded flex items-center justify-center border overflow-hidden flex-shrink-0">
                    {store && store.logo ? (
                      <img src={store.logo} alt="Logo magasin" className="object-contain w-full h-full" />
                    ) : (
                      <div className="flex flex-col items-center text-xs text-muted-foreground">
                        <ImageIcon size={20} />
                        <span>Aucun logo</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-medium">Logo du magasin</p>
                    <p className="text-xs text-muted-foreground">Formats acceptés : PNG, JPEG. Taille recommandée : 300x300px.</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {/* Hidden file input and styled button */}
                      <input id="logo-input" type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                      <label htmlFor="logo-input" className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-500 cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v4a1 1 0 001 1h3m10 0h3a1 1 0 001-1V7M8 21h8M12 3v12" />
                        </svg>
                        <span className="text-sm">Téléverser un logo</span>
                      </label>

                      {logoPreview && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="inline-flex items-center justify-center px-2 py-2 rounded-md bg-red-50 hover:bg-red-100 text-red-600"
                          title="Supprimer le logo"
                        >
                          <Trash size={18} />
                        </button>
                      )}

                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}