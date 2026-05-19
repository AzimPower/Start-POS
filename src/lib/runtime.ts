declare global {
  interface Window {
    __START_POS_DESKTOP__?: {
      isDesktop?: boolean;
      runtime?: string;
    };
  }
}

export function isDesktopApp() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.__START_POS_DESKTOP__?.isDesktop === true;
}

export function isNativeApp() {
  if (typeof window === 'undefined') {
    return false;
  }

  if (isDesktopApp()) {
    return true;
  }

  return !!(window as any).Capacitor;
}

export function getRuntimeLabel() {
  if (isDesktopApp()) {
    return window.__START_POS_DESKTOP__?.runtime || 'desktop';
  }

  return 'web';
}
