import { getAuthToken } from '@/lib/apiAuth';
import { BACKEND_BASE, backendAvailable } from '@/lib/backend';

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
    private readonly baseUrl = `${BACKEND_BASE}/api`;
    private readonly timeout = 15000;

    async sendEmail(payload: EmailPayload, retryCount = 3): Promise<EmailResponse> {
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isCapacitor = !!(window as any).Capacitor;

        if (isAndroid || isCapacitor) {
            return await this.sendEmailFallback(payload);
        }

        const normalResult = await this.sendEmailNormal(payload, retryCount);
        if (normalResult.ok) {
            return normalResult;
        }

        const shouldUseFallback = normalResult.error?.includes('fetch')
            || normalResult.error?.includes('CORS')
            || normalResult.error?.includes('channel closed')
            || normalResult.error?.includes('listener indicated')
            || normalResult.error?.includes('message channel');

        if (shouldUseFallback) {
            return await this.sendEmailFallback(payload);
        }

        return normalResult;
    }

    private async sendEmailNormal(payload: EmailPayload, retryCount = 3): Promise<EmailResponse> {
        for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/send-email.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                    cache: 'no-cache',
                }, this.timeout);

                if (!response.ok) {
                    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
                }

                const data: EmailResponse = await response.json();
                if (data.ok) {
                    return data;
                }

                if (attempt === retryCount) {
                    return data;
                }
            } catch (error) {
                if (attempt === retryCount) {
                    return {
                        ok: false,
                        error: error instanceof Error ? error.message : 'Erreur inconnue',
                    };
                }

                await this.delay(attempt * 1000);
            }
        }

        return { ok: false, error: 'Toutes les tentatives ont echoue' };
    }

    private async sendEmailFallback(payload: EmailPayload): Promise<EmailResponse> {
        const token = await getAuthToken();

        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            const url = `${this.baseUrl}/send-email.php?_fallback=${Date.now()}&_android=1`;

            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            xhr.timeout = this.timeout;

            xhr.onload = function () {
                try {
                    if (xhr.status === 200) {
                        const response: EmailResponse = JSON.parse(xhr.responseText);
                        resolve(response);
                    } else {
                        resolve({
                            ok: false,
                            error: `HTTP ${xhr.status}: ${xhr.statusText}`,
                        });
                    }
                } catch (e) {
                    resolve({
                        ok: false,
                        error: 'Erreur de parsing de la reponse',
                    });
                }
            };

            xhr.onerror = function () {
                resolve({
                    ok: false,
                    error: 'Erreur reseau XMLHttpRequest',
                });
            };

            xhr.ontimeout = function () {
                resolve({
                    ok: false,
                    error: 'Timeout XMLHttpRequest',
                });
            };

            xhr.send(JSON.stringify(payload));
        });
    }

    private async fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const finalUrl = new URL(url);
            finalUrl.searchParams.set('_t', Date.now().toString());
            finalUrl.searchParams.set('_bypass_sw', '1');

            const response = await fetch(finalUrl.toString(), {
                ...options,
                signal: controller.signal,
                mode: 'cors',
                credentials: 'omit',
                cache: 'no-store',
            });

            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Timeout apres ${timeout}ms`);
            }
            throw error;
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async canSendEmail(): Promise<boolean> {
        const backendUp = await backendAvailable().catch(() => false);
        if (!backendUp) {
            return false;
        }

        const isAndroid = /Android/i.test(navigator.userAgent);
        const isCapacitor = !!(window as any).Capacitor;
        if (isAndroid || isCapacitor) {
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', `${this.baseUrl}/health.php?_test=${Date.now()}`, true);
                xhr.timeout = 5000;
                xhr.onload = () => resolve(xhr.status === 200);
                xhr.onerror = () => resolve(false);
                xhr.ontimeout = () => resolve(false);
                xhr.send();
            });
        }

        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/health.php`, {
                method: 'GET',
                cache: 'no-store',
            }, 5000);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    getDebugInfo() {
        return {
            userAgent: navigator.userAgent,
            onlineHint: navigator.onLine,
            connection: (navigator as any).connection ? {
                effectiveType: (navigator as any).connection.effectiveType,
                downlink: (navigator as any).connection.downlink,
                rtt: (navigator as any).connection.rtt,
                saveData: (navigator as any).connection.saveData,
            } : null,
            isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            isPWA: window.matchMedia('(display-mode: standalone)').matches,
            serviceWorker: 'serviceWorker' in navigator ? {
                controller: !!navigator.serviceWorker.controller,
                ready: navigator.serviceWorker.ready,
            } : null,
        };
    }
}

export const emailService = new EmailService();
