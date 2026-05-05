import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
  } : undefined,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: false,
        type: 'module'
      },
      includeAssets: ['favicon/site.webmanifest', 'robots.txt', 'offline.html'],
      manifest: {
        name: 'POS System',
        short_name: 'POS',
        description: 'Point of Sale System',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'favicon/site.webmanifest',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'favicon/site.webmanifest',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Améliorer la gestion des versions
        mode: 'generateSW',
        swDest: 'sw.js',
        // Fichiers à précacher
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webp,woff2}'
        ],
        // Ignorer certains fichiers
        globIgnores: [
          '**/node_modules/**/*',
          'sw.js',
          'workbox-*.js'
        ],
        // Configuration du cache runtime
        runtimeCaching: [
          {
            urlPattern: ({ url }) => {
              return url.pathname.includes('/backend/api/health.php');
            },
            handler: 'NetworkOnly'
          },
          {
            urlPattern: ({ url }) => {
              return /\/api\//.test(url.pathname) && !url.pathname.includes('/backend/api/');
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache-v1',
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes pour l'API
              }
            }
          },
          {
            urlPattern: ({ url, request }) => {
              const isEmailAPI = url.href.includes('send-email.php');
              const isBackendApi = url.pathname.includes('/backend/api/');
              const hasBypass = url.searchParams.has('_bypass_sw');
              const isNavigationRequest = request.mode === 'navigate' || request.destination === 'document';
              return url.hostname === 'mediumslateblue-cod-399211.hostingersite.com'
                && !isEmailAPI
                && !isBackendApi
                && !hasBypass
                && !isNavigationRequest;
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'external-api-cache',
              networkTimeoutSeconds: 15,
              cacheableResponse: {
                statuses: [200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache-v1',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 jours
              },
              cacheableResponse: {
                statuses: [200]
              }
            }
          },
          {
            urlPattern: /\.(?:js|css|woff2?|ttf|eot)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets-v1',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 jours
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets-v1'
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts-v1',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 an
              }
            }
          }
        ],
        // Code personnalisé pour gérer les mises à jour
        additionalManifestEntries: [
          {
            url: '/offline.html',
            revision: null
          }
        ]
      }
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Utiliser des hash plus longs pour éviter les collisions
        entryFileNames: 'assets/[name]-[hash:8].js',
        chunkFileNames: 'assets/[name]-[hash:8].js',
        assetFileNames: 'assets/[name]-[hash:8].[ext]'
      }
    },
    // Optimiser le splitting pour de meilleurs hash
    assetsInlineLimit: 0, // Ne pas inline les assets pour forcer les hash
    chunkSizeWarningLimit: 1000
  },
  // Variables d'environnement pour le versioning
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  }
}));
