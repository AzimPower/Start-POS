/**
 * Service d'envoi d'emails avec gestion améliorée pour mobile
 */
interface EmailPayload {
    name: string;
    email: string;
    message: string;
    storeName?: string;
}
interface EmailResponse {
    ok: boolean;
    error?: string;
}
class EmailService {
    private readonly baseUrl = 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api';
    private readonly timeout = 15000; // 15 secondes pour mobile
    /**
     * Envoie un email avec retry automatique et timeout adapté mobile
     */
    async sendEmail(payload: EmailPayload, retryCount = 3): Promise<EmailResponse> {
        // Détecter si on est sur Android/Capacitor
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isCapacitor = !!(window as any).Capacitor;
        // Sur Android/Capacitor, utiliser directement XMLHttpRequest
        if (isAndroid || isCapacitor) {
            return await this.sendEmailFallback(payload);
        }
        // Tentative normale d'abord pour autres environnements
        const normalResult = await this.sendEmailNormal(payload, retryCount);
        if (normalResult.ok) {
            return normalResult;
        }
        // Si échec et que l'erreur semble liée au Service Worker ou channel, essayer le fallback
        const shouldUseFallback = normalResult.error?.includes('fetch') ||
            normalResult.error?.includes('CORS') ||
            normalResult.error?.includes('channel closed') ||
            normalResult.error?.includes('listener indicated') ||
            normalResult.error?.includes('message channel');
        if (shouldUseFallback) {
            return await this.sendEmailFallback(payload);
        }
        return normalResult;
    }
    /**
     * Méthode normale avec fetch
     */
    private async sendEmailNormal(payload: EmailPayload, retryCount = 3): Promise<EmailResponse> {
        for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/send-email.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    cache: 'no-cache'
                }, this.timeout);
                if (!response.ok) {
                    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
                }
                const data: EmailResponse = await response.json();
                if (data.ok) {
                    return data;
                }
                else {
                    if (attempt === retryCount) {
                        return data; // Dernière tentative, renvoyer l'erreur
                    }
                }
            }
            catch (error) {
                if (attempt === retryCount) {
                    return {
                        ok: false,
                        error: error instanceof Error ? error.message : 'Erreur inconnue'
                    };
                }
                // Attendre avant de retry (délai progressif)
                await this.delay(attempt * 1000);
            }
        }
        return { ok: false, error: 'Toutes les tentatives ont échoué' };
    }
    /**
     * Méthode fallback avec XMLHttpRequest (contourne le Service Worker)
     */
    private async sendEmailFallback(payload: EmailPayload): Promise<EmailResponse> {
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            const url = `${this.baseUrl}/send-email.php?_fallback=${Date.now()}&_android=1`;
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.timeout = this.timeout;
            xhr.onload = function () {
                try {
                    if (xhr.status === 200) {
                        const response: EmailResponse = JSON.parse(xhr.responseText);
                        resolve(response);
                    }
                    else {
                        resolve({
                            ok: false,
                            error: `HTTP ${xhr.status}: ${xhr.statusText}`
                        });
                    }
                }
                catch (e) {
                    resolve({
                        ok: false,
                        error: 'Erreur de parsing de la réponse'
                    });
                }
            };
            xhr.onerror = function () {
                resolve({
                    ok: false,
                    error: 'Erreur réseau XMLHttpRequest'
                });
            };
            xhr.ontimeout = function () {
                resolve({
                    ok: false,
                    error: 'Timeout XMLHttpRequest'
                });
            };
            xhr.send(JSON.stringify(payload));
        });
    }
    /**
     * Fetch avec timeout personnalisé et contournement SW
     */
    private async fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            // Ajouter des paramètres pour contourner le Service Worker si nécessaire
            const finalUrl = new URL(url);
            finalUrl.searchParams.set('_t', Date.now().toString());
            finalUrl.searchParams.set('_bypass_sw', '1');
            const response = await fetch(finalUrl.toString(), {
                ...options,
                signal: controller.signal,
                mode: 'cors',
                credentials: 'omit',
                cache: 'no-store'
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Timeout après ${timeout}ms`);
            }
            throw error;
        }
    }
    /**
     * Délai d'attente
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Vérifie si l'envoi d'email est possible (connectivité)
     */
    async canSendEmail(): Promise<boolean> {
        if (!navigator.onLine) {
            return false;
        }
        // Sur Android, utiliser XMLHttpRequest pour le test aussi
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isCapacitor = !!(window as any).Capacitor;
        if (isAndroid || isCapacitor) {
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', `${this.baseUrl}/ping.php?_test=${Date.now()}`, true);
                xhr.timeout = 5000;
                xhr.onload = () => resolve(xhr.status === 200);
                xhr.onerror = () => resolve(false);
                xhr.ontimeout = () => resolve(false);
                xhr.send();
            });
        }
        try {
            // Test ping rapide vers le serveur
            const response = await this.fetchWithTimeout(`${this.baseUrl}/ping.php`, {
                method: 'GET',
                cache: 'no-store'
            }, 5000);
            const canSend = response.ok;
            return canSend;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Informations de debug pour le mobile
     */
    getDebugInfo() {
        return {
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            connection: (navigator as any).connection ? {
                effectiveType: (navigator as any).connection.effectiveType,
                downlink: (navigator as any).connection.downlink,
                rtt: (navigator as any).connection.rtt,
                saveData: (navigator as any).connection.saveData
            } : null,
            isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            isPWA: window.matchMedia('(display-mode: standalone)').matches,
            serviceWorker: 'serviceWorker' in navigator ? {
                controller: !!navigator.serviceWorker.controller,
                ready: navigator.serviceWorker.ready
            } : null
        };
    }
}
// Instance singleton
export const emailService = new EmailService();
// Gestion globale des erreurs de Service Worker
if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason?.message?.includes('message channel closed') ||
            event.reason?.message?.includes('listener indicated')) {
            event.preventDefault(); // Empêche l'affichage de l'erreur
        }
    });
}
// Export des types
export type { EmailPayload, EmailResponse };
