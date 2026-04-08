import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/contexts/NotificationContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatNotificationTimestamp, getNotificationBadgeClassName, getNotificationTypeLabel, } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
interface NotificationBellProps {
    align?: 'start' | 'center' | 'end';
    buttonClassName?: string;
    iconClassName?: string;
}
export default function NotificationBell({ align = 'end', buttonClassName, iconClassName, }: NotificationBellProps) {
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const [open, setOpen] = useState(false);
    const { notifications, unreadCount, isLoading, markAsRead } = useNotifications();
    const previewNotifications = notifications.slice(0, 6);
    const unreadLabel = unreadCount > 0 ? `${unreadCount} non lue(s)` : 'Aucune notification non lue';
    const openNotificationCenter = () => {
        setOpen(false);
        navigate('/notifications');
    };
    const handleNotificationClick = async (notificationId: string, isRead: boolean) => {
        if (!isRead) {
            await markAsRead(notificationId);
        }
        setOpen(false);
        navigate('/notifications');
    };
    const triggerButton = (<Button variant="ghost" className={buttonClassName} aria-label="Notifications">
      <span className="relative inline-flex items-center justify-center">
        <Bell className={iconClassName}/>
        {unreadCount > 0 && (<span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[17px] items-center justify-center rounded-full bg-rose-500 px-1 py-0.5 text-[9.5px] font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>)}
      </span>
    </Button>);
    const notificationItems = previewNotifications.map((notification) => (<button key={notification.id} type="button" onClick={() => void handleNotificationClick(notification.id, notification.isRead)} className={cn('w-full rounded-2xl border text-left transition-all duration-200', isMobile
            ? 'mb-3 px-4 py-4 shadow-sm last:mb-0'
            : 'mb-2 px-3 py-3 last:mb-0', notification.isRead
            ? 'border-border bg-background hover:bg-muted/50'
            : 'border-blue-200 bg-blue-50/70 shadow-blue-100/60 hover:border-blue-300 hover:bg-blue-100/80')}>
        <div className={cn('mb-2 flex gap-2', isMobile ? 'flex-wrap items-start justify-between' : 'items-center justify-between')}>
          <span className={cn('inline-flex rounded-full border font-semibold', getNotificationBadgeClassName(notification.type), isMobile ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[11px]')}>
            {getNotificationTypeLabel(notification.type)}
          </span>
          <span className={cn('text-muted-foreground', isMobile ? 'text-[11px]' : 'text-[11px]')}>
            {formatNotificationTimestamp(notification.createdAt)}
          </span>
        </div>
        <p className={cn('break-words font-semibold text-foreground', isMobile ? 'text-sm leading-5' : 'text-sm')}>
          {notification.title}
        </p>
        <p className={cn('mt-1 break-words whitespace-pre-line text-muted-foreground', isMobile ? 'line-clamp-3 text-[13px] leading-5' : 'line-clamp-2 text-xs')}>
          {notification.message}
        </p>
        {!notification.isRead && isMobile && <span className="mt-3 inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-1 text-[11px] font-medium text-blue-700">Nouveau</span>}
      </button>));
    if (isMobile) {
        return (<Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          {triggerButton}
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh] rounded-t-[28px] border-none bg-gradient-to-b from-white via-slate-50 to-slate-100 px-0 pb-4">
          <DrawerHeader className="px-4 pb-3 pt-1 text-left">
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-4 py-4 text-white shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DrawerTitle className="text-base font-semibold text-white">Notifications</DrawerTitle>
                  <DrawerDescription className="mt-1 text-xs text-slate-300">
                    {unreadLabel}
                  </DrawerDescription>
                </div>
                <span className="inline-flex min-w-[40px] items-center justify-center rounded-2xl bg-white/14 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </div>
            </div>
          </DrawerHeader>
          <div className="px-4">
            <div className="rounded-[26px] border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur">
              <ScrollArea className="max-h-[52vh] pr-1">
                <div className="pr-1">
                  {isLoading && previewNotifications.length === 0 ? (<div className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Chargement des notifications...
                    </div>) : previewNotifications.length === 0 ? (<div className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Aucune notification pour le moment.
                    </div>) : notificationItems}
                </div>
              </ScrollArea>
            </div>
            <Button type="button" onClick={openNotificationCenter} className="mt-4 h-12 w-full rounded-2xl bg-slate-900 text-sm font-medium text-white hover:bg-slate-800">
              Ouvrir le centre de notifications
            </Button>
          </div>
        </DrawerContent>
      </Drawer>);
    }
    return (<DropdownMenu>
      <DropdownMenuTrigger asChild>
        {triggerButton}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
            <p className="text-xs text-muted-foreground">{unreadLabel}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-80">
          <div className="p-2">
            {isLoading && previewNotifications.length === 0 ? (<div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Chargement des notifications...
              </div>) : previewNotifications.length === 0 ? (<div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Aucune notification pour le moment.
              </div>) : notificationItems}
          </div>
        </ScrollArea>
        <DropdownMenuSeparator />
        <div className="p-2">
          <DropdownMenuItem onSelect={openNotificationCenter} className="justify-center font-medium">
            Ouvrir le centre de notifications
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>);
}
