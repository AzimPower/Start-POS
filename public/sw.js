/* Service Worker généré par Workbox ou vite-plugin-pwa. Ce fichier doit être généré automatiquement lors du build PWA. */

// Exemple minimal pour le développement :
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  self.clients.claim();
});

// Ajoutez ici la logique de cache si besoin
