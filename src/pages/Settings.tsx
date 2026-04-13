import { useState, useEffect, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Edit, type LucideIcon } from 'lucide-react';
import * as NativePrinter from '@/lib/nativePrinter';
import * as secureStorage from '@/lib/secureStorage';
import { useAuth } from '@/contexts/AuthContext';
import { isActiveFlag } from '@/lib/status';
// Helpers: dynamic Capacitor Storage/App usage with localStorage fallback.
async function storageGet(key: string): Promise<string | null> {
    try {
        // Use runtime import via Function to avoid bundler static analysis
        const importer: any = new Function("return import('@capacitor/storage')");
        const mod = await importer();
        const r = await (mod.Storage.get({ key } as any) as Promise<any>);
        return r && r.value !== undefined ? r.value : localStorage.getItem(key);
    }
    catch (e) {
        return localStorage.getItem(key);
    }
}
async function storageSet(key: string, value: string): Promise<void> {
    try {
        const importer: any = new Function("return import('@capacitor/storage')");
        const mod = await importer();
        await (mod.Storage.set({ key, value } as any));
    }
    catch (e) {
        try {
            localStorage.setItem(key, value);
        }
        catch (err) { /* ignore */ }
    }
}
async function addAppResumeListener(cb: (isActive: boolean) => void) {
    try {
        const importer: any = new Function("return import('@capacitor/app')");
        const mod = await importer();
        const listener = mod.App.addListener('appStateChange', (state: any) => cb(state && state.isActive));
        return { remove: () => { try {
                listener.remove();
            }
            catch (e) { } } };
    }
    catch (e) {
        // Not available on web; return noop
        return { remove: () => { } };
    }
}
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Printer, ImageIcon, Trash, Check, RefreshCw, BellRing, Palette, Shield, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { getDB, performSyncOp } from '@/lib/db';
import { invalidateEmailSettingsCache } from '@/lib/emailSettingsCache';
// BluetoothSerialPlugin type removed — native printing handled via NativePrinter helper
const elevatedCardClassName = 'overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 shadow-sm shadow-black/5 backdrop-blur supports-[backdrop-filter]:bg-card/90';
function SettingsSectionHeading({ icon: Icon, title, description, action }: {
        icon: LucideIcon;
        title: string;
        description: string;
        action?: ReactNode;
}) {
        return (<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
                    <Icon className="h-5 w-5"/>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                    <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
                    <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>);
}
export default function Settings() {
    const { user } = useAuth();
    // Store balance admin section state
    const [store, setStore] = useState<any | null>(null);
    const [loadingStore, setLoadingStore] = useState(false);
    const [storeError, setStoreError] = useState<string | null>(null);
    const [manualValue, setManualValue] = useState<string>('');
    const [note, setNote] = useState<string>('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Email notification settings
    const [emailSettings, setEmailSettings] = useState({
        shifts: true,
        stockSignals: true,
        expenses: true,
        logins: true,
        refunds: true
    });
    const [loadingEmailSettings, setLoadingEmailSettings] = useState(false);
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
    // Load email notification settings
    const loadEmailSettings = async () => {
        try {
            const db = await getDB();
            // Charger depuis le backend en priorité (source de vérité partagée entre appareils)
            let remoteSettings: any = null;
            try {
                const res = await fetch(`https://mediumslateblue-cod-399211.hostingersite.com/backend/api/email_settings.php?storeId=${encodeURIComponent(user?.storeId || '')}`);
                if (res.ok) {
                    remoteSettings = await res.json();
                }
            }
            catch (e) {
            }
            const settings = remoteSettings || await db.get('emailSettings', user?.storeId);
            if (settings) {
                // Mettre à jour le cache local avec les données du backend
                if (remoteSettings) {
                    await db.put('emailSettings', {
                        id: user?.storeId,
                        storeId: user?.storeId,
                        ...remoteSettings,
                        updatedAt: Date.now()
                    });
                }
                setEmailSettings({
                    shifts: settings.shifts !== false,
                    stockSignals: settings.stockSignals !== false,
                    expenses: settings.expenses !== false,
                    logins: settings.logins !== false,
                    refunds: settings.refunds !== false
                });
            }
        }
        catch (e) {
        }
    };
    // Save email notification settings
    const saveEmailSettings = async (newSettings: any) => {
        try {
            setLoadingEmailSettings(true);
            const db = await getDB();
            // Utiliser storeId comme ID unique pour éviter les doublons
            const settingsData = {
                id: user?.storeId, // ID = storeId pour garantir l'unicité
                storeId: user?.storeId,
                ...newSettings,
                updatedAt: Date.now()
            };
            // Sauvegarder localement (put remplace si existe déjà)
            await db.put('emailSettings', settingsData);
            // Sync with backend if online
            try {
                await performSyncOp({
                    url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/email_settings.php',
                    method: 'PUT',
                    data: settingsData
                });
            }
            catch (e) {
            }
            setEmailSettings(newSettings);
            invalidateEmailSettingsCache(user?.storeId || '');
            toast.success('Paramètres d\'email sauvegardés');
        }
        catch (e) {
            toast.error('Erreur lors de la sauvegarde');
        }
        finally {
            setLoadingEmailSettings(false);
        }
    };
    // Fetch store info for admin
    const fetchStore = async () => {
        setLoadingStore(true);
        setStoreError(null);
        try {
            const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php');
            if (!res.ok)
                throw new Error('Erreur fetch stores');
            const data = await res.json();
            const myStore = data && Array.isArray(data) ? data.find((s: any) => s.id === user?.storeId) : null;
            if (!myStore) {
                setStoreError('Aucun magasin correspondant à votre compte trouvé dans la base de données.');
            }
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
                }
                catch (e) {
                    // ignore
                }
            }
            if (myStore && myStore.solde_manual !== null && myStore.solde_manual !== undefined) {
                setManualValue(String(myStore.solde_manual));
            }
            else if (myStore && typeof myStore.solde !== 'undefined') {
                setManualValue(String(myStore.solde));
            }
        }
        catch (e) {
            setStoreError('Impossible de se connecter au serveur. Vérifiez votre connexion internet.');
            toast.error('Connexion au backend impossible - Mode hors ligne');
        }
        finally {
            setLoadingStore(false);
        }
    };
    // Set manual balance handler
    const handleSetManualConfirmed = async () => {
        if (!store)
            return;
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
            }
            else {
                toast.error('Erreur lors de la mise à jour');
            }
        }
        catch (e) {
            toast.error('Erreur réseau');
        }
        finally {
            setLoadingStore(false);
        }
    };
    // Set Fond de roulement handler
    const handleSetFondConfirmed = async () => {
        if (!store)
            return;
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
            }
            else {
                toast.error('Erreur lors de la mise à jour');
            }
        }
        catch (e) {
            toast.error('Erreur réseau');
        }
        finally {
            setLoadingStore(false);
        }
    };
    // Set Bénéfice handler
    const handleSetBenefConfirmed = async () => {
        if (!store)
            return;
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
            }
            else {
                toast.error('Erreur lors de la mise à jour');
            }
        }
        catch (e) {
            toast.error('Erreur réseau');
        }
        finally {
            setLoadingStore(false);
        }
    };
    // Fetch store info on mount for admin/super_admin
    useEffect(() => {
        if (user && (user.role === 'admin' || user.role === 'super_admin')) {
            fetchStore();
            loadEmailSettings();
        }
        // eslint-disable-next-line
    }, [user]);
    // Fetch expense categories for mapping UI (filtered to current store)
    useEffect(() => {
        if (!user || !store)
            return;
        (async () => {
            try {
                const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
                const url = API_BASE + '/api/expense_categories.php?storeId=' + encodeURIComponent(store.id);
                const res = await fetch(url);
                if (!res.ok)
                    return;
                const body = await res.json();
                const list = Array.isArray(body) ? body : (body && body.categories ? body.categories : []);
                setCategories(list || []);
            }
            catch (e) {
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
        if (!store)
            return;
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
            }
            else {
                toast.error('Erreur lors de la sauvegarde');
            }
        }
        catch (e) {
            toast.error('Erreur réseau');
        }
        finally {
            setLoadingStore(false);
        }
    };
    const [printerConnected, setPrinterConnected] = useState(false);
    const [nativePrinterAvailable, setNativePrinterAvailable] = useState(false);
    const [paired, setPaired] = useState<Array<{
        name: string;
        id: string;
    }>>([]);
    const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
    const [printerAutoConnect, setPrinterAutoConnect] = useState<boolean>(true);
    const [scanning, setScanning] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [lastTest, setLastTest] = useState<{
        ok: boolean;
        at: string;
        message?: string;
    } | null>(null);
    const [darkMode, setDarkMode] = useState(false);
    const [logo, setLogo] = useState<string | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [autoPrint, setAutoPrint] = useState<boolean>(() => {
        const s = localStorage.getItem('auto_print');
        return s === null ? true : s === 'true';
    });
    // PIN settings
    const [pinEnabled, setPinEnabled] = useState<boolean>(false);
    const [currentPin, setCurrentPin] = useState<string>('');
    const [newPin, setNewPin] = useState<string>('');
    const [confirmPin, setConfirmPin] = useState<string>('');
    const [pinDialogOpen, setPinDialogOpen] = useState(false);
    const [loadingPin, setLoadingPin] = useState(false);
    const [paperSize, setPaperSize] = useState<string>(() => {
        const p = localStorage.getItem('printer_paper');
        return p || '80';
    });
    const [lastPrinterDiagAt, setLastPrinterDiagAt] = useState<string | null>(null);
    // Verify that a remote logo URL actually exists on the server. If the server
    // returns 404 or not-ok, clear local copies (localStorage + IndexedDB) so the
    // removed file is not displayed from cache.
    const verifyRemoteLogo = async (logoUrl: string | null, storeId?: string | null) => {
        if (!logoUrl)
            return;
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
                            try {
                                localStorage.removeItem('storeLogo');
                            }
                            catch (e) { /* ignore */ }
                            try {
                                const db = await getDB();
                                const rec = await db.get('stores', storeId);
                                if (rec && 'logo' in rec) {
                                    const updated = { ...rec } as any;
                                    delete updated.logo;
                                    await db.put('stores', updated);
                                }
                            }
                            catch (err) {
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
                        try {
                            localStorage.removeItem('storeLogo');
                        }
                        catch (e) { /* ignore */ }
                        try {
                            const db = await getDB();
                            const rec = await db.get('stores', storeId);
                            if (rec && 'logo' in rec) {
                                const updated = { ...rec } as any;
                                delete updated.logo;
                                await db.put('stores', updated);
                            }
                        }
                        catch (err) {
                        }
                    }
                    return;
                }
                catch (err) {
                    return;
                }
            }
            // If we don't have a storeId, fall back to a direct HEAD/GET on the image URL.
            // Be conservative: if the fetch fails due to network/CORS, do not delete local.
            let res: Response | null = null;
            try {
                res = await fetch(logoUrl, { method: 'HEAD' });
            }
            catch (e) {
                try {
                    res = await fetch(logoUrl, { method: 'GET' });
                }
                catch (err) {
                    res = null;
                }
            }
            if (!res || !res.ok) {
                // Not found on server (or HEAD/GET failed) -> attempt local cleanup only
                setLogo(null);
                setLogoPreview(null);
                try {
                    localStorage.removeItem('storeLogo');
                }
                catch (e) { /* ignore */ }
            }
        }
        catch (err) {
        }
    };
    useEffect(() => {
        // Charger les paramètres depuis le localStorage ou la DB si besoin
        (async () => {
            try {
                // darkMode (keep localStorage fallback)
                const savedDark = localStorage.getItem('darkMode');
                if (savedDark)
                    setDarkMode(savedDark === 'true');
                // autoPrint (try Storage first)
                try {
                    const ap = await storageGet('auto_print');
                    if (ap !== null)
                        setAutoPrint(ap === 'true');
                }
                catch (e) {
                    const apLocal = localStorage.getItem('auto_print');
                    if (apLocal !== null)
                        setAutoPrint(apLocal === 'true');
                }
                // printer selection (try secureStorage then Storage then localStorage)
                let storedPrinter: string | null = null;
                try {
                    storedPrinter = await secureStorage.getItem('printer_mac');
                }
                catch (e) {
                    storedPrinter = null;
                }
                if (!storedPrinter) {
                    try {
                        const p = await storageGet('printer_mac');
                        if (p)
                            storedPrinter = p;
                    }
                    catch (e) {
                        if (!storedPrinter)
                            storedPrinter = localStorage.getItem('printer_mac');
                    }
                }
                if (storedPrinter) {
                    setSelectedPrinter(storedPrinter);
                    // load persisted auto-connect flag (secureStorage -> Storage -> localStorage)
                    let storedAuto: string | null = null;
                    try {
                        storedAuto = await secureStorage.getItem('printer_auto_connect');
                    }
                    catch (e) {
                        storedAuto = null;
                    }
                    if (!storedAuto) {
                        try {
                            storedAuto = await storageGet('printer_auto_connect');
                        }
                        catch (e) {
                            if (!storedAuto)
                                storedAuto = localStorage.getItem('printer_auto_connect');
                        }
                    }
                    const shouldAuto = storedAuto === null ? true : (storedAuto === '1' || storedAuto === 'true');
                    setPrinterAutoConnect(shouldAuto);
                    // attempt to auto-connect only when enabled
                    if (shouldAuto) {
                        try {
                            const res = await NativePrinter.connect(storedPrinter);
                            setPrinterConnected(!!res.ok);
                        }
                        catch (e) {
                            setPrinterConnected(false);
                        }
                    }
                    else {
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
            }
            catch (err) {
            }
        })();
        // Detect native bluetooth serial
        try {
            type CordovaWindow = {
                plugins?: {
                    printer?: unknown;
                    bluetoothSerial?: unknown;
                };
            };
            const w = window as unknown as {
                cordova?: CordovaWindow;
                bluetoothSerial?: unknown;
                BluetoothSerial?: unknown;
            };
            const cordova = w.cordova;
            const hasBtSerial = !!(cordova && cordova.plugins && cordova.plugins.bluetoothSerial) || !!(w.bluetoothSerial || w.BluetoothSerial);
            setNativePrinterAvailable(hasBtSerial);
        }
        catch (err) {
            setNativePrinterAvailable(false);
        }
        // listen to app resume to attempt reconnect if a printer is selected
        let removeListener = () => { };
        try {
            // don't await here (useEffect must not be async) - use promise then()
            addAppResumeListener(async (isActive) => {
                if (isActive) {
                    try {
                        let p: string | null = null;
                        if (selectedPrinter)
                            p = selectedPrinter;
                        else {
                            try {
                                p = await secureStorage.getItem('printer_mac');
                            }
                            catch (e) {
                                p = null;
                            }
                            if (!p) {
                                try {
                                    p = await storageGet('printer_mac');
                                }
                                catch (e) {
                                    p = null;
                                }
                                if (!p)
                                    p = localStorage.getItem('printer_mac');
                            }
                        }
                        if (p) {
                            const res = await NativePrinter.connect(p as string);
                            setPrinterConnected(!!res.ok);
                        }
                    }
                    catch (e) {
                        // ignore
                    }
                }
            }).then(sub => { if (sub && typeof sub.remove === 'function')
                removeListener = sub.remove; }).catch(() => { });
        }
        catch (e) { /* ignore */ }
        return () => { try {
            removeListener();
        }
        catch (e) { } };
    }, []);
    // When user is available, try fetching store metadata (logo) from backend
    useEffect(() => {
        if (!user)
            return;
        (async () => {
            try {
                const storeId = (user as any)?.storeId;
                if (!storeId)
                    return;
                const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
                const url = `${API_BASE}/api/stores.php?id=${encodeURIComponent(storeId)}`;
                const res = await fetch(url, { method: 'GET' });
                if (!res.ok) {
                    if (res.status === 404) {
                        setLogo(null);
                        setLogoPreview(null);
                        try {
                            localStorage.removeItem('storeLogo');
                        }
                        catch (e) { /* ignore */ }
                        try {
                            const db = await getDB();
                            const storeRecord = await db.get('stores', storeId);
                            if (storeRecord && 'logo' in storeRecord) {
                                const updated = { ...storeRecord } as any;
                                delete updated.logo;
                                await db.put('stores', updated);
                            }
                        }
                        catch (err) {
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
                            }
                            catch (err) {
                            }
                        }
                        else {
                            setLogoPreview(logoUrl);
                            setLogo(logoUrl);
                            try {
                                localStorage.setItem('storeLogo', logoUrl);
                            }
                            catch (e) { /* ignore */ }
                            try {
                                localStorage.removeItem('storeLogo_ts');
                            }
                            catch (e) { /* ignore */ }
                        }
                    }
                    catch (err) {
                        // Fallback: if anything goes wrong, use backend logo
                        setLogoPreview(logoUrl);
                        setLogo(logoUrl);
                        try {
                            localStorage.setItem('storeLogo', logoUrl);
                        }
                        catch (e) { /* ignore */ }
                    }
                    // Verify remote file exists (in case backend points to removed file)
                    try {
                        await verifyRemoteLogo(logoUrl, storeId);
                    }
                    catch (e) { /* ignore */ }
                }
                else {
                    // No logo field -> ensure local state is cleared
                    setLogo(null);
                    setLogoPreview(null);
                    try {
                        localStorage.removeItem('storeLogo');
                    }
                    catch (e) { /* ignore */ }
                    try {
                        const db = await getDB();
                        const storeRecord = await db.get('stores', storeId);
                        if (storeRecord && 'logo' in storeRecord) {
                            const updated = { ...storeRecord } as any;
                            delete updated.logo;
                            await db.put('stores', updated);
                        }
                    }
                    catch (err) {
                    }
                }
            }
            catch (e) {
            }
        })();
    }, [user]);
    const handleAutoPrint = (checked: boolean) => {
        setAutoPrint(checked);
        try {
            localStorage.setItem('auto_print', checked ? 'true' : 'false');
            toast.success(checked ? 'Impression automatique activée' : 'Impression automatique désactivée');
            try {
                window.dispatchEvent(new Event('auto_print_changed'));
            }
            catch (e) { /* ignore */ }
        }
        catch (e) {
            toast.error('Impossible d\'enregistrer le paramètre d\'impression automatique');
        }
    };
    const handlePaperSize = (size: string) => {
        setPaperSize(size);
        try {
            localStorage.setItem('printer_paper', size);
            try {
                storageSet('printer_paper', size);
            }
            catch (e) { /* ignore */ }
            toast.success(size === '58' ? 'Papier 58mm sélectionné' : 'Papier 80mm sélectionné');
        }
        catch (e) {
        }
    };
    const handlePrinterDiagnostics = () => {
        try {
            const info = NativePrinter.inspectPlugin();
            setLastPrinterDiagAt(new Date().toLocaleString());
            toast.info('Diagnostic imprimante envoyé au journal');
        }
        catch (e) {
            toast.error('Impossible de générer le diagnostic imprimante');
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
                }).catch((e) => {
                });
            }
            catch (e) {
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
                    try {
                        localStorage.removeItem('storeLogo');
                    }
                    catch (e) { /* ignore */ }
                    try {
                        localStorage.removeItem('storeLogo_ts');
                    }
                    catch (e) { /* ignore */ }
                    // remove any other localStorage keys that include 'storeLogo' to be safe
                    try {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (!key)
                                continue;
                            if (key.includes('storeLogo')) {
                                try {
                                    localStorage.removeItem(key);
                                }
                                catch (e) { /* ignore */ }
                            }
                        }
                    }
                    catch (e) { /* ignore */ }
                    // Also attempt to remove cached responses matching the stored URL or img_products path
                    try {
                        if (stored && 'caches' in window) {
                            const cacheNames = await (caches as any).keys();
                            for (const cn of cacheNames) {
                                try {
                                    const cache = await (caches as any).open(cn);
                                    // try exact delete
                                    try {
                                        await cache.delete(stored);
                                    }
                                    catch (e) { /* ignore */ }
                                    // scan cached requests and delete matches
                                    try {
                                        const requests = await cache.keys();
                                        for (const req of requests) {
                                            try {
                                                const url = req && (req as any).url ? (req as any).url as string : '';
                                                if (!url)
                                                    continue;
                                                if (stored && url.includes(stored)) {
                                                    await cache.delete(req);
                                                }
                                                else if (url.includes('/img_products/') && stored && stored.includes('/img_products/')) {
                                                    // if both URLs reference img_products path, delete to be safe
                                                    await cache.delete(req);
                                                }
                                            }
                                            catch (e) { /* ignore per-request errors */ }
                                        }
                                    }
                                    catch (e) { /* ignore */ }
                                }
                                catch (e) { /* ignore per-cache errors */ }
                            }
                        }
                    }
                    catch (e) {
                    }
                }
                catch (err) {
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
                        }
                        catch (e) {
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
                                        if (!item)
                                            continue;
                                        let changed = false;
                                        // If the record belongs to the store: remove common image fields
                                        if (item.storeId && item.storeId === storeId) {
                                            if ('logo' in item) {
                                                delete (item as any).logo;
                                                changed = true;
                                            }
                                            if ('imageUrl' in item) {
                                                delete (item as any).imageUrl;
                                                changed = true;
                                            }
                                            if ('image' in item) {
                                                delete (item as any).image;
                                                changed = true;
                                            }
                                            if (Array.isArray((item as any).images)) {
                                                try {
                                                    (item as any).images = (item as any).images.filter((s: any) => !(s && stored && s === stored));
                                                    if ((item as any).images.length === 0)
                                                        delete (item as any).images;
                                                    changed = true;
                                                }
                                                catch (e) { /* ignore */ }
                                            }
                                        }
                                        // If the record references the exact removed URL in common fields, remove them
                                        if (!changed && stored) {
                                            if ('logo' in item && item.logo && item.logo === stored) {
                                                delete (item as any).logo;
                                                changed = true;
                                            }
                                            if ('imageUrl' in item && item.imageUrl && item.imageUrl === stored) {
                                                delete (item as any).imageUrl;
                                                changed = true;
                                            }
                                            if ('image' in item && item.image && item.image === stored) {
                                                delete (item as any).image;
                                                changed = true;
                                            }
                                            if (Array.isArray((item as any).images) && (item as any).images.some((s: any) => s === stored)) {
                                                try {
                                                    (item as any).images = (item as any).images.filter((s: any) => s !== stored);
                                                    if ((item as any).images.length === 0)
                                                        delete (item as any).images;
                                                    changed = true;
                                                }
                                                catch (e) { /* ignore */ }
                                            }
                                        }
                                        if (changed) {
                                            try {
                                                await db.put(obj as any, item);
                                            }
                                            catch (e) { /* ignore put errors for incompatible shapes */ }
                                        }
                                    }
                                }
                                catch (e) {
                                    // ignore per-store iteration errors
                                }
                            }
                        }
                        catch (e) {
                        }
                        // Propagate deletion to backend using performSyncOp (will queue if offline)
                        try {
                            const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
                            await performSyncOp({ url: API_BASE + '/api/stores.php', method: 'PUT', data: { id: storeId, logo: null } });
                        }
                        catch (e) {
                        }
                    }
                }
                catch (err) {
                }
                toast.success('Logo supprimé');
            }
            catch (e) {
                toast.error('Erreur lors de la suppression du logo');
            }
        })();
    };
    const handleSaveSettings = () => {
        try {
            localStorage.setItem('darkMode', darkMode ? 'true' : 'false');
            // persist auto_print to Storage as well as localStorage
            localStorage.setItem('auto_print', autoPrint ? 'true' : 'false');
            try {
                window.dispatchEvent(new Event('auto_print_changed'));
            }
            catch (e) { /* ignore */ }
            try {
                storageSet('auto_print', autoPrint ? 'true' : 'false');
            }
            catch (e) { /* ignore */ }
            if (logo)
                localStorage.setItem('storeLogo', logo);
            else
                localStorage.removeItem('storeLogo');
            toast.success('Paramètres enregistrés');
        }
        catch (err) {
            toast.error('Impossible d\'enregistrer les paramètres');
        }
    };
    // Load PIN settings
    const loadPinSettings = async () => {
        try {
            const db = await getDB();
            const userRecord = await db.get('users', user?.id) as any;
            if (userRecord) {
                setPinEnabled(userRecord.pinEnabled || false);
            }
        }
        catch (e) {
        }
    };
    // Toggle PIN enabled/disabled
    const handleTogglePin = async (enabled: boolean) => {
        if (enabled) {
            // Opening dialog to set new PIN
            setPinDialogOpen(true);
        }
        else {
            // Disable PIN
            try {
                setLoadingPin(true);
                const db = await getDB();
                const userRecord = await db.get('users', user?.id) as any;
                if (userRecord) {
                    const updated = { ...userRecord, pinEnabled: false };
                    await db.put('users', updated);
                    // Update the stored user in secure storage to reflect PIN disabled
                    try {
                        const storedUser = localStorage.getItem('pos-user');
                        if (storedUser) {
                            const parsed = JSON.parse(storedUser);
                            const updatedUser = { ...parsed, pinEnabled: false };
                            localStorage.setItem('pos-user', JSON.stringify(updatedUser));
                            try {
                                await secureStorage.setItem('pos-user', JSON.stringify(updatedUser));
                            }
                            catch (e) {
                                // ignore secure storage errors
                            }
                        }
                    }
                    catch (e) {
                    }
                    // Sync with backend
                    try {
                        await performSyncOp({
                            url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php',
                            method: 'PUT',
                            data: updated
                        });
                    }
                    catch (e) {
                    }
                    setPinEnabled(false);
                    toast.success('Code PIN désactivé - Rechargez la page pour appliquer');
                    // Recharger la page après un court délai pour forcer la réinitialisation
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                }
            }
            catch (e) {
                toast.error('Erreur lors de la désactivation du PIN');
            }
            finally {
                setLoadingPin(false);
            }
        }
    };
    // Save new PIN
    const handleSavePin = async () => {
        // Validate inputs
        if (!newPin || newPin.length < 4) {
            toast.error('Le PIN doit contenir au moins 4 chiffres');
            return;
        }
        if (newPin !== confirmPin) {
            toast.error('Les codes PIN ne correspondent pas');
            return;
        }
        try {
            setLoadingPin(true);
            const db = await getDB();
            const userRecord = await db.get('users', user?.id) as any;
            if (!userRecord) {
                toast.error('Utilisateur introuvable');
                return;
            }
            const updated = {
                ...userRecord,
                pin: newPin,
                pinEnabled: true
            };
            await db.put('users', updated);
            // Sync with backend
            try {
                await performSyncOp({
                    url: 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php',
                    method: 'PUT',
                    data: updated
                });
            }
            catch (e) {
            }
            setPinEnabled(true);
            setPinDialogOpen(false);
            setNewPin('');
            setConfirmPin('');
            setCurrentPin('');
            toast.success('Code PIN activé avec succès - Rechargez pour activer');
            // Recharger après un court délai
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        }
        catch (e) {
            toast.error('Erreur lors de l\'enregistrement du PIN');
        }
        finally {
            setLoadingPin(false);
        }
    };
    // Load PIN settings on mount
    useEffect(() => {
        if (user) {
            loadPinSettings();
        }
    }, [user]);
    if (!user)
        return null;
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'cashier' && user.role !== 'manager') {
        return (<div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Paramètres</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">Accès réservé aux administrateurs, gestionnaires et caissiers.</p>
          </CardContent>
        </Card>
      </div>);
    }
    const canManageStoreBalance = user.role === 'admin' || user.role === 'super_admin';
    const canEditEmailSettings = user.role === 'admin';
    const selectedPrinterName = paired.find((device) => device.id === selectedPrinter)?.name || selectedPrinter || 'Aucune imprimante';
    const printerStatusLabel = selectedPrinter ? (printerConnected ? 'Connectée' : 'À reconnecter') : 'Non configurée';
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
            }
            else {
                toast.error('Échec impression — vérifiez la connexion native');
                setPrinterConnected(NativePrinter.isConnected());
            }
        }
        catch (err) {
            const at = new Date().toLocaleString();
            setLastTest({ ok: false, at, message: 'Erreur lors du test d\'impression' });
            toast.error('Erreur lors du test d\'impression');
        }
        finally {
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
        try {
            (window as any).__suppressPinLock = true;
        }
        catch (err) { }
        // safety fallback
        try {
            setTimeout(() => { (window as any).__suppressPinLock = false; }, 30000);
        }
        catch (err) { }
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
                    }).catch((e) => {
                    });
                }
                catch (e) {
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
                                try {
                                    localStorage.setItem('storeLogo_ts', String(Date.now()));
                                }
                                catch (e) { /* ignore */ }
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
                                }
                                catch (err) {
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
                                        }
                                    }
                                }
                                catch (e) {
                                    toast.error('Erreur lors de la sauvegarde du logo côté serveur');
                                }
                                toast.success('Logo enregistré sur le serveur');
                                return;
                            }
                            else {
                                toast.error('Le serveur n\'a pas retourné d\'URL pour le logo');
                                setLogoPreview(null);
                                setLogo(null);
                                return;
                            }
                        }
                        else {
                            toast.error('Échec de l\'upload du logo (réponse serveur)');
                            setLogoPreview(null);
                            setLogo(null);
                            return;
                        }
                    }
                    catch (err) {
                        toast.error('Erreur lors de l\'upload du logo');
                        setLogoPreview(null);
                        setLogo(null);
                        return;
                    }
                    // fallback: keep dataURL locally
                    setLogoPreview(dataUrl);
                    setLogo(dataUrl);
                    localStorage.setItem('storeLogo', dataUrl);
                    try {
                        localStorage.setItem('storeLogo_ts', String(Date.now()));
                    }
                    catch (e) { /* ignore */ }
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
                    }
                    catch (err) {
                    }
                    toast.success('Logo enregistré localement');
                })();
            };
            reader.readAsDataURL(file);
        }
    };
        return (<div className="w-full p-4 sm:p-8">
            <div className="mx-auto max-w-6xl space-y-6">
        {/* Admin Store Balance Section */}
                {canManageStoreBalance && (<div>
            <div className="grid grid-cols-1 gap-4 mb-6">
                            <Card className={elevatedCardClassName}>
                <CardContent className="pt-6">
                  {loadingStore ? (<div className="space-y-4 animate-pulse">{/* ...squelettes... */}</div>) : !store ? (<div className="space-y-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-yellow-100 rounded-full">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-yellow-900 mb-1">
                            {storeError || 'Impossible de charger les informations du magasin'}
                          </h3>
                          <p className="text-sm text-yellow-800">
                            {storeError?.includes('serveur') || storeError?.includes('connexion') ? (<>
                                Assurez-vous que :
                                <ul className="list-disc list-inside mt-2 space-y-1">
                                  <li>Vous êtes connecté à internet</li>
                                  <li>Le serveur backend est accessible</li>
                                  <li>Aucun pare-feu ne bloque la connexion</li>
                                </ul>
                              </>) : (<>
                                Contactez votre administrateur système pour :
                                <ul className="list-disc list-inside mt-2 space-y-1">
                                  <li>Vérifier que votre compte est lié à un magasin</li>
                                  <li>Confirmer que le magasin existe dans la base de données</li>
                                  <li>Valider vos permissions d'accès</li>
                                </ul>
                              </>)}
                          </p>
                          <p className="text-xs text-yellow-700 mt-3">
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 border-t border-yellow-200 pt-3">
                        <Button variant="outline" size="sm" onClick={fetchStore} disabled={loadingStore} className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4"/>
                          Réessayer
                        </Button>
                      </div>
                                        </div>) : (<div className="space-y-5">
                      {/* Bloc principal solde + nouveaux indicateurs */}
                      <div className="flex flex-col gap-2">
                                                <div className="rounded-[1.5rem] border border-border/60 bg-muted/25 p-4 sm:p-5">
                                                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                          <div className="flex items-center gap-4">
                            {store.logo ? (<img src={store.logo} alt="logo" className="w-16 h-16 sm:w-20 sm:h-20 rounded-md object-cover border"/>) : (<div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-gray-100 flex items-center justify-center text-gray-400 border">🏬</div>)}
                            <div>
                              <p className="text-sm text-muted-foreground">Magasin</p>
                              <p className="text-lg font-semibold truncate max-w-[180px] sm:max-w-none">{store.name || 'Inconnu'}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[220px] sm:max-w-none">{store.address || 'Inconnu'}</p>
                              <div className="mt-2">
                                                                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${isActiveFlag(store.active) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                                    {isActiveFlag(store.active) ? 'Actif' : 'Inactif'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="w-full sm:w-auto sm:text-right text-left">
                            <p className="text-sm text-muted-foreground">Solde calculé</p>
                            <div className="flex items-center gap-2 justify-start sm:justify-end">
                              <p className={`text-lg sm:text-2xl font-bold ${store && typeof store.solde !== 'undefined'
                    ? Number(store.solde) < 0
                        ? 'text-red-600'
                        : Number(store.solde) > 0
                            ? 'text-orange-500'
                            : 'text-gray-700'
                    : 'text-gray-700'}`}>{formatCurrency(store.solde)}</p>
                              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" aria-label="Éditer le solde">
                                    <Edit className="w-4 h-4"/>
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Confirmer l'ajustement</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <p>Vous allez appliquer le solde manuel suivant :</p>
                                    <p className={`font-semibold text-lg ${Number(manualValue) < 0
                    ? 'text-red-600'
                    : Number(manualValue) > 0
                        ? 'text-green-600'
                        : 'text-gray-700'}`}>{formatCurrency(Number(manualValue))}</p>
                                    <div>
                                      <Label>Nouvelle valeur (XOF)</Label>
                                      <Input value={manualValue} onChange={(e) => setManualValue(e.target.value)} disabled={loadingStore} placeholder="Ex: 12500"/>
                                    </div>
                                    <div>
                                      <Label>Note (facultatif)</Label>
                                      <Input value={note} onChange={(e) => setNote(e.target.value)}/>
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
                            {store.solde_manual_appliedAt && (<p className="text-xs text-muted-foreground">Ajusté le {new Date(store.solde_manual_appliedAt).toLocaleString()}</p>)}
                            <div className="mt-2 text-right text-xs text-muted-foreground">
                              {store.subscriptionEnd && (<div>
                                  Expire le: {new Date(store.subscriptionEnd).toLocaleDateString()}
                                  {store.subscriptionEnd > Date.now() && (<span className="ml-2 text-[11px] text-blue-600">({Math.ceil((store.subscriptionEnd - Date.now()) / (1000 * 60 * 60 * 24))} jours restants)</span>)}
                                  {store.subscriptionEnd <= Date.now() && (<span className="ml-2 text-[11px] text-red-600">(EXPIRÉ)</span>)}
                                </div>)}
                            </div>
                          </div>
                        </div>
                                                </div>
                        {/* Indicators displayed as two cards side-by-side */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4 max-w-none">
                                                    <Card className="w-full min-w-0 border-blue-200/70 bg-blue-500/[0.04] shadow-none">
                            <CardHeader>
                                                            <CardTitle className="text-sm">Fond</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between">
                                <div className={`font-bold text-2xl sm:text-2xl ${Number(store.fond_roulement) < 0 ? 'text-red-600' : Number(store.fond_roulement) > 0 ? 'text-blue-600' : 'text-gray-700'}`}>{formatCurrency(store.fond_roulement)}</div>
                                <Dialog open={fondDialogOpen} onOpenChange={setFondDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" aria-label="Éditer le fond de roulement">
                                      <Edit className="w-4 h-4"/>
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
                                        <Input value={fondValue} onChange={(e) => setFondValue(e.target.value)} disabled={loadingStore} placeholder="Ex: 50000"/>
                                      </div>
                                      <div>
                                        <Label>Note (facultatif)</Label>
                                        <Input value={fondNote} onChange={(e) => setFondNote(e.target.value)}/>
                                      </div>
                                      <div className="pt-2">
                                        <Label className="font-medium">Catégories indirectes affectées au Fond</Label>
                                        <div className="space-y-2 max-h-40 overflow-auto mt-1">
                                          {categories.filter((c: any) => c.type === 'indirect').length === 0 ? (<div className="text-xs text-muted-foreground">Aucune catégorie indirecte trouvée</div>) : (categories.filter((c: any) => c.type === 'indirect').map((c: any) => (<label key={c.id} className="flex items-center gap-2">
                                                <input type="checkbox" checked={selectedFondCats.includes(String(c.id))} onChange={() => toggleFondCat(String(c.id))}/>
                                                <span className="text-sm">{c.name || c.title || c.label || String(c.id)}</span>
                                              </label>)))}
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

                                                    <Card className="w-full min-w-0 border-emerald-200/70 bg-emerald-500/[0.04] shadow-none">
                            <CardHeader>
                              <CardTitle className="text-sm">Bénéfice</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between">
                                <div className={`font-bold text-2xl sm:text-2xl ${Number(store.benefice) < 0 ? 'text-red-600' : Number(store.benefice) > 0 ? 'text-green-600' : 'text-gray-700'}`}>{formatCurrency(store.benefice)}</div>
                                <Dialog open={benefDialogOpen} onOpenChange={setBenefDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" aria-label="Éditer le bénéfice">
                                      <Edit className="w-4 h-4"/>
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
                                        <Input value={benefValue} onChange={(e) => setBenefValue(e.target.value)} disabled={loadingStore} placeholder="Ex: 25000"/>
                                      </div>
                                      <div>
                                        <Label>Note (facultatif)</Label>
                                        <Input value={benefNote} onChange={(e) => setBenefNote(e.target.value)}/>
                                      </div>
                                      <div className="pt-2">
                                        <Label className="font-medium">Catégories indirectes affectées au Bénéfice</Label>
                                        <div className="space-y-2 max-h-40 overflow-auto mt-1">
                                          {categories.filter((c: any) => c.type === 'indirect').length === 0 ? (<div className="text-xs text-muted-foreground">Aucune catégorie indirecte trouvée</div>) : (categories.filter((c: any) => c.type === 'indirect').map((c: any) => (<label key={c.id} className="flex items-center gap-2">
                                                <input type="checkbox" checked={selectedBenefCats.includes(String(c.id))} onChange={() => toggleBenefCat(String(c.id))}/>
                                                <span className="text-sm">{c.name || c.title || c.label || String(c.id)}</span>
                                              </label>)))}
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
                      {store.solde_manual_note && (<p className="text-xs text-muted-foreground">Dernière note : {store.solde_manual_note}</p>)}
                      <p className="text-xs text-muted-foreground">L'ajustement manuel devient la base — les ventes/dépenses postérieures seront prises en compte automatiquement.</p>
                    </div>)}
                </CardContent>
              </Card>
            </div>
          </div>)}





                <div className="grid grid-cols-1 gap-5 2xl:grid-cols-12">
          {/* Printer card */}
                    <Card className={`${elevatedCardClassName} 2xl:col-span-7`}>
                        <CardHeader className="space-y-4 pb-4">
                            <SettingsSectionHeading icon={Printer} title="Imprimante" description="Connectez une imprimante thermique via Bluetooth et gardez un statut lisible pour l'impression des reçus." action={<Badge variant="outline" className={nativePrinterAvailable ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700' : 'border-red-200 bg-red-500/10 text-red-700'}>
                                        {nativePrinterAvailable ? 'Plugin natif détecté' : 'Plugin natif absent'}
                                    </Badge>}/>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="outline" className={selectedPrinter ? (printerConnected ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700' : 'border-amber-200 bg-amber-500/10 text-amber-700') : 'border-slate-200 bg-slate-500/10 text-slate-700'}>{printerStatusLabel}</Badge>
                                <Badge variant="outline" className="border-slate-200 bg-slate-500/10 text-slate-700">{selectedPrinterName}</Badge>
                                <Badge variant="outline" className={autoPrint ? 'border-blue-200 bg-blue-500/10 text-blue-700' : 'border-slate-200 bg-slate-500/10 text-slate-700'}>{autoPrint ? 'Auto-impression active' : 'Auto-impression inactive'}</Badge>
                            </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <Button onClick={async () => {
            // Open native paired devices list / test print flow
            try {
                                setScanning(true);
                const devices = await NativePrinter.listPaired();
                setPaired(devices || []);
                if (!devices || devices.length === 0)
                    toast.info('Aucune imprimante appairée trouvée');
            }
            catch (e) {
                toast.error('Impossible de lister les appareils appairés');
            }
                        finally {
                                setScanning(false);
                        }
                }} className="w-full sm:w-auto" disabled={scanning}>{scanning ? 'Recherche en cours...' : 'Rechercher imprimantes'}</Button>
                  <Button variant="outline" onClick={handlePrinterDiagnostics} className="w-full sm:w-auto">Diagnostic</Button>
                  <div className="flex-1"/>
                  {/* Test d'impression disponible ci-dessous — un seul bouton centralisé */}
                </div>
                {lastPrinterDiagAt && (<p className="text-xs text-muted-foreground">Dernier diagnostic: {lastPrinterDiagAt}</p>)}

                                <Separator/>

                {/* Afficher l'avertissement et la liste des imprimantes directement
            sous le bouton Rechercher imprimantes pour une meilleure UX */}
                                {paired.length === 0 ? (<div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground mt-2">Aucune imprimante appairée trouvée. Assurez-vous que l'imprimante est appairée au téléphone via les paramètres Android.</div>) : (<div className="space-y-2 mt-2">
                    {paired.map(d => (<div key={d.id} className={`p-2 border rounded flex items-center justify-between ${selectedPrinter === d.id ? 'bg-muted' : ''}`}>
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
                        try {
                            await secureStorage.setItem('printer_mac', d.id);
                        }
                        catch (e) { }
                        try {
                            await storageSet('printer_mac', d.id);
                        }
                        catch (e) { }
                        try {
                            localStorage.setItem('printer_mac', d.id);
                        }
                        catch (e) { }
                        setSelectedPrinter(d.id);
                        // enable auto-connect when user manually connects
                        try {
                            await secureStorage.setItem('printer_auto_connect', '1');
                        }
                        catch (e) { }
                        try {
                            await storageSet('printer_auto_connect', '1');
                        }
                        catch (e) { }
                        try {
                            localStorage.setItem('printer_auto_connect', '1');
                        }
                        catch (e) { }
                        setPrinterAutoConnect(true);
                        toast.success('Connecté');
                    }
                    else {
                        const msg = res && res.error ? String(res.error) : 'Connexion échouée';
                        toast.error(`Connexion échouée: ${msg}`);
                    }
                }}>Connecter</Button>
                        </div>
                      </div>))}
                  </div>)}

                {/* Affichage synthétique de l'imprimante sélectionnée / connexion */}
                                <div className="mt-3 rounded-2xl border border-border/60 bg-muted/25 p-4">
                  {selectedPrinter ? (<div className="flex items-center justify-between">
                      <div className="text-sm">
                                                <div className="font-medium">Imprimante sélectionnée</div>
                                                <div className="text-xs text-muted-foreground">{selectedPrinterName}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`inline-flex items-center gap-2 px-2 py-1 rounded text-sm ${printerConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          <span>{printerConnected ? 'Connectée' : 'Déconnectée'}</span>
                        </div>
                      </div>
                    </div>) : (<div className="text-sm text-muted-foreground">Aucune imprimante sélectionnée.</div>)}
                </div>

                                <Separator/>

                <div className="py-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">Impression automatique après vente</div>
                    <Switch checked={autoPrint} onCheckedChange={(v) => handleAutoPrint(!!v)}/>
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

                                <div className="rounded-2xl border border-border/60 text-white">
                                    <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
                                            <Button onClick={handleTestPrint} title="Test d'impression" aria-label="Test d'impression" className="w-full justify-start gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left sm:w-auto sm:justify-center" disabled={isTesting}>
                        <Printer className="h-4 w-4 shrink-0"/>
                                                <span>{isTesting ? 'Test en cours...' : 'Imprimer un reçu de test'}</span>
                      </Button>
                                            <Button className="w-full justify-start gap-3 whitespace-nowrap rounded-xl border-sky-700 bg-sky-600 px-4 py-3 text-left text-white shadow-sm hover:bg-sky-700 sm:w-auto sm:justify-center" variant="outline" onClick={async () => {
            const ok = NativePrinter.isConnected();
            setPrinterConnected(ok);
            toast.info(ok ? 'Imprimante native connectée' : 'Aucune connexion native');
        }} title="Statut imprimante" aria-label="Statut imprimante">
                        <Check className="h-4 w-4 shrink-0"/>
                        <span className="text-sm">Verifier le statut</span>
                      </Button>
                                            <Button size="sm" variant="outline" className="w-full justify-start gap-3 whitespace-nowrap rounded-xl border-rose-700 bg-rose-600 px-4 py-3 text-left text-white shadow-sm hover:bg-rose-700 sm:w-auto sm:justify-center" onClick={async () => {
            try {
                await NativePrinter.disconnect();
            }
            catch (e) {
            }
            // clear stored selection
            try {
                await secureStorage.removeItem('printer_mac');
            }
            catch (e) { }
            try {
                await storageSet('printer_mac', '');
            }
            catch (e) { }
            try {
                localStorage.removeItem('printer_mac');
            }
            catch (e) { }
            // disable auto-connect when user manually disconnects
            try {
                await secureStorage.setItem('printer_auto_connect', '0');
            }
            catch (e) { }
            try {
                await storageSet('printer_auto_connect', '0');
            }
            catch (e) { }
            try {
                localStorage.setItem('printer_auto_connect', '0');
            }
            catch (e) { }
            setPrinterAutoConnect(false);
            setSelectedPrinter(null);
            setPrinterConnected(false);
            toast.success('Imprimante dissociée et déconnectée (auto-connexion désactivée)');
                }}>
                                                <LogOut className="h-4 w-4 shrink-0"/>
                                                <span>Dissocier l'imprimante</span>
                                            </Button>
                    </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email Notifications Configuration card */}
                    {canEditEmailSettings && (<Card className={`${elevatedCardClassName} 2xl:col-span-5`}>
                            <CardHeader className="space-y-4 pb-4">
                                <SettingsSectionHeading icon={BellRing} title="Notifications Email" description="Choisissez quels événements doivent déclencher un email automatique pour le magasin." action={<Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-emerald-700">Synchronisé</Badge>}/>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Fermetures de services</p>
                      <p className="text-xs text-muted-foreground">Reçoit un email à chaque fermeture de shift</p>
                    </div>
                    <Switch checked={emailSettings.shifts} onCheckedChange={(checked) => {
                saveEmailSettings({ ...emailSettings, shifts: checked });
            }} disabled={loadingEmailSettings}/>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Signalements de stock</p>
                      <p className="text-xs text-muted-foreground">Reçoit un email à chaque signalement de performance stock</p>
                    </div>
                    <Switch checked={emailSettings.stockSignals} onCheckedChange={(checked) => {
                saveEmailSettings({ ...emailSettings, stockSignals: checked });
            }} disabled={loadingEmailSettings}/>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Dépenses</p>
                      <p className="text-xs text-muted-foreground">Reçoit un email à chaque ajout/modification de dépense</p>
                    </div>
                    <Switch checked={emailSettings.expenses} onCheckedChange={(checked) => {
                saveEmailSettings({ ...emailSettings, expenses: checked });
            }} disabled={loadingEmailSettings}/>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Connexions utilisateurs</p>
                      <p className="text-xs text-muted-foreground">Reçoit un email à chaque connexion d'utilisateur</p>
                    </div>
                    <Switch checked={emailSettings.logins} onCheckedChange={(checked) => {
                saveEmailSettings({ ...emailSettings, logins: checked });
            }} disabled={loadingEmailSettings}/>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Remboursements</p>
                      <p className="text-xs text-muted-foreground">Reçoit un email à chaque remboursement de vente</p>
                    </div>
                    <Switch checked={emailSettings.refunds} onCheckedChange={(checked) => {
                saveEmailSettings({ ...emailSettings, refunds: checked });
            }} disabled={loadingEmailSettings}/>
                  </div>
                </div>
              </CardContent>
            </Card>)}
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">

          {/* PIN Security Configuration card */}
                                        <Card className={`${elevatedCardClassName} xl:col-span-5`}>
                        <CardHeader className="space-y-4 pb-4">
                                                        <SettingsSectionHeading icon={Shield} title="Sécurité par code PIN" description="Ajoutez un code PIN demandé au retour sur l'application pour sécuriser le poste." action={<Badge variant="outline" className={pinEnabled ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700' : 'border-slate-200 bg-slate-500/10 text-slate-700'}>
                                        {pinEnabled ? 'Protection active' : 'Protection inactive'}
                                    </Badge>}/>
            </CardHeader>
            <CardContent>
                            <div className="grid gap-4 xl:grid-cols-2 xl:items-stretch">
                                                                <div className="rounded-2xl border border-border/60 bg-muted/25 p-4">
                                    <p className="text-sm font-medium">État actuel</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{pinEnabled ? 'Le verrouillage PIN est actif pour ce compte.' : 'Aucun code PIN supplémentaire n’est demandé actuellement.'}</p>
                                </div>

                                <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/25 p-4">
                                    <div className="pr-4">
                    <p className="text-sm font-medium">Code PIN</p>
                    <p className="text-xs text-muted-foreground">
                      {pinEnabled ? 'Activé - L\'application demandera votre PIN' : 'Désactivé - Pas de vérification PIN'}
                    </p>
                  </div>
                  <Switch checked={pinEnabled} onCheckedChange={handleTogglePin} disabled={loadingPin}/>
                </div>

                {/* Dialog for setting new PIN */}
                <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Configurer le code PIN</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nouveau code PIN (4 chiffres minimum)</Label>
                        <Input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="••••" disabled={loadingPin}/>
                      </div>
                      <div>
                        <Label>Confirmer le code PIN</Label>
                        <Input type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="••••" disabled={loadingPin}/>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="w-1/2" onClick={() => {
            setPinDialogOpen(false);
            setNewPin('');
            setConfirmPin('');
            setCurrentPin('');
        }} disabled={loadingPin}>
                          Annuler
                        </Button>
                        <Button className="w-1/2" onClick={handleSavePin} disabled={loadingPin}>
                          {loadingPin ? 'Enregistrement...' : 'Enregistrer'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
          {/* Appearance / Logo card */}
                                        <Card className={`${elevatedCardClassName} xl:col-span-7`}>
                        <CardHeader className="space-y-4 pb-4">
                                                        <SettingsSectionHeading icon={Palette} title="Apparence" description="Ajustez le thème et l’identité visuelle affichée sur les reçus et dans l’interface." action={<Badge variant="outline" className="border-slate-200 bg-slate-500/10 text-slate-700">{darkMode ? 'Mode sombre' : 'Mode clair'}</Badge>}/>
            </CardHeader>
            <CardContent>
                            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:items-start">
                                <div className="rounded-2xl border border-border/60 bg-muted/25 p-4">
                                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label id="dark-mode-label">Mode sombre</Label>
                    <p className="text-xs text-muted-foreground">Pour une interface sombre.</p>
                  </div>
                  <Switch aria-labelledby="dark-mode-label" checked={darkMode} onCheckedChange={handleDarkMode}/>
                </div>
                                </div>

                                <div className="flex items-start gap-4 rounded-2xl border border-border/60 bg-muted/25 p-4">
                                    <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-[1.5rem] border border-border/60 bg-gradient-to-br from-slate-100 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
                                        {(logoPreview || store?.logo) ? (<img src={logoPreview || store?.logo} alt="Logo magasin" className="object-contain w-full h-full p-3"/>) : (<div className="flex flex-col items-center text-xs text-muted-foreground">
                        <ImageIcon size={20}/>
                        <span>Aucun logo</span>
                      </div>)}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-medium">Logo du magasin</p>
                    <p className="text-xs text-muted-foreground">Formats acceptés : PNG, JPEG. Taille recommandée : 300x300px.</p>

                                                                                <div className="mt-3 flex flex-wrap gap-2 xl:flex-nowrap">
                      {/* Hidden file input and styled button */}
                      <input id="logo-input" type="file" accept="image/*" onChange={handleLogoChange} className="hidden"/>
                                            <label htmlFor="logo-input" className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v4a1 1 0 001 1h3m10 0h3a1 1 0 001-1V7M8 21h8M12 3v12"/>
                        </svg>
                        <span className="text-sm">Téléverser un logo</span>
                      </label>

                                                                                        {(logoPreview || store?.logo) && (<button type="button" onClick={handleRemoveLogo} className="inline-flex items-center justify-center rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100" title="Supprimer le logo">
                          <Trash size={18}/>
                                                    <span>Supprimer</span>
                        </button>)}

                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>



      </div>
    </div>);
}
