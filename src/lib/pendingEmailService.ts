import { getDB, generateId } from './db';
import { emailService } from './emailService';
import { BACKEND_BASE, backendAvailable } from './backend';

const DEFAULT_ADMIN_EMAIL = (import.meta.env.VITE_DEFAULT_ADMIN_EMAIL || '').trim();

function getDefaultAdminFallback(storeId?: string): Array<{
    id: string;
    username: string;
    email: string;
}> {
    if (!DEFAULT_ADMIN_EMAIL) {
        return [];
    }

    return [{
        id: `default-admin-${storeId || 'global'}`,
        username: 'Admin par defaut',
        email: DEFAULT_ADMIN_EMAIL,
    }];
}
/**
 * Récupère STRICTEMENT les admins du store spécifique depuis le cache local
 */
export async function getAllStoreAdmins(storeId: string): Promise<Array<{
    id: string;
    username: string;
    email: string;
}>> {
    try {
        const db = await getDB();
        if (!storeId || storeId.trim() === '') {
            return [{
                    id: 'no-store-admin',
                    username: 'Admin par défaut',
                    email: DEFAULT_ADMIN_EMAIL
                }];
        }
        // 1. Récupérer UNIQUEMENT depuis le cache de ce store spécifique
        try {
            const cachedAdmin = await db.get('adminCache', storeId);
            if (cachedAdmin && cachedAdmin.allStoreAdmins && cachedAdmin.allStoreAdmins.length > 0) {
                // Double vérification: s'assurer que tous les admins ont un email valide
                // Ne plus filtrer par storeId ici car le cache est déjà spécifique au store
                const storeSpecificAdmins = cachedAdmin.allStoreAdmins.filter((admin: any) => {
                    const hasValidEmail = admin.email && admin.email.trim() !== '';
                    // Si les admins sont dans allStoreAdmins de ce store, ils sont valides
                    return hasValidEmail;
                });
                if (storeSpecificAdmins.length > 0) {
                    // Debug supplémentaire pour comprendre pourquoi on n'a qu'un admin
                    if (storeSpecificAdmins.length === 1) {
                    }
                    return storeSpecificAdmins;
                }
            }
            // Si allStoreAdmins n'existe pas mais qu'on a un admin principal en cache pour ce store
            if (cachedAdmin && cachedAdmin.email && cachedAdmin.email.trim() !== '') {
                return [{
                        id: cachedAdmin.id || 'cached-admin',
                        username: cachedAdmin.username || 'Admin',
                        email: cachedAdmin.email
                    }];
            }
        }
        catch (e) {
        }
        // 2. Chercher dans tous les caches MAIS filtrer strictement par storeId
        try {
            const allCaches = await db.getAll('adminCache');
            const storeSpecificCaches = allCaches.filter(cache => cache.id === storeId || cache.storeId === storeId);
            for (const cache of storeSpecificCaches) {
                if (cache.allStoreAdmins && cache.allStoreAdmins.length > 0) {
                    // Double filtrage: par email valide ET par storeId
                    const validStoreAdmins = cache.allStoreAdmins.filter((admin: any) => {
                        const hasValidEmail = admin.email && admin.email.trim() !== '';
                        const isCorrectStore = !admin.storeId || admin.storeId === storeId;
                        return hasValidEmail && isCorrectStore;
                    });
                    if (validStoreAdmins.length > 0) {
                        return validStoreAdmins;
                    }
                }
                // Essayer l'admin principal du cache s'il correspond au store
                if (cache.email && cache.email.trim() !== '' &&
                    (!cache.storeId || cache.storeId === storeId)) {
                    return [{
                            id: cache.id || 'store-admin',
                            username: cache.username || 'Admin',
                            email: cache.email
                        }];
                }
            }
        }
        catch (e) {
        }
        // 3. Ultime fallback: email par défaut (pas d'envoi croisé entre stores)
        return [{
                id: 'default-admin-' + storeId,
                username: 'Admin par défaut',
                email: DEFAULT_ADMIN_EMAIL
            }];
    }
    catch (error) {
        // Retourner email par défaut avec identification du store
        return [{
                id: 'error-fallback-' + storeId,
                username: 'Admin par défaut',
                email: DEFAULT_ADMIN_EMAIL
            }];
    }
}
/**
 * Récupère l'admin avec cache local et fallback vers backend
 * Utilise le même système de vérification que sendOrQueue
 */
