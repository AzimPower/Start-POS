import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getDB } from '@/lib/db';
import * as secureStorage from '@/lib/secureStorage';
export default function Pin({ overlay = false }: {
    overlay?: boolean;
}) {
    const { user, isLocked, verifyPin, getPinFailedCount, isPinLocked, resetPinFailures, logout } = useAuth();
    const [pin, setPin] = useState('');
    const [locked, setLocked] = useState(false);
    const [logoSrc, setLogoSrc] = useState<string | null>(null);
    const [showAttempts, setShowAttempts] = useState(false);
    const [storedPinDigits, setStoredPinDigits] = useState<string | null>(null);
    const [bearEmotion, setBearEmotion] = useState<'neutral' | 'happy' | 'close' | 'sad' | 'scared'>('neutral');
    const navigate = useNavigate();
    useEffect(() => {
        setLocked(isPinLocked());
    }, [isPinLocked]);
    useEffect(() => {
        // Si aucun utilisateur n'est enregistré en local, on va sur login (jamais de PIN à la première ouverture)
        (async () => {
            try {
                let storedUser = localStorage.getItem('pos-user');
                if (!storedUser) {
                    try {
                        storedUser = await secureStorage.getItem('pos-user');
                        if (storedUser) {
                            try {
                                localStorage.setItem('pos-user', storedUser);
                            }
                            catch (e) { }
                        }
                    }
                    catch (e) {
                    }
                }
                if (!storedUser) {
                    navigate('/login');
                    return;
                }
                // Nothing to do here: the app keeps `user` restored at startup. If there
                // is no stored user, redirect to login.
            }
            catch (e) {
                navigate('/login');
            }
        })();
        // Si le PIN n'est pas bloqué, on reste sur PIN même si pendingUser est absent
    }, [navigate, isPinLocked]);
    useEffect(() => {
        // load store logo from localStorage (could be dataURL or server-relative path)
        const stored = localStorage.getItem('storeLogo');
        if (stored) {
            if (stored.startsWith('img_products/') || stored.includes('/img_products/')) {
                const API_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';
                // normalize to absolute
                const url = stored.startsWith('http') ? stored : `${API_BASE}/${stored.replace(/^\/+/, '')}`;
                setLogoSrc(url);
            }
            else {
                setLogoSrc(stored);
            }
        }
        else {
            setLogoSrc('/logo192.png'); // logo par défaut
        }
    }, []);
    // load stored PIN from local DB for the pending user (used to compute proximity feedback)
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                let stored = localStorage.getItem('pos-user');
                if (!stored) {
                    try {
                        stored = await secureStorage.getItem('pos-user');
                        if (stored)
                            try {
                                localStorage.setItem('pos-user', stored);
                            }
                            catch (e) { }
                    }
                    catch (e) {
                    }
                }
                if (!stored)
                    return;
                const parsed = JSON.parse(stored) as any;
                const db = await getDB();
                const record = await db.get('users', parsed.id);
                const pinRaw = String((record && (record as any).pin) || '').replace(/\D/g, '');
                if (mounted)
                    setStoredPinDigits(pinRaw || null);
            }
            catch (e) {
            }
        })();
        return () => { mounted = false; };
    }, []);
    const pushDigit = (d: string) => {
        if (locked)
            return;
        if (pin.length >= 4)
            return;
        const next = pin + d;
        setPin(next);
        // compute bear emotion based on the digit proximity to stored PIN at this position
        try {
            if (storedPinDigits && storedPinDigits.length > pin.length) {
                const expected = parseInt(storedPinDigits.charAt(pin.length), 10);
                const got = parseInt(d, 10);
                if (!Number.isFinite(expected) || !Number.isFinite(got)) {
                    setBearEmotion('neutral');
                }
                else {
                    const diff = Math.abs(expected - got);
                    if (diff === 0)
                        setBearEmotion('happy');
                    else if (diff === 1)
                        setBearEmotion('close');
                    else if (diff <= 3)
                        setBearEmotion('sad');
                    else
                        setBearEmotion('scared');
                }
            }
            else {
                // no stored PIN available or position out of range => neutral
                setBearEmotion('neutral');
            }
        }
        catch (e) {
            setBearEmotion('neutral');
        }
        // reset bear emotion after a short delay (1s) to avoid leaving a visual hint
        setTimeout(() => setBearEmotion('neutral'), 1000);
        if (next.length === 4) {
            // verify after small delay so UI updates
            setTimeout(() => submitPin(next), 120);
        }
    };
    const submitPin = async (value: string) => {
        if (!user)
            return navigate('/login');
        const ok = await verifyPin(value);
        if (ok) {
            setPin('');
            setShowAttempts(false);
            // If this Pin is used as an overlay for unlock, do not navigate or reload the app.
            if (!overlay) {
                // Restore last active path if available, otherwise default to dashboard
                try {
                    const last = localStorage.getItem('pos-last-path');
                    if (last && last !== '/pin' && last !== '/login') {
                        navigate(last);
                    }
                    else {
                        navigate('/dashboard');
                    }
                }
                catch (e) {
                    navigate('/dashboard');
                }
            }
            return;
        }
        const fails = getPinFailedCount();
        setShowAttempts(true);
        if (fails >= 5) {
            setLocked(true);
            toast.error('PIN bloqué. Vous allez être redirigé vers l\'écran de connexion.');
            // Force logout and redirect to login
            try {
                logout();
            }
            catch (e) {
            }
            navigate('/login');
            return;
        }
        setPin('');
        toast.error(`PIN incorrect — tentatives restantes: ${5 - fails}`);
    };
    const handleDelete = () => {
        if (locked)
            return;
        setPin((p) => {
            const newPin = p.slice(0, -1);
            // update bear emotion to reflect new length / position
            try {
                if (storedPinDigits && storedPinDigits.length > newPin.length) {
                    // neutral for now after delete
                    setBearEmotion('neutral');
                }
                else {
                    setBearEmotion('neutral');
                }
            }
            catch (e) {
                setBearEmotion('neutral');
            }
            return newPin;
        });
    };
    const handleLoginFallback = () => {
        // clear any local pin state and go to full login
        try {
            resetPinFailures();
        }
        catch (e) { /* noop */ }
        navigate('/login');
    };
    const attemptsLeft = () => {
        const c = getPinFailedCount();
        return Math.max(0, 5 - c);
    };
    // keypad layout
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    // When displayed as overlay, render fixed/fullscreen with backdrop and lock
    // scrolling to mimic a real modal/page so it appears above everything.
    useEffect(() => {
        if (!overlay)
            return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [overlay]);
    // Portal & focus-trap logic when overlay is active
    const containerRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!overlay)
            return;
        const appRoot = document.getElementById('root');
        const prevAria = appRoot?.getAttribute('aria-hidden');
        const prevPointer = appRoot ? appRoot.style.pointerEvents : undefined;
        const prevInert = appRoot ? (appRoot as any).inert : undefined;
        if (appRoot) {
            appRoot.setAttribute('aria-hidden', 'true');
            try {
                appRoot.style.pointerEvents = 'none';
            }
            catch (e) { }
            try {
                // some browsers support inert to make subtree non-interactive
                (appRoot as any).inert = true;
            }
            catch (e) { }
        }
        try {
            document.body.setAttribute('data-pin-active', 'true');
        }
        catch (e) { }
        // Force-close any open dialogs so they don't interfere with the PIN input.
        try {
            const REGISTRY_KEY = '__radix_dialog_registry_v1';
            const reg = (window as any)[REGISTRY_KEY];
            if (reg && typeof reg.forEach === 'function') {
                reg.forEach((entry: any) => {
                    try {
                        if (entry && typeof entry.forceClose === 'function')
                            entry.forceClose();
                    }
                    catch (e) { }
                });
            }
        }
        catch (e) { }
        const prevFocused = document.activeElement as HTMLElement | null;
        // focus the container so keyboard input goes to the overlay
        setTimeout(() => {
            try {
                containerRef.current?.focus();
            }
            catch (e) { }
        }, 0);
        const onKeyDown = (e: KeyboardEvent) => {
            if (!containerRef.current)
                return;
            // Trap Tab inside overlay
            if (e.key === 'Tab') {
                const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'));
                if (focusable.length === 0) {
                    e.preventDefault();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    }
                }
                else {
                    if (document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
            // Prevent Escape from closing underlying dialogs or affecting the app
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            // restore aria-hidden and pointer-events/inert
            if (appRoot) {
                if (prevAria === null)
                    appRoot.removeAttribute('aria-hidden');
                else if (prevAria !== undefined)
                    appRoot.setAttribute('aria-hidden', prevAria);
                try {
                    if (prevPointer === undefined)
                        appRoot.style.removeProperty('pointer-events');
                    else
                        appRoot.style.pointerEvents = prevPointer;
                }
                catch (e) { }
                try {
                    if (prevInert === undefined)
                        (appRoot as any).inert = false;
                    else
                        (appRoot as any).inert = prevInert;
                }
                catch (e) { }
            }
            try {
                document.body.removeAttribute('data-pin-active');
            }
            catch (e) { }
            // restore focus
            try {
                prevFocused?.focus();
            }
            catch (e) { }
        };
    }, [overlay]);
    const containerClass = overlay
        ? 'fixed inset-0 z-[99999] flex items-center justify-center p-4'
        : 'min-h-screen flex flex-col items-center justify-center bg-white p-4';
    const contentClass = overlay
        ? 'w-full max-w-sm bg-white rounded-lg shadow-lg p-4 relative z-50'
        : 'w-full max-w-sm';
    const overlayMarkup = (<div ref={containerRef} tabIndex={-1} className={`${containerClass} pin-overlay-root`} aria-modal={overlay ? 'true' : undefined} role={overlay ? 'dialog' : undefined} style={{ zIndex: 2147483647 }}>
      {overlay && <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"/>}
      {/* Tailwind safelist helper: keep these blue classes in production builds when they're applied dynamically */}
      <div className="sr-only" aria-hidden>
        <span className="bg-blue-600 border-blue-600 focus:ring-blue-400 from-blue-400 via-blue-600 to-blue-800"/>
      </div>
  <div className={contentClass}>
        <div className="flex flex-col items-center mb-6">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-400 via-blue-600 to-blue-800 rounded-2xl flex items-center justify-center shadow-md">
            <ShoppingCart className="w-8 h-8 text-white"/>
          </div>
          <h2 className="mt-4 text-lg font-medium">Saisir le code PIN</h2>
        </div>

        <div className="flex items-center justify-center space-x-4 mb-6">
          {[0, 1, 2, 3].map((i) => (<div key={i} className={`w-4 h-4 rounded-full border-2 ${i < pin.length ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}/>))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (<button key={k} onClick={(e) => { pushDigit(k); (e.currentTarget as HTMLButtonElement).blur(); }} className="h-20 bg-white border rounded-lg flex items-center justify-center text-2xl shadow-sm transform transition-transform duration-150 active:scale-95 hover:shadow-md focus:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label={`Chiffre ${k}`}>
              {k}
            </button>))}

            {/* Bear animation box: bottom-left cell (below 7 and left of 0) */}
            <div className="flex items-center justify-center">
              <div className="w-full h-20 bg-white border rounded-lg flex items-center justify-center shadow-sm">
                <div aria-hidden className={`text-4xl transform transition-all duration-300 ${bearEmotion === 'happy' ? 'animate-bounce' : ''} ${bearEmotion === 'scared' ? 'scale-110 animate-pulse' : ''}`}>
                  <span role="img" aria-label={`bear-${bearEmotion}`}>
                    {bearEmotion === 'happy' ? '😄' : bearEmotion === 'close' ? '🙂' : bearEmotion === 'sad' ? '😟' : bearEmotion === 'scared' ? '😱' : '🐻'}
                  </span>
                </div>
                <div className="sr-only">Émotion: {bearEmotion}</div>
              </div>
            </div>
          <button onClick={(e) => { pushDigit('0'); (e.currentTarget as HTMLButtonElement).blur(); }} className="h-20 bg-white border rounded-lg flex items-center justify-center text-2xl shadow-sm transform transition-transform duration-150 active:scale-95 hover:shadow-md focus:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label="Chiffre 0">
            0
          </button>
          <button onClick={(e) => { handleDelete(); (e.currentTarget as HTMLButtonElement).blur(); }} className="h-20 bg-white border rounded-lg flex items-center justify-center text-base shadow-sm transform transition-transform duration-150 active:scale-95 hover:shadow-md focus:scale-95 focus:outline-none focus:ring-2 focus:ring-red-400" aria-label="Effacer">
            Effacer
          </button>
        </div>

        <div className="mt-6 text-center">
          {locked ? (<>
              <p className="text-sm text-red-600 mb-2">Trop de tentatives. Veuillez vous reconnecter avec téléphone et mot de passe.</p>
              <button onClick={handleLoginFallback} className="text-sm text-blue-600">Se connecter</button>
            </>) : (showAttempts && (<p className="text-sm text-muted-foreground">Tentatives restantes: {attemptsLeft()}</p>))}
        </div>
      </div>
    </div>);
    if (overlay && typeof document !== 'undefined') {
        // Render overlay in a portal so it's outside normal app stacking context
        try {
            return createPortal(overlayMarkup, document.body);
        }
        catch (e) {
            return overlayMarkup;
        }
    }
    return overlayMarkup;
}
