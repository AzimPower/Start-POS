import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
export default function useAndroidBackButton() {
    const navigate = useNavigate();
    const location = useLocation();
    const stack = useRef<string[]>([]);
    const lastExitPress = useRef<number | null>(null);
    const listenerRef = useRef<{
        remove: () => void;
    } | null>(null);
    useEffect(() => {
        const path = location.pathname + location.search + location.hash;
        const s = stack.current;
        if (s.length === 0 || s[s.length - 1] !== path)
            s.push(path);
        if (s.length > 50)
            s.splice(0, s.length - 50);
    }, [location]);
    useEffect(() => {
        let mounted = true;
        async function addListener() {
            const handleBack = (ev?: any, source?: string, mod?: any) => {
                try {
                    if (process.env.NODE_ENV === 'development') {
                    }
                    try {
                        ev && typeof ev.preventDefault === 'function' && ev.preventDefault();
                    }
                    catch (e) { }
                    try {
                        ev && typeof ev.stopImmediatePropagation === 'function' && ev.stopImmediatePropagation();
                    }
                    catch (e) { }
                    const s = stack.current;
                    let canGoBack = false;
                    try {
                        const st = (window.history && (window.history as any).state) || (history && (history as any).state);
                        if (st && typeof st.idx === 'number')
                            canGoBack = st.idx > 0;
                    }
                    catch (e) { }
                    if (!canGoBack) {
                        try {
                            if (window.history && window.history.length > 1)
                                canGoBack = true;
                        }
                        catch (e) { }
                        if (!canGoBack && s.length > 1)
                            canGoBack = true;
                    }
                    if (process.env.NODE_ENV === 'development') {
                    }
                    if (canGoBack) {
                        try {
                            navigate(-1);
                        }
                        catch (e) {
                            if (s.length > 1) {
                                s.pop();
                                const prev = s[s.length - 1] || '/';
                                navigate(prev);
                            }
                        }
                        if (s.length > 1)
                            s.pop();
                        return true;
                    }
                    const now = Date.now();
                    if (!lastExitPress.current || now - lastExitPress.current > 2000) {
                        lastExitPress.current = now;
                        toast('Appuyez encore pour quitter', { duration: 2000 });
                        setTimeout(() => { lastExitPress.current = null; }, 2100);
                        return true;
                    }
                    try {
                        if (mod && typeof mod.App.exitApp === 'function')
                            mod.App.exitApp();
                        else if ((navigator as any).app && typeof (navigator as any).app.exitApp === 'function')
                            (navigator as any).app.exitApp();
                        else
                            window.close();
                    }
                    catch (e) { }
                    return true;
                }
                catch (err) {
                    return false;
                }
            };
            // try Capacitor App
            try {
                const importer: any = new Function("return import('@capacitor/app')");
                const mod = await importer();
                if (!mounted)
                    return;
                const listener = mod.App.addListener('backButton', (ev: any) => handleBack(ev, 'capacitor', mod));
                const docHandler = (ev: any) => { try {
                    const r = handleBack(ev, 'document', mod);
                    try {
                        ev && typeof ev.preventDefault === 'function' && ev.preventDefault();
                    }
                    catch (e) { }
                    try {
                        ev && typeof ev.stopImmediatePropagation === 'function' && ev.stopImmediatePropagation();
                    }
                    catch (e) { }
                    return r;
                }
                catch (e) {
                    return false;
                } };
                const winHandler = (ev: any) => { try {
                    const r = handleBack(ev, 'window', mod);
                    try {
                        ev && typeof ev.preventDefault === 'function' && ev.preventDefault();
                    }
                    catch (e) { }
                    try {
                        ev && typeof ev.stopImmediatePropagation === 'function' && ev.stopImmediatePropagation();
                    }
                    catch (e) { }
                    return r;
                }
                catch (e) {
                    return false;
                } };
                try {
                    document.addEventListener('backbutton', docHandler, true);
                }
                catch (e) { }
                try {
                    window.addEventListener('backbutton', winHandler, true);
                }
                catch (e) { }
                const removeAll = () => {
                    try {
                        listener.remove();
                    }
                    catch (e) { }
                    try {
                        document.removeEventListener('backbutton', docHandler, true);
                    }
                    catch (e) { }
                    try {
                        window.removeEventListener('backbutton', winHandler, true);
                    }
                    catch (e) { }
                };
                listenerRef.current = { remove: removeAll };
                return;
            }
            catch (e) {
                // fallback (web/other runtimes)
                const docHandler = (ev: any) => handleBack(ev, 'document');
                const winHandler = (ev: any) => { try {
                    const r = handleBack(ev, 'window');
                    try {
                        ev && typeof ev.preventDefault === 'function' && ev.preventDefault();
                    }
                    catch (e) { }
                    try {
                        ev && typeof ev.stopImmediatePropagation === 'function' && ev.stopImmediatePropagation();
                    }
                    catch (e) { }
                    return r;
                }
                catch (e) {
                    return false;
                } };
                try {
                    document.addEventListener('backbutton', docHandler, true);
                }
                catch (e) { }
                try {
                    window.addEventListener('backbutton', winHandler, true);
                }
                catch (e) { }
                const onPop = () => {
                    const s = stack.current;
                    if (s.length > 1)
                        s.pop();
                };
                window.addEventListener('popstate', onPop);
                listenerRef.current = { remove: () => {
                        try {
                            document.removeEventListener('backbutton', docHandler, true);
                        }
                        catch (e) { }
                        try {
                            window.removeEventListener('backbutton', winHandler, true);
                        }
                        catch (e) { }
                        try {
                            window.removeEventListener('popstate', onPop);
                        }
                        catch (e) { }
                    } };
            }
        }
        addListener();
        return () => {
            mounted = false;
            try {
                listenerRef.current && listenerRef.current.remove();
            }
            catch (e) { }
        };
    }, [navigate]);
}