export async function getAdminEmail(storeId: string): Promise<string | null> {
    try {
        const db = await getDB();
        if (!storeId || storeId.trim() === '') {
            const defaultAdminEmail = DEFAULT_ADMIN_EMAIL;
            return defaultAdminEmail;
        }
        // 1. Toujours essayer de récupérer l'admin depuis le cache local d'abord
        try {
            const cachedAdmin = await db.get('adminCache', storeId);
            if (cachedAdmin && cachedAdmin.email && cachedAdmin.email.trim() !== '') {
                return cachedAdmin.email;
            }
            else {
                // Debug : vérifier tout le cache
                const allCache = await db.getAll('adminCache');
            }
        }
        catch (e) {
        }
        // 2. Si pas trouvé en local, vérifier la connectivité avant backend
        const backendUp = await backendAvailable().catch(() => false);
        if (!backendUp) {
            const defaultAdminEmail = DEFAULT_ADMIN_EMAIL;
            return defaultAdminEmail;
        }
        // 3. Backend accessible, tentative de récupération
        try {
            const usersResponse = await fetch(`${BACKEND_BASE}/api/users.php`);
            if (usersResponse.ok) {
                const users = await usersResponse.json();
                const admin = users.find((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
                if (admin && admin.email) {
                    // Mettre en cache pour la prochaine fois
                    try {
                        const adminCache = {
                            id: storeId, // Utiliser storeId comme clé
                            username: admin.username,
                            email: admin.email,
                            role: admin.role,
                            cachedAt: Date.now()
                        };
                        await db.put('adminCache', adminCache);
                    }
                    catch (cacheError) {
                    }
                    return admin.email;
                }
            }
        }
        catch (backendError) {
        }
        // 4. En dernier recours, utiliser email admin par défaut
        const defaultAdminEmail = DEFAULT_ADMIN_EMAIL;
        return defaultAdminEmail;
    }
    catch (error) {
        return null;
    }
}
export interface PendingEmail {
    id: string;
    name: string;
    email: string;
    message: string;
    storeName: string;
    type: 'expense' | 'receipt' | 'shift' | 'stock' | 'refund';
    relatedId?: string;
    storeId: string;
    userId: string;
    createdAt: number;
    attempts: number;
    lastAttempt?: number;
    status: 'pending' | 'sent' | 'failed';
    error?: string;
}
class PendingEmailService {
    /**
     * Ajoute un email à la file d'attente
     */
    async queueEmail(emailData: {
        name: string;
        email: string;
        message: string;
        storeName: string;
        type: 'expense' | 'receipt' | 'shift' | 'stock' | 'refund';
        relatedId?: string;
        storeId: string;
        userId: string;
    }): Promise<string> {
        try {
            const db = await getDB();
            const id = generateId();
            const pendingEmail: PendingEmail = {
                id,
                ...emailData,
                createdAt: Date.now(),
                attempts: 0,
                status: 'pending'
            };
            await db.add('pendingEmails', pendingEmail);
            return id;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Envoie un email à TOUS les admins du store
     */
    async sendToAllAdmins(emailData: {
        message: string;
        storeName: string;
        type: 'expense' | 'receipt' | 'shift' | 'stock' | 'refund';
        relatedId?: string;
        storeId: string;
        userId: string;
    }): Promise<{
        totalAdmins: number;
        sent: number;
        queued: number;
        results: Array<{
            email: string;
            sent: boolean;
            queued: boolean;
            id?: string;
        }>;
    }> {
        // Récupérer tous les admins du store
        const storeAdmins = await getAllStoreAdmins(emailData.storeId);
        if (storeAdmins.length === 0) {
            // Fallback vers l'ancien système avec email par défaut
            const defaultResult = await this.sendOrQueue({
                name: 'Admin',
                email: DEFAULT_ADMIN_EMAIL,
                message: emailData.message,
                storeName: emailData.storeName,
                type: emailData.type,
                relatedId: emailData.relatedId,
                storeId: emailData.storeId,
                userId: emailData.userId
            });
            return {
                totalAdmins: 1,
                sent: defaultResult.sent ? 1 : 0,
                queued: defaultResult.queued ? 1 : 0,
                results: [{
                        email: DEFAULT_ADMIN_EMAIL,
                        sent: defaultResult.sent,
                        queued: defaultResult.queued,
                        id: defaultResult.id
                    }]
            };
        }
        let totalSent = 0;
        let totalQueued = 0;
        const results = [];
        // Envoyer à chaque admin
        for (const admin of storeAdmins) {
            try {
                const result = await this.sendOrQueue({
                    name: admin.username,
                    email: admin.email,
                    message: emailData.message,
                    storeName: emailData.storeName,
                    type: emailData.type,
                    relatedId: emailData.relatedId,
                    storeId: emailData.storeId,
                    userId: emailData.userId
                });
                if (result.sent)
                    totalSent++;
                if (result.queued)
                    totalQueued++;
                results.push({
                    email: admin.email,
                    sent: result.sent,
                    queued: result.queued,
                    id: result.id
                });
                // Délai entre les envois
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            catch (error) {
                results.push({
                    email: admin.email,
                    sent: false,
                    queued: false
                });
            }
        }
        return {
            totalAdmins: storeAdmins.length,
            sent: totalSent,
            queued: totalQueued,
            results
        };
    }
    /**
     * Tente d'envoyer un email immédiatement ou le met en attente
     * Utilise le même système de vérification que les ventes/dépenses
     */
    async sendOrQueue(emailData: {
        name: string;
        email: string;
        message: string;
        storeName: string;
        type: 'expense' | 'receipt' | 'shift' | 'stock' | 'refund';
        relatedId?: string;
        storeId: string;
        userId: string;
    }): Promise<{
        sent: boolean;
        queued: boolean;
        id?: string;
    }> {
        // Utiliser le même système que pour les ventes/dépenses
        const backendUp = await backendAvailable().catch(() => false);
        // Vérifier si on est en ligne ET si le backend est accessible
        if (!backendUp) {
            const id = await this.queueEmail(emailData);
            return { sent: false, queued: true, id };
        }
        try {
            const result = await emailService.sendEmail({
                name: emailData.name,
                email: emailData.email,
                message: emailData.message,
                storeName: emailData.storeName
            });
            if (result.ok) {
                return { sent: true, queued: false };
            }
            else {
                const id = await this.queueEmail(emailData);
                return { sent: false, queued: true, id };
            }
        }
        catch (error) {
            const id = await this.queueEmail(emailData);
            return { sent: false, queued: true, id };
        }
    }
    /**
     * Récupère tous les emails en attente
     */
    async getPendingEmails(storeId?: string): Promise<PendingEmail[]> {
        try {
            const db = await getDB();
            if (storeId) {
                return await db.getAllFromIndex('pendingEmails', 'by-store', storeId);
            }
            return await db.getAll('pendingEmails');
        }
        catch (error) {
            return [];
        }
    }
    /**
     * Traite tous les emails en attente
     */
    async processPendingEmails(): Promise<{
        sent: number;
        failed: number;
        total: number;
    }> {
        try {
            const db = await getDB();
            const pendingEmails = await db.getAllFromIndex('pendingEmails', 'by-status', 'pending');
            let sent = 0;
            let failed = 0;
            for (const email of pendingEmails) {
                try {
                    // Limiter les tentatives
                    if (email.attempts >= 3) {
                        await this.markAsFailed(email.id, 'Trop de tentatives');
                        failed++;
                        continue;
                    }
                    // Tentative d'envoi
                    const result = await emailService.sendEmail({
                        name: email.name,
                        email: email.email,
                        message: email.message,
                        storeName: email.storeName
                    });
                    if (result.ok) {
                        await this.deleteEmail(email.id);
                        sent++;
                    }
                    else {
                        await this.incrementAttempts(email.id, result.error);
                        failed++;
                    }
                }
                catch (error) {
                    await this.incrementAttempts(email.id, error.message);
                    failed++;
                }
                // Délai entre les envois pour éviter le spam
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return { sent, failed, total: pendingEmails.length };
        }
        catch (error) {
            return { sent: 0, failed: 0, total: 0 };
        }
    }
    /**
     * Marque un email comme échoué
     */
    private async markAsFailed(emailId: string, error: string): Promise<void> {
        try {
            const db = await getDB();
            const email = await db.get('pendingEmails', emailId);
            if (email) {
                email.status = 'failed';
                email.error = error;
                email.lastAttempt = Date.now();
                await db.put('pendingEmails', email);
            }
        }
        catch (error) {
        }
    }
    /**
     * Supprime définitivement un email (utilisé pour les emails envoyés avec succès)
     */
    private async deleteEmail(emailId: string): Promise<void> {
        try {
            const db = await getDB();
            await db.delete('pendingEmails', emailId);
        }
        catch (error) {
        }
    }
    /**
     * Incrémente le nombre de tentatives
     */
    private async incrementAttempts(emailId: string, error?: string): Promise<void> {
        try {
            const db = await getDB();
            const email = await db.get('pendingEmails', emailId);
            if (email) {
                email.attempts++;
                email.lastAttempt = Date.now();
                if (error)
                    email.error = error;
                await db.put('pendingEmails', email);
            }
        }
        catch (error) {
        }
    }
    /**
     * Nettoie les emails anciens (envoyés depuis plus de 7 jours)
     */
    async cleanupOldEmails(): Promise<number> {
        try {
            const db = await getDB();
            const allEmails = await db.getAll('pendingEmails');
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            let cleaned = 0;
            for (const email of allEmails) {
                // Supprimer uniquement les emails 'failed' très anciens (plus de 7 jours)
                // Les emails 'pending' sont gardés pour retry, les 'sent' sont déjà supprimés immédiatement
                if (email.status === 'failed' && email.lastAttempt && email.lastAttempt < sevenDaysAgo) {
                    await db.delete('pendingEmails', email.id);
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
    }
    /**
     * Statistiques des emails en attente
     */
    async getStats(): Promise<{
        pending: number;
        sent: number;
        failed: number;
        total: number;
    }> {
        try {
            const db = await getDB();
            const allEmails = await db.getAll('pendingEmails');
            const stats = {
                pending: 0,
                sent: 0,
                failed: 0,
                total: allEmails.length
            };
            for (const email of allEmails) {
                switch (email.status) {
                    case 'pending':
                        stats.pending++;
                        break;
                    case 'sent':
                        stats.sent++;
                        break;
                    case 'failed':
                        stats.failed++;
                        break;
                }
            }
            return stats;
        }
        catch (error) {
            return { pending: 0, sent: 0, failed: 0, total: 0 };
        }
    }
}
export const pendingEmailService = new PendingEmailService();
