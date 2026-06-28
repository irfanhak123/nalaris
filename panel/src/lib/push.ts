/**
 * lib/push.ts — Web Push subscription helper for the Nalaris panel.
 *
 * Registers the service worker, requests notification permission, fetches
 * the gateway's VAPID public key, and subscribes the device to push messages.
 */

import { gateway } from './gateway';

const SUBSCRIBED_ENDPOINT_KEY = 'rumah-push-endpoint';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

async function subscribeToPush(registration: ServiceWorkerRegistration) {
  if (!('PushManager' in window)) {
    // eslint-disable-next-line no-console
    console.warn('PushManager not available');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return;
  }

  try {
    const { public_key: publicKey } = await gateway.getVapidPublicKey();
    if (!publicKey) {
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    });

    await gateway.subscribePush({ subscription: subscription.toJSON() as PushSubscriptionJSON });
    localStorage.setItem(SUBSCRIBED_ENDPOINT_KEY, subscription.endpoint);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('push subscription failed:', e);
  }
}

async function unsubscribeFromPush(registration: ServiceWorkerRegistration) {
  if (!('PushManager' in window)) return;
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await gateway.unsubscribePush({ endpoint: subscription.endpoint });
      localStorage.removeItem(SUBSCRIBED_ENDPOINT_KEY);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('push unsubscription failed:', e);
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    // Wait for the service worker to be active before subscribing.
    if (registration.active) {
      await subscribeToPush(registration);
      return;
    }

    const onStateChange = () => {
      if (registration.installing?.state === 'activated') {
        void subscribeToPush(registration);
      }
    };
    registration.addEventListener('updatefound', onStateChange);
    if (registration.installing) {
      registration.installing.addEventListener('statechange', onStateChange);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('service worker registration failed:', e);
  }
}

export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await unsubscribeFromPush(registration);
  await registration.unregister();
}
