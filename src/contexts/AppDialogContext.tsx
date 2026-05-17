import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type DialogIntent = 'default' | 'destructive';

type DialogRequest = {
    title?: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    intent?: DialogIntent;
    kind: 'confirm' | 'alert';
};

type AppDialogContextValue = {
    confirm: (request: string | Omit<DialogRequest, 'kind'>) => Promise<boolean>;
    alert: (request: string | Omit<DialogRequest, 'kind'>) => Promise<void>;
};

const AppDialogContext = createContext<AppDialogContextValue | undefined>(undefined);
const fallbackConfirm = (request: string | Omit<DialogRequest, 'kind'>) =>
    Promise.resolve(window.confirm(typeof request === 'string' ? request : request.description));
const fallbackAlert = (request: string | Omit<DialogRequest, 'kind'>) => {
    window.alert(typeof request === 'string' ? request : request.description);
    return Promise.resolve();
};
const dialogApi: AppDialogContextValue = {
    confirm: fallbackConfirm,
    alert: fallbackAlert,
};

function normalizeRequest(
    request: string | Omit<DialogRequest, 'kind'>,
    kind: 'confirm' | 'alert',
): DialogRequest {
    if (typeof request === 'string') {
        return {
            kind,
            title: 'START POS',
            description: request,
            confirmLabel: kind === 'confirm' ? 'Confirmer' : 'OK',
            cancelLabel: 'Annuler',
            intent: 'default',
        };
    }

    return {
        kind,
        title: request.title || 'START POS',
        description: request.description,
        confirmLabel: request.confirmLabel || (kind === 'confirm' ? 'Confirmer' : 'OK'),
        cancelLabel: request.cancelLabel || 'Annuler',
        intent: request.intent || 'default',
    };
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
    const [dialog, setDialog] = useState<DialogRequest | null>(null);
    const resolverRef = useRef<((value: boolean) => void) | null>(null);

    const closeDialog = useCallback((value: boolean) => {
        const resolver = resolverRef.current;
        resolverRef.current = null;
        setDialog(null);
        resolver?.(value);
    }, []);

    const confirm = useCallback((request: string | Omit<DialogRequest, 'kind'>) => {
        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
            setDialog(normalizeRequest(request, 'confirm'));
        });
    }, []);

    const alert = useCallback((request: string | Omit<DialogRequest, 'kind'>) => {
        return new Promise<void>((resolve) => {
            resolverRef.current = () => resolve();
            setDialog(normalizeRequest(request, 'alert'));
        });
    }, []);

    const value = useMemo(() => ({ confirm, alert }), [alert, confirm]);
    dialogApi.confirm = confirm;
    dialogApi.alert = alert;

    return (
        <AppDialogContext.Provider value={value}>
            {children}
            <AlertDialog
                open={!!dialog}
                onOpenChange={(open) => {
                    if (!open) {
                        closeDialog(false);
                    }
                }}
            >
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{dialog?.title || 'START POS'}</AlertDialogTitle>
                        <AlertDialogDescription>{dialog?.description || ''}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        {dialog?.kind === 'confirm' ? (
                            <AlertDialogCancel onClick={() => closeDialog(false)}>
                                {dialog.cancelLabel}
                            </AlertDialogCancel>
                        ) : null}
                        <AlertDialogAction
                            className={dialog?.intent === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
                            onClick={() => closeDialog(true)}
                        >
                            {dialog?.confirmLabel || 'OK'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppDialogContext.Provider>
    );
}

export function useAppDialog() {
    const context = useContext(AppDialogContext);
    if (!context) {
        throw new Error('useAppDialog must be used within an AppDialogProvider');
    }
    return context;
}

export function showAppConfirm(request: string | Omit<DialogRequest, 'kind'>) {
    return dialogApi.confirm(request);
}

export function showAppAlert(request: string | Omit<DialogRequest, 'kind'>) {
    return dialogApi.alert(request);
}
