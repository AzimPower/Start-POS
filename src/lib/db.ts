import { connectionState, queueSyncOp } from './sync';
import { backendAvailable } from './backend';
/**
 * Effectue une opération synchronisable :
 * - Si en ligne, fait l’appel API backend
 * - Si hors-ligne, ajoute à la file d’attente pour synchronisation
 * @param op { url, method, data }
 */
export async function performSyncOp(op: { url: string; method?: string; data?: any }) {
  // Ensure backend is reachable before attempting a direct call.
  if (connectionState.isOnline) {
    const backendUp = await backendAvailable().catch(() => false);
    if (!backendUp) {
      // Internet may be present but API is unreachable — queue operation instead
      await queueSyncOp(op);
      return { success: false, queued: true, reason: 'backend_unreachable' };
    }
    try {
      const res = await fetch(op.url, {
        method: op.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op.data),
      });
      if (res.ok) {
        return { success: true, status: res.status, data: await res.json() };
      } else {
        // Si erreur serveur, on met en attente
        await queueSyncOp(op);
        return { success: false, status: res.status, queued: true };
      }
    } catch (e) {
      // Erreur réseau, on met en attente
      await queueSyncOp(op);
      return { success: false, error: e, queued: true };
    }
  } else {
    // Hors-ligne, on met en attente
    await queueSyncOp(op);
    return { success: false, queued: true };
  }
}
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Define the database schema
interface POSDB extends DBSchema {
  hiddenCategories: {
    key: string;
    value: {
      id: string;
      categoryId: string;
      storeId: string;
    };
    indexes: { 'by-category': string; 'by-store': string };
  };
  emailSettings: {
    key: string;
    value: {
      id: string;
      storeId: string;
      shifts: boolean;
      stockSignals: boolean;
      expenses: boolean;
      logins: boolean;
      refunds: boolean;
      updatedAt: number;
    };
    indexes: { 'by-store': string };
  };
  users: {
    key: string;
    value: {
      id: string;
      username: string;
      phone: string; // Téléphone unique pour la connexion
      email?: string; // Email optionnel
      password: string;
      role: 'super_admin' | 'admin' | 'cashier' | 'manager';
      storeId: string;
      storeIds?: string[]; // support multi-magasin (mapping user_stores)
      active?: boolean;
      createdAt: number;
    };
    indexes: { 'by-username': string; 'by-phone': string; 'by-email': string };
  };
  userStores: {
    key: string;
    value: {
      id: string;
      userId: string;
      storeId: string;
    };
    indexes: { 'by-user': string; 'by-store': string };
  };
  stores: {
    key: string;
    value: {
      id: string;
      name: string;
      address: string;
      trackIndirectExpenses?: boolean;
      active?: boolean;
      createdAt: number;
      subscriptionStart?: number;
      subscriptionEnd?: number;
      lastPayment?: number;
    };
    indexes: {};
  };
  categories: {
    key: string;
    value: {
      id: string;
      name: string;
      description: string;
      createdAt: number;
      storeId: string;
    };
  };
  products: {
    key: string;
    value: {
      id: string;
      name: string;
      sku: string;
      categoryId?: string;
      salePrice?: number;
      costPrice?: number;
      unit: string;
      taxRate?: number;
      stock: { [storeId: string]: number };
      minStock?: number;
      imageUrl?: string;
      createdAt: number;
      updatedAt: number;
    };
    indexes: { 'by-sku': string; 'by-category': string };
  };
  customers: {
    key: string;
    value: {
      id: string;
      name: string;
      phone: string;
      email: string;
      address: string;
      notes: string;
      balance: number;
      createdAt: number;
      storeId: string;
    };
    indexes: { 'by-phone': string };
  };
  shifts: {
    key: string;
    value: {
      id: string;
      userId: string;
      storeId: string;
      openingAmount: number;
      closingAmount: number | null;
      expectedAmount: number | null;
      difference: number | null;
      openedAt: number;
      closedAt: number | null;
      status: 'open' | 'closed';
    };
    indexes: { 'by-user': string; 'by-store': string; 'by-status': string };
  };
  sales: {
    key: string;
    value: {
      id: string;
      shiftId: string;
      userId: string;
      storeId: string;
      customerId: string | null;
      items: Array<{
        productId: string;
        name: string;
        quantity: number;
        price: number;
        tax: number;
        total: number;
      }>;
      subtotal: number;
      tax: number;
      total: number;
      paymentMethod: 'cash' | 'mobile_money' | 'mixed';
      cashAmount?: number; // Montant payé en espèces
      mobileMoneyAmount?: number; // Montant payé via mobile money
      otherAmount?: number; // Autres montants (carte, chèque, etc.)
      payments: Array<{
        method: 'cash' | 'mobile_money';
        amount: number;
      }>;
      createdAt: number;
      refunded?: boolean;
      refundedAt?: number;
      draft?: boolean; // Ajout du statut brouillon
      completedAt?: number; // Date de validation
    };
    indexes: { 'by-shift': string; 'by-user': string; 'by-store': string; 'by-customer': string };
  };
  expenses: {
    key: string;
    value: {
      id: string;
      shiftId: string | null;
      userId: string;
      storeId: string;
      category: string;
      amount: number;
      description: string;
      createdAt: number;
    };
    indexes: { 'by-shift': string; 'by-user': string; 'by-store': string };
  };
  expensesAdvanced: {
    key: string;
    value: {
      id: string;
      type: 'direct' | 'indirect' | 'operational';
      name: string;
      amount: number;
      description?: string;
      date: number;
      userId: string;
      storeId: string;
      status: 'pending' | 'approved' | 'rejected';
      
      // Pour dépenses directes
      directProduct?: {
        productId: string;
        quantity: number;
        startDate: number;
        endDate?: number;
      };
      
      // Pour dépenses indirectes et opérationnelles
      categoryId?: string;
      
      createdAt: number;
      updatedAt: number;
    };
    indexes: { 'by-store': string; 'by-user': string; 'by-type': string };
  };
  stockSignals: {
    key: string;
    value: {
      id: string;
      expenseId: string; // Lié à une dépense directe
      productId: string;
      userId: string;
      storeId: string;
      startDate: number;
      endDate: number;
      purchaseAmount: number;
      quantityBought: number;
      quantitySold: number;
      revenue: number;
      margin: number;
      marginPercentage: number;
      createdAt: number;
    };
    indexes: { 'by-store': string; 'by-user': string; 'by-product': string; 'by-expense': string };
  };
  expenseCategories: {
    key: string;
    value: {
      id: string;
      name: string;
      type: 'indirect' | 'operational';
      description?: string;
      storeId: string;
      active: boolean;
      productIds?: string[]; // Produits liés à cette catégorie
      createdAt: number;
    };
    indexes: { 'by-store': string; 'by-type': string };
  };
  syncQueue: {
    key: string;
    value: {
      id: string;
      operation: 'create' | 'update' | 'delete';
      table: string;
      data: any;
      url: string;
      method?: string;
      createdAt: number;
      attempts: number;
      lastError?: string;
    };
    indexes: { 'by-table': string; 'by-operation': string };
  };
  pendingEmails: {
    key: string;
    value: {
      id: string;
      name: string;
      email: string;
      message: string;
      storeName: string;
      type: 'expense' | 'receipt' | 'shift' | 'stock' | 'refund';
      relatedId?: string; // ID de la dépense, vente, shift, etc.
      storeId: string;
      userId: string;
      createdAt: number;
      attempts: number;
      lastAttempt?: number;
      status: 'pending' | 'sent' | 'failed';
      error?: string;
    };
    indexes: { 'by-store': string; 'by-user': string; 'by-type': string; 'by-status': string };
  };
  adminCache: {
    key: string;
    value: {
      id: string;
      username: string;
      email: string;
      role: string;
      storeId?: string;
      cachedAt: number;
      isFallback?: boolean;
      allStoreAdmins?: Array<{
        id: string;
        username: string;
        email: string;
      }>;
    };
  };
  syncLogs: {
    key: string;
    value: {
      id: string;
      level: 'info' | 'warn' | 'error';
      message: string;
      entity?: string;
      details?: any;
      createdAt: number;
    };
    indexes: { 'by-entity': string; 'by-level': string };
  };
}

let dbInstance: IDBPDatabase<POSDB> | null = null;

export async function getDB() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<POSDB>('pos-db', 14, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Users store
      if (!db.objectStoreNames.contains('users')) {
        const userStore = db.createObjectStore('users', { keyPath: 'id' });
        userStore.createIndex('by-username', 'username', { unique: true });
        userStore.createIndex('by-phone', 'phone', { unique: true });
        userStore.createIndex('by-email', 'email', { unique: false });
      } else if (oldVersion < 3) {
        const userStore = transaction.objectStore('users');

        if (!userStore.indexNames.contains('by-phone')) {
          userStore.createIndex('by-phone', 'phone', { unique: true });
        }
      } else if (oldVersion < 9) {
        const userStore = transaction.objectStore('users');

        if (!userStore.indexNames.contains('by-email')) {
          userStore.createIndex('by-email', 'email', { unique: false });
        }
      }

      // Stores
      if (!db.objectStoreNames.contains('stores')) {
        const storeStore = db.createObjectStore('stores', { keyPath: 'id' });
      } else if (oldVersion < 2) {
        const storeStore = transaction.objectStore('stores');

      }

      // Categories
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }

      // Products
      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('by-sku', 'sku', { unique: true });
        productStore.createIndex('by-category', 'categoryId');
      }

      // Customers
      if (!db.objectStoreNames.contains('customers')) {
        const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
        customerStore.createIndex('by-phone', 'phone');
      }

      // Shifts
      if (!db.objectStoreNames.contains('shifts')) {
        const shiftStore = db.createObjectStore('shifts', { keyPath: 'id' });
        shiftStore.createIndex('by-user', 'userId');
        shiftStore.createIndex('by-store', 'storeId');
        shiftStore.createIndex('by-status', 'status');
      }

      // Sales
      if (!db.objectStoreNames.contains('sales')) {
        const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
        salesStore.createIndex('by-shift', 'shiftId');
        salesStore.createIndex('by-user', 'userId');
        salesStore.createIndex('by-store', 'storeId');
        salesStore.createIndex('by-customer', 'customerId');
      }

      // Expenses
      if (!db.objectStoreNames.contains('expenses')) {
        const expenseStore = db.createObjectStore('expenses', { keyPath: 'id' });
        expenseStore.createIndex('by-shift', 'shiftId');
        expenseStore.createIndex('by-user', 'userId');
        expenseStore.createIndex('by-store', 'storeId');
      }

      // Advanced Expenses (new)
      if (!db.objectStoreNames.contains('expensesAdvanced')) {
        const expenseAdvStore = db.createObjectStore('expensesAdvanced', { keyPath: 'id' });
        expenseAdvStore.createIndex('by-store', 'storeId');
        expenseAdvStore.createIndex('by-user', 'userId');
        expenseAdvStore.createIndex('by-type', 'type');
      }

      // Stock Signals (new)
      if (!db.objectStoreNames.contains('stockSignals')) {
        const stockSignalStore = db.createObjectStore('stockSignals', { keyPath: 'id' });
        stockSignalStore.createIndex('by-store', 'storeId');
        stockSignalStore.createIndex('by-user', 'userId');
        stockSignalStore.createIndex('by-product', 'productId');
        stockSignalStore.createIndex('by-expense', 'expenseId');
      }

      // Expense Categories (new)
      if (!db.objectStoreNames.contains('expenseCategories')) {
        const expenseCategoryStore = db.createObjectStore('expenseCategories', { keyPath: 'id' });
        expenseCategoryStore.createIndex('by-store', 'storeId');
        expenseCategoryStore.createIndex('by-type', 'type');
      }

      // Hidden Categories (pour masquer les catégories par défaut dans un magasin)
      if (!db.objectStoreNames.contains('hiddenCategories')) {
        const hiddenCatStore = db.createObjectStore('hiddenCategories', { keyPath: 'id' });
        hiddenCatStore.createIndex('by-category', 'categoryId');
        hiddenCatStore.createIndex('by-store', 'storeId');
      }

      // Sync Queue (pour les opérations hors-ligne)
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncQueueStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        syncQueueStore.createIndex('by-table', 'table');
        syncQueueStore.createIndex('by-operation', 'operation');
      }
      // Sync Logs (historique des synchronisations)
      if (!db.objectStoreNames.contains('syncLogs')) {
        const syncLogsStore = db.createObjectStore('syncLogs', { keyPath: 'id' });
        syncLogsStore.createIndex('by-entity', 'entity');
        syncLogsStore.createIndex('by-level', 'level');
      }
      // userStores mapping (many-to-many user <-> stores)
      if (!db.objectStoreNames.contains('userStores')) {
        const us = db.createObjectStore('userStores', { keyPath: 'id' });
        us.createIndex('by-user', 'userId');
        us.createIndex('by-store', 'storeId');
      }

      // Email Settings (per store configuration)
      if (!db.objectStoreNames.contains('emailSettings')) {
        const emailSettingsStore = db.createObjectStore('emailSettings', { keyPath: 'id' });
        emailSettingsStore.createIndex('by-store', 'storeId');
      }

      // Pending Emails (emails en attente d'envoi)
      if (!db.objectStoreNames.contains('pendingEmails')) {
        const pendingEmailsStore = db.createObjectStore('pendingEmails', { keyPath: 'id' });
        pendingEmailsStore.createIndex('by-store', 'storeId');
        pendingEmailsStore.createIndex('by-user', 'userId');
        pendingEmailsStore.createIndex('by-type', 'type');
        pendingEmailsStore.createIndex('by-status', 'status');
      }
      
      // Admin cache store (version 14)
      if (!db.objectStoreNames.contains('adminCache')) {
        db.createObjectStore('adminCache', { keyPath: 'id' });
      }
    },
  });

  // Migrate existing single-store users into userStores mappings (non-destructive)
  try {
    const userStoresCount = await dbInstance.count('userStores');
    if (userStoresCount === 0) {
      const allUsers = await dbInstance.getAll('users');
      for (const u of allUsers) {
        if (u.storeId) {
          const id = crypto.randomUUID();
          try {
            await dbInstance.add('userStores', { id, userId: u.id, storeId: u.storeId });
          } catch (e) {
            // ignore duplicates
          }
        }
      }
    }
  } catch (e) {
    console.warn('userStores migration error', e);
  }

  // Initialize with default data if needed
  await initializeDefaultData(dbInstance);

  return dbInstance;
}

async function initializeDefaultData(db: IDBPDatabase<POSDB>) {
  const usersCount = await db.count('users');
  
  if (usersCount === 0) {
    // Create super admin
    await db.add('users', {
      id: crypto.randomUUID(),
      username: 'superadmin',
      phone: '+22600000000', // Téléphone par défaut pour super admin
      email: 'superadmin@example.com',
      password: 'super123',
      role: 'super_admin',
      storeId: '',
      active: true,
      createdAt: Date.now(),
    });

    // Create default store
    const now = Date.now();
    const defaultStore = {
      id: crypto.randomUUID(),
      name: 'Magasin Principal',
      address: '',
      active: true,
      createdAt: now,
      subscriptionStart: now,
      subscriptionEnd: now + (30 * 24 * 60 * 60 * 1000), // 30 jours
      lastPayment: now,
    };
    await db.add('stores', defaultStore);

    // Create default admin user
    await db.add('users', {
      id: crypto.randomUUID(),
      username: 'admin',
      phone: '1111111111', // Téléphone par défaut pour admin
      email: 'admin@example.com',
      password: 'admin123',
      role: 'admin',
      storeId: defaultStore.id,
      active: true,
      createdAt: Date.now(),
    });

    // Create default customers
    const defaultCustomers = [
      { id: crypto.randomUUID(), name: 'Client Test', phone: '0000000000', email: '', address: '', notes: '', balance: 0, createdAt: Date.now(), storeId: defaultStore.id },
    ];
    for (const customer of defaultCustomers) {
      await db.add('customers', customer);
    }

    // Create sample categories
    const categories = [
      { id: crypto.randomUUID(), name: 'Boissons', description: 'Boissons diverses', createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Alimentation', description: 'Produits alimentaires', createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Hygiène', description: 'Produits d\'hygiène', createdAt: Date.now() },
    ];
    
    for (const category of categories) {
      await db.add('categories', { ...category, storeId: defaultStore.id });
    }

    // Create default expense categories
    const expenseCategories = [
      // Indirect expenses (liées à plusieurs produits)
      { id: crypto.randomUUID(), name: 'Huile de cuisson', type: 'indirect' as const, description: 'Pour friture et cuisson', storeId: defaultStore.id, active: true, createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Gaz', type: 'indirect' as const, description: 'Bouteille de gaz', storeId: defaultStore.id, active: true, createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Condiments', type: 'indirect' as const, description: 'Épices, sel, cube, etc.', storeId: defaultStore.id, active: true, createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Emballages', type: 'indirect' as const, description: 'Sachets, boîtes, papier', storeId: defaultStore.id, active: true, createdAt: Date.now() },
      
      // Operational expenses
      { id: crypto.randomUUID(), name: 'Électricité', type: 'operational' as const, description: 'Facture électricité', storeId: defaultStore.id, active: true, createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Loyer', type: 'operational' as const, description: 'Loyer du local', storeId: defaultStore.id, active: true, createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Salaires', type: 'operational' as const, description: 'Salaires employés', storeId: defaultStore.id, active: true, createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Transport', type: 'operational' as const, description: 'Frais de transport', storeId: defaultStore.id, active: true, createdAt: Date.now() },
      { id: crypto.randomUUID(), name: 'Maintenance', type: 'operational' as const, description: 'Réparations et maintenance', storeId: defaultStore.id, active: true, createdAt: Date.now() },
    ];
    
    for (const expenseCategory of expenseCategories) {
      await db.add('expenseCategories', expenseCategory);
    }
  }
}

export function generateId() {
  return crypto.randomUUID();
}
