import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.startpos.app',     
  appName: 'START POS',
  webDir: 'dist',
  server: {
    allowNavigation: [
      'https://start-pos.com'
    ]
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;