import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.startpos.app',     
  appName: 'START POS',
  webDir: 'dist',
  server: {
    allowNavigation: [
      'https://mediumslateblue-cod-399211.hostingersite.com'
    ]
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;