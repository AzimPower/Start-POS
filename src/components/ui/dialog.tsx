import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Keep a tiny global registry so the PIN overlay can dismiss open dialogs once
// it is mounted. This centralizes dialog teardown in one place instead of
// mutating dialog state from multiple unrelated effects.
const REGISTRY_KEY = '__radix_dialog_registry_v1';
if (typeof window !== 'undefined' && !(window as any)[REGISTRY_KEY]) {
    (window as any)[REGISTRY_KEY] = new Set<any>();
}
const Dialog = (props: React.ComponentProps<typeof DialogPrimitive.Root>) => {
    const { open: openProp, defaultOpen, onOpenChange, ...rest } = props as any;
    const computeInitial = () => {
        if (typeof openProp !== 'undefined')
            return !!openProp;
        if (typeof defaultOpen !== 'undefined')
            return !!defaultOpen;
        return false;
    };
    const [openState, setOpenState] = React.useState<boolean>(computeInitial);
    const onOpenChangeRef = React.useRef(onOpenChange);

    React.useEffect(() => {
        onOpenChangeRef.current = onOpenChange;
    }, [onOpenChange]);

    React.useEffect(() => {
        if (typeof openProp === 'undefined')
            return;
        setOpenState(!!openProp);
    }, [openProp]);

    React.useEffect(() => {
        const entry = { forceClose: () => {
                setOpenState(false);
                try {
                    if (typeof onOpenChangeRef.current === 'function')
                        onOpenChangeRef.current(false);
                }
                catch (e) { }
            } };
        try {
            if (typeof window !== 'undefined')
                (window as any)[REGISTRY_KEY].add(entry);
        }
        catch (e) { }
        return () => {
            try {
                if (typeof window !== 'undefined')
                    (window as any)[REGISTRY_KEY].delete(entry);
            }
            catch (e) { }
        };
    }, []);

    const handleOpenChange = (nextOpen: boolean) => {
        setOpenState(nextOpen);
        if (typeof onOpenChange === 'function')
            onOpenChange(nextOpen);
    };

    return <DialogPrimitive.Root open={openState} onOpenChange={handleOpenChange} {...(rest as any)}/>;
};
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;
const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({ className, ...props }, ref) => {
    // If PIN overlay is active, make the dialog overlay non-interactive so
    // clicks pass through to the PIN overlay instead of closing the dialog.
    const pinActive = typeof document !== 'undefined' && document.body.getAttribute('data-pin-active') === 'true';
    return (<DialogPrimitive.Overlay ref={ref} className={cn(
        // add a stable class name so we can target it from global CSS when pin is active
        "radix-dialog-overlay fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)} 
    // When PIN is active we must not intercept pointer events; prefer CSS-based handling
    // so changes to the body attribute (set in a useEffect) immediately take effect.
    {...props}/>);
});
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(({ className, children, ...props }, ref) => {
    // Helper to detect whether PIN overlay is active
    const pinActive = () => typeof document !== 'undefined' && document.body.getAttribute('data-pin-active') === 'true';
    // Intercept outside pointer down to prevent dialog closing when PIN overlay is active
    const handlePointerDownOutside: any = (event: any) => {
        if (pinActive()) {
            // Don't close the dialog when PIN overlay is active.
            // IMPORTANT: do not call preventDefault/stopPropagation here,
            // otherwise the click won't reach the PIN overlay. Let the
            // event continue so the PIN receives it.
            return;
        }
        if (typeof (props as any).onPointerDownOutside === 'function')
            (props as any).onPointerDownOutside(event);
    };
    const handleEscapeKeyDown: any = (event: any) => {
        if (pinActive()) {
            // Ignore Escape closing while PIN overlay is active, but don't stop
            // propagation so PIN key handlers can still run.
            return;
        }
        if (typeof (props as any).onEscapeKeyDown === 'function')
            (props as any).onEscapeKeyDown(event);
    };
    return (<DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content ref={ref} className={cn(
        // Centrage responsive : marges sur mobile, centrage absolu sur desktop
        "fixed z-50 grid w-auto min-w-[90vw] sm:min-w-[400px] max-w-2xl gap-4 border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg p-4 sm:p-6 left-4 right-4 top-1/2 sm:left-1/2 sm:translate-x-[-50%] translate-y-[-50%] overflow-hidden", className)} onPointerDownOutside={handlePointerDownOutside} onEscapeKeyDown={handleEscapeKeyDown} {...props}>
        {/* Provide a visually-hidden title so screen readers always have a DialogTitle (Radix requirement). */}
        <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
        <div className="max-h-[80vh] overflow-y-auto">
          {children}
        </div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4"/>
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>);
});
DialogContent.displayName = DialogPrimitive.Content.displayName;
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
// Add extra bottom margin and slightly larger spacing so the title breathes above the content
<div className={cn("flex flex-col space-y-2 text-center sm:text-left mb-4", className)} {...props}/>);
DialogHeader.displayName = "DialogHeader";
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (<div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props}/>);
DialogFooter.displayName = "DialogFooter";
const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(({ className, ...props }, ref) => (<DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props}/>));
DialogTitle.displayName = DialogPrimitive.Title.displayName;
const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(({ className, ...props }, ref) => (<DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props}/>));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, };
