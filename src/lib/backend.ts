const DEFAULT_BACKEND_BASE = 'https://start-pos.com/backend';

export const BACKEND_BASE = (import.meta.env.VITE_API_URL || DEFAULT_BACKEND_BASE).trim().replace(/\/+$/, '');
let backendAvailabilityCache: {
    value: boolean;
    checkedAt: number;
} | null = null;
let backendAvailabilityInFlight: Promise<boolean> | null = null;
const backendAvailabilityListeners = new Set<(state: { value: boolean | null; checkedAt: number }) => void>();
type HealthProbeState = {
    ok: boolean | null;
    status: number | null;
    error: string | null;
    checkedAt: number;
};
let lastHealthProbeState: HealthProbeState = {
    ok: null,
    status: null,
    error: null,
    checkedAt: 0,
};
const healthProbeListeners = new Set<(state: HealthProbeState) => void>();

function emitBackendAvailability() {
    const snapshot = {
        value: backendAvailabilityCache?.value ?? null,
        checkedAt: backendAvailabilityCache?.checkedAt ?? 0,
    };

    backendAvailabilityListeners.forEach((listener) => {
        try {
            listener(snapshot);
        }
        catch (e) {
        }
    });
}

function emitHealthProbeState() {
    const snapshot = { ...lastHealthProbeState };
    healthProbeListeners.forEach((listener) => {
        try {
            listener(snapshot);
        }
        catch (e) {
        }
    });
}

function setBackendAvailability(value: boolean) {
    backendAvailabilityCache = { value, checkedAt: Date.now() };
    emitBackendAvailability();
}

function setHealthProbeState(next: Partial<HealthProbeState>) {
    lastHealthProbeState = {
        ...lastHealthProbeState,
        ...next,
        checkedAt: next.checkedAt ?? Date.now(),
    };
    emitHealthProbeState();
}

export function getBackendAvailabilityState() {
    return {
        value: backendAvailabilityCache?.value ?? null,
        checkedAt: backendAvailabilityCache?.checkedAt ?? 0,
    };
}

export function onBackendAvailabilityChange(listener: (state: { value: boolean | null; checkedAt: number }) => void) {
    backendAvailabilityListeners.add(listener);
    return () => {
        backendAvailabilityListeners.delete(listener);
    };
}

export function getLastHealthProbeState() {
    return { ...lastHealthProbeState };
}

export function onHealthProbeStateChange(listener: (state: HealthProbeState) => void) {
    healthProbeListeners.add(listener);
    return () => {
        healthProbeListeners.delete(listener);
    };
}

export function markBackendReachable() {
    setBackendAvailability(true);
}

export function markBackendUnreachable() {
    setBackendAvailability(false);
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeBackendOnce(timeout: number): Promise<boolean> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const url = new URL(`${BACKEND_BASE}/api/health.php`);
        url.searchParams.set('_ts', String(Date.now()));
        url.searchParams.set('_bypass_sw', '1');

        const res = await fetch(url.toString(), {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
        });

        setHealthProbeState({
            ok: res.ok,
            status: res.status,
            error: null,
            checkedAt: Date.now(),
        });
        return res.ok;
    }
    catch (e) {
        setHealthProbeState({
            ok: false,
            status: null,
            error: e instanceof Error ? e.message : String(e || 'unknown_error'),
            checkedAt: Date.now(),
        });
        return false;
    }
    finally {
        clearTimeout(id);
    }
}

export function normalizeImageUrl(url?: string | null): string {
    if (!url)
        return '';
    const trimmed = String(url).trim();
    if (!trimmed)
        return '';
    if (/^(data:|blob:|https?:\/\/)/i.test(trimmed))
        return trimmed;
    if (trimmed.startsWith('/'))
        return `${BACKEND_BASE}${trimmed}`;
    return `${BACKEND_BASE}/${trimmed}`;
}
// Lightweight backend reachability check with timeout
export async function backendAvailable(timeout = 5000, force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && backendAvailabilityCache) {
        const ttl = backendAvailabilityCache.value ? 30000 : 10000;
        if (now - backendAvailabilityCache.checkedAt < ttl) {
            return backendAvailabilityCache.value;
        }
    }
    if (!force && backendAvailabilityInFlight) {
        return backendAvailabilityInFlight;
    }

    backendAvailabilityInFlight = (async () => {
        try {
            let value = await probeBackendOnce(timeout);
            if (!value) {
                await sleep(350);
                value = await probeBackendOnce(timeout);
            }
            setBackendAvailability(value);
            return value;
        }
        catch (e) {
            setBackendAvailability(false);
            return false;
        }
        finally {
            backendAvailabilityInFlight = null;
        }
    })();

    return backendAvailabilityInFlight;
}
