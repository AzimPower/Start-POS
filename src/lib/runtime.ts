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

export function getRuntimeLabel() {
  if (isDesktopApp()) {
    return window.__START_POS_DESKTOP__?.runtime || 'desktop';
  }

  return 'web';
}
