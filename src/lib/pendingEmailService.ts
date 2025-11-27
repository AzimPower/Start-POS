import { getDB, generateId } from './db';
import { emailService } from './emailService';

/**
 * Récupère STRICTEMENT les admins du store spécifique depuis le cache local
 */
export async function getAllStoreAdmins(storeId: string): Promise<Array<{id: string, username: string, email: string}>> {
  try {
    const db = await getDB();
    console.log('🔍 [GET-ALL-ADMINS] Recherche STRICTE admins pour store:', storeId);
    
    if (!storeId || storeId.trim() === '') {
      console.log('⚠️ [GET-ALL-ADMINS] StoreId vide, utilisation email par défaut');
      return [{
        id: 'no-store-admin',
        username: 'Admin par défaut',
        email: 'powerstartbf@gmail.com'
      }];
    }
    
    // 1. Récupérer UNIQUEMENT depuis le cache de ce store spécifique
    try {
      const cachedAdmin = await db.get('adminCache', storeId);
      console.log('🔍 [GET-ALL-ADMINS] Cache result pour store', storeId, ':', cachedAdmin ? 'trouvé' : 'vide');
      
      if (cachedAdmin && cachedAdmin.allStoreAdmins && cachedAdmin.allStoreAdmins.length > 0) {
        // Double vérification: s'assurer que tous les admins ont un email valide
        // Ne plus filtrer par storeId ici car le cache est déjà spécifique au store
        const storeSpecificAdmins = cachedAdmin.allStoreAdmins.filter((admin: any) => {
          const hasValidEmail = admin.email && admin.email.trim() !== '';
          // Si les admins sont dans allStoreAdmins de ce store, ils sont valides
          return hasValidEmail;
        });
        
        if (storeSpecificAdmins.length > 0) {
          console.log('🎯 [CACHE] Admins validés pour store', storeId, ':', storeSpecificAdmins.length);
          
          // Debug supplémentaire pour comprendre pourquoi on n'a qu'un admin
          if (storeSpecificAdmins.length === 1) {
            console.log('⚠️ [CACHE-DEBUG] Un seul admin trouvé, détails du cache:');
            console.log('- Admin trouvé:', storeSpecificAdmins[0]);
            console.log('- Tous les admins en cache:', cachedAdmin.allStoreAdmins);
          }
          
          return storeSpecificAdmins;
        }
      }
      
      // Si allStoreAdmins n'existe pas mais qu'on a un admin principal en cache pour ce store
      if (cachedAdmin && cachedAdmin.email && cachedAdmin.email.trim() !== '') {
        console.log('🎯 [CACHE] Utilisation admin principal en cache pour store:', cachedAdmin.email);
        return [{
          id: cachedAdmin.id || 'cached-admin',
          username: cachedAdmin.username || 'Admin',
          email: cachedAdmin.email
        }];
      }
    } catch (e) {
      console.log('⚠️ [CACHE] Erreur lecture cache admins pour store:', e);
    }
    
    // 2. Chercher dans tous les caches MAIS filtrer strictement par storeId
    try {
      const allCaches = await db.getAll('adminCache');
      console.log('🔍 [STORE-FILTER] Recherche dans tous les caches avec filtre store:', storeId);
      
      const storeSpecificCaches = allCaches.filter(cache => 
        cache.id === storeId || cache.storeId === storeId
      );
      
      console.log('🔍 [STORE-FILTER] Caches spécifiques au store trouvés:', storeSpecificCaches.length);
      
      for (const cache of storeSpecificCaches) {
        if (cache.allStoreAdmins && cache.allStoreAdmins.length > 0) {
          // Double filtrage: par email valide ET par storeId
          const validStoreAdmins = cache.allStoreAdmins.filter((admin: any) => {
            const hasValidEmail = admin.email && admin.email.trim() !== '';
            const isCorrectStore = !admin.storeId || admin.storeId === storeId;
            return hasValidEmail && isCorrectStore;
          });
          
          if (validStoreAdmins.length > 0) {
            console.log('🔄 [STORE-FILTER] Admins trouvés pour store:', validStoreAdmins.length);
            return validStoreAdmins;
          }
        }
        
        // Essayer l'admin principal du cache s'il correspond au store
        if (cache.email && cache.email.trim() !== '' && 
            (!cache.storeId || cache.storeId === storeId)) {
          console.log('🔄 [STORE-FILTER] Admin principal trouvé pour store:', cache.email);
          return [{
            id: cache.id || 'store-admin',
            username: cache.username || 'Admin',
            email: cache.email
          }];
        }
      }
    } catch (e) {
      console.log('⚠️ [STORE-FILTER] Erreur recherche avec filtre store:', e);
    }
    
    console.log('⚠️ [GET-ALL-ADMINS] Aucun admin spécifique au store', storeId, 'trouvé, utilisation email par défaut');
    // 3. Ultime fallback: email par défaut (pas d'envoi croisé entre stores)
    return [{
      id: 'default-admin-' + storeId,
      username: 'Admin par défaut',
      email: 'powerstartbf@gmail.com'
    }];
  } catch (error) {
    console.error('❌ [GET-ALL-ADMINS] Erreur récupération admins pour store:', storeId, error);
    // Retourner email par défaut avec identification du store
    return [{
      id: 'error-fallback-' + storeId,
      username: 'Admin par défaut',
      email: 'powerstartbf@gmail.com'
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
    console.log('🔍 [GET-ADMIN] Recherche admin pour store:', storeId);
    
    // 1. Toujours essayer de récupérer l'admin depuis le cache local d'abord
    try {
      const cachedAdmin = await db.get('adminCache', storeId);
      console.log('🔍 [GET-ADMIN] Cache result:', cachedAdmin);
      
      if (cachedAdmin && cachedAdmin.email && cachedAdmin.email.trim() !== '') {
        console.log('🎯 [CACHE] Admin trouvé en cache local:', cachedAdmin.email);
        return cachedAdmin.email;
      } else {
        console.log('⚠️ [CACHE] Cache vide ou invalide pour store:', storeId);
        
        // Debug : vérifier tout le cache
        const allCache = await db.getAll('adminCache');
        console.log('🔍 [CACHE] Tout le cache admin:', allCache);
      }
    } catch (e) {
      console.log('⚠️ [CACHE] Erreur lecture admin cache:', e);
    }
    
    // 2. Si pas trouvé en local, vérifier la connectivité avant backend
    if (!navigator.onLine) {
      console.log('📦 [ADMIN] Hors ligne, utilisation email par défaut');
      const defaultAdminEmail = 'powerstartbf@gmail.com';
      console.log('🔧 [ADMIN] Utilisation email admin par défaut (hors ligne):', defaultAdminEmail);
      return defaultAdminEmail;
    }
    
    const { backendAvailable } = await import('./backend');
    const backendUp = await backendAvailable();
    if (!backendUp) {
      console.log('📦 [ADMIN] Backend inaccessible, utilisation email par défaut');
      const defaultAdminEmail = 'powerstartbf@gmail.com';
      console.log('🔧 [ADMIN] Utilisation email admin par défaut (backend inaccessible):', defaultAdminEmail);
      return defaultAdminEmail;
    }
    
    // 3. Backend accessible, tentative de récupération
    try {
      console.log('🌐 [ADMIN] Tentative récupération admin depuis backend...');
      const usersResponse = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/users.php');
      if (usersResponse.ok) {
        const users = await usersResponse.json();
        const admin = users.find((u: any) => u.role === 'admin' && u.email && u.email.trim() !== '');
        
        if (admin && admin.email) {
          console.log('🌐 [FALLBACK] Admin récupéré depuis backend:', admin.email);
          
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
            console.log('💾 [CACHE] Admin mis en cache pour futures utilisations');
          } catch (cacheError) {
            console.warn('❌ [CACHE] Erreur mise en cache admin:', cacheError);
          }
          
          return admin.email;
        }
      }
    } catch (backendError) {
      console.error('❌ [FALLBACK] Erreur récupération admin backend:', backendError);
    }
    
    // 4. En dernier recours, utiliser email admin par défaut
    const defaultAdminEmail = 'powerstartbf@gmail.com';
    console.log('🔧 [ADMIN] Utilisation email admin par défaut:', defaultAdminEmail);
    return defaultAdminEmail;
  } catch (error) {
    console.error('❌ [ADMIN] Erreur générale récupération admin:', error);
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
      console.log('📧 [PENDING] Email mis en file d\'attente:', { type: emailData.type, email: emailData.email });
      
      return id;
    } catch (error) {
      console.error('❌ [PENDING] Erreur ajout email en attente:', error);
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
  }): Promise<{ totalAdmins: number; sent: number; queued: number; results: Array<{email: string, sent: boolean, queued: boolean, id?: string}> }> {
    console.log('📧 [SEND-ALL-ADMINS] Début envoi à tous les admins du store:', emailData.storeId);
    
    // Récupérer tous les admins du store
    const storeAdmins = await getAllStoreAdmins(emailData.storeId);
    
    if (storeAdmins.length === 0) {
      console.log('⚠️ [SEND-ALL-ADMINS] Aucun admin trouvé pour le store, utilisation email par défaut');
      // Fallback vers l'ancien système avec email par défaut
      const defaultResult = await this.sendOrQueue({
        name: 'Admin',
        email: 'powerstartbf@gmail.com',
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
          email: 'powerstartbf@gmail.com',
          sent: defaultResult.sent,
          queued: defaultResult.queued,
          id: defaultResult.id
        }]
      };
    }
    
    console.log(`📧 [SEND-ALL-ADMINS] Envoi à ${storeAdmins.length} admins:`, storeAdmins.map(a => a.email));
    
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
        
        if (result.sent) totalSent++;
        if (result.queued) totalQueued++;
        
        results.push({
          email: admin.email,
          sent: result.sent,
          queued: result.queued,
          id: result.id
        });
        
        console.log(`📧 [SEND-ALL-ADMINS] Résultat pour ${admin.email}:`, { sent: result.sent, queued: result.queued });
        
        // Délai entre les envois
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ [SEND-ALL-ADMINS] Erreur envoi à ${admin.email}:`, error);
        results.push({
          email: admin.email,
          sent: false,
          queued: false
        });
      }
    }
    
    console.log(`✅ [SEND-ALL-ADMINS] Résumé: ${totalSent} sent, ${totalQueued} queued sur ${storeAdmins.length} admins`);
    
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
  }): Promise<{ sent: boolean; queued: boolean; id?: string }> {
    console.log('🔍 [SEND-OR-QUEUE] Début envoi/queue:', { 
      type: emailData.type, 
      email: emailData.email,
      storeId: emailData.storeId,
      online: navigator.onLine 
    });
    
    // Utiliser le même système que pour les ventes/dépenses
    const { backendAvailable } = await import('./backend');
    
    // Vérifier si on est en ligne ET si le backend est accessible
    if (!navigator.onLine) {
      console.log('📦 [SEND-OR-QUEUE] Hors ligne détecté, mise en queue directe');
      const id = await this.queueEmail(emailData);
      return { sent: false, queued: true, id };
    }
    
    const backendUp = await backendAvailable();
    if (!backendUp) {
      console.log('📦 [SEND-OR-QUEUE] Backend inaccessible, mise en queue directe');
      const id = await this.queueEmail(emailData);
      return { sent: false, queued: true, id };
    }
    
    try {
      // Backend accessible, tentative d'envoi direct
      console.log('📤 [SEND-OR-QUEUE] Backend accessible, tentative envoi direct...');
      const result = await emailService.sendEmail({
        name: emailData.name,
        email: emailData.email,
        message: emailData.message,
        storeName: emailData.storeName
      });

      if (result.ok) {
        console.log('✅ [PENDING] Email envoyé directement:', { type: emailData.type, email: emailData.email });
        return { sent: true, queued: false };
      } else {
        // Échec d'envoi, mise en attente
        console.log('⚠️ [SEND-OR-QUEUE] Échec envoi, mise en queue...');
        const id = await this.queueEmail(emailData);
        console.log('📦 [PENDING] Email mis en attente après échec:', { type: emailData.type, error: result.error, id });
        return { sent: false, queued: true, id };
      }
    } catch (error) {
      // Erreur réseau, mise en attente
      console.log('❌ [SEND-OR-QUEUE] Erreur réseau, mise en queue...');
      const id = await this.queueEmail(emailData);
      console.log('📦 [PENDING] Email mis en attente après erreur réseau:', { type: emailData.type, error: error.message, id });
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
    } catch (error) {
      console.error('❌ [PENDING] Erreur récupération emails en attente:', error);
      return [];
    }
  }

  /**
   * Traite tous les emails en attente
   */
  async processPendingEmails(): Promise<{ sent: number; failed: number; total: number }> {
    try {
      const db = await getDB();
      const pendingEmails = await db.getAllFromIndex('pendingEmails', 'by-status', 'pending');
      
      console.log(`📧 [PENDING] Traitement de ${pendingEmails.length} emails en attente...`);
      
      let sent = 0;
      let failed = 0;

      for (const email of pendingEmails) {
        try {
          // Limiter les tentatives
          if (email.attempts >= 3) {
            console.log('⚠️ [PENDING] Email abandonné après 3 tentatives:', email.type);
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
            console.log('✅ [PENDING] Email envoyé et supprimé:', { type: email.type, email: email.email });
          } else {
            await this.incrementAttempts(email.id, result.error);
            failed++;
            console.log('❌ [PENDING] Échec envoi:', { type: email.type, error: result.error });
          }
        } catch (error) {
          await this.incrementAttempts(email.id, error.message);
          failed++;
          console.log('❌ [PENDING] Erreur envoi:', { type: email.type, error: error.message });
        }

        // Délai entre les envois pour éviter le spam
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`📊 [PENDING] Résultats: ${sent} envoyés, ${failed} échoués sur ${pendingEmails.length} total`);
      
      return { sent, failed, total: pendingEmails.length };
    } catch (error) {
      console.error('❌ [PENDING] Erreur traitement emails en attente:', error);
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
    } catch (error) {
      console.error('❌ [PENDING] Erreur marquage email échoué:', error);
    }
  }

  /**
   * Supprime définitivement un email (utilisé pour les emails envoyés avec succès)
   */
  private async deleteEmail(emailId: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete('pendingEmails', emailId);
      console.log('🗑️ [PENDING] Email supprimé après envoi réussi:', emailId);
    } catch (error) {
      console.error('❌ [PENDING] Erreur suppression email:', error);
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
        if (error) email.error = error;
        await db.put('pendingEmails', email);
      }
    } catch (error) {
      console.error('❌ [PENDING] Erreur incrémentation tentatives:', error);
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
          console.log('🗑️ [CLEANUP] Email failed ancien supprimé:', { id: email.id, type: email.type, lastAttempt: new Date(email.lastAttempt).toLocaleString() });
        }
      }

      if (cleaned > 0) {
        console.log(`🧹 [PENDING] ${cleaned} emails 'failed' anciens nettoyés`);
      }

      return cleaned;
    } catch (error) {
      console.error('❌ [PENDING] Erreur nettoyage emails:', error);
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
    } catch (error) {
      console.error('❌ [PENDING] Erreur récupération stats:', error);
      return { pending: 0, sent: 0, failed: 0, total: 0 };
    }
  }
}

export const pendingEmailService = new PendingEmailService();