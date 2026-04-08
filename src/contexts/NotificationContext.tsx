import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppNotification, fetchInboxNotifications, markNotificationRead } from '@/lib/notifications';
import { onConnectionStateChange } from '@/lib/sync';
interface NotificationContextType {
    notifications: AppNotification[];
    unreadCount: number;
    isLoading: boolean;
    refresh: () => Promise<void>;
    markAsRead: (notificationId: string) => Promise<void>;
}
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
export function NotificationProvider({ children }: {
    children: React.ReactNode;
}) {
    const { user, isLoading: isAuthLoading } = useAuth();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const storeIdsKey = (user?.storeIds || []).join('|');
    const refresh = async () => {
        if (!user) {
            setNotifications([]);
            return;
        }
        setIsLoading(true);
        try {
            const items = await fetchInboxNotifications({
                id: user.id,
                role: user.role,
                storeId: user.storeId,
                storeIds: user.storeIds,
            });
            setNotifications(items);
        }
        catch (error) {
        }
        finally {
            setIsLoading(false);
        }
    };
    const markAsRead = async (notificationId: string) => {
        if (!user) {
            return;
        }
        setNotifications((current) => current.map((notification) => notification.id === notificationId
            ? { ...notification, isRead: true, readAt: notification.readAt || Date.now() }
            : notification));
        try {
            await markNotificationRead(user.id, notificationId);
        }
        catch (error) {
            await refresh();
        }
    };
    useEffect(() => {
        let disposed = false;
        if (isAuthLoading) {
            return;
        }
        if (!user) {
            setNotifications([]);
            setIsLoading(false);
            return;
        }
        const loadNotifications = async () => {
            try {
                const items = await fetchInboxNotifications({
                    id: user.id,
                    role: user.role,
                    storeId: user.storeId,
                    storeIds: user.storeIds,
                });
                if (!disposed) {
                    setNotifications(items);
                }
            }
            catch (error) {
                if (!disposed) {
                }
            }
            finally {
                if (!disposed) {
                    setIsLoading(false);
                }
            }
        };
        setIsLoading(true);
        void loadNotifications();
        const intervalId = window.setInterval(() => {
            void loadNotifications();
        }, 45000);
        return () => {
            disposed = true;
            window.clearInterval(intervalId);
        };
    }, [user?.id, user?.role, user?.storeId, storeIdsKey, isAuthLoading]);
    useEffect(() => {
        if (!user || isAuthLoading) {
            return;
        }
        const unsubscribe = onConnectionStateChange((state) => {
            if (!state.isOnline || state.isSyncing) {
                return;
            }
            void refresh();
        });
        return unsubscribe;
    }, [user?.id, user?.role, user?.storeId, storeIdsKey, isAuthLoading]);
    const unreadCount = notifications.filter((notification) => !notification.isRead).length;
    return (<NotificationContext.Provider value={{
            notifications,
            unreadCount,
            isLoading,
            refresh,
            markAsRead,
        }}>
      {children}
    </NotificationContext.Provider>);
}
export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within NotificationProvider');
    }
    return context;
}
