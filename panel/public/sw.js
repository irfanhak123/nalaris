/**
 * Service Worker — Web Push handling for Nalaris.
 *
 * The browser keeps this alive in the background so Android can wake the
 * PWA and surface native notifications even when the tab is closed.
 */

/* global self, clients */

const CACHE_NAME = 'rumah-v1';

self.addEventListener('install', (event) => {
  // Skip waiting so the new SW activates immediately.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Nalaris', body: event.data.text() };
  }

  const title = payload.title || 'Nalaris';
  const options = {
    body: payload.body || 'New update',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'rumah-update',
    requireInteraction: false,
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const urlToOpen = data.link || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      }),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Best-effort: try to resubscribe and tell the server.
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
      })
      .then((subscription) => {
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        });
      })
      .catch(() => {
        // Server will try to send to the old endpoint and drop it when it 410s.
      }),
  );
});
