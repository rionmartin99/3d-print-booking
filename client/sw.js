const CACHE_NAME = 'printlab-client-v13';
const SYNC_META_CACHE = 'printlab-sync-meta';
const SYNC_META_KEY = './__sync_state__.json';
const PERIODIC_SYNC_TAG = 'printlab-booking-sync';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== SYNC_META_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('./index.html');
    })
  );
});

function hasActiveOrUnpaidJobs(bookings) {
  return Array.isArray(bookings) && bookings.some((b) => {
    const status = String(b.jobStatus || '');
    const pay = String(b.paymentStatus || '');
    const isFinishedStatus = status === 'Completed' || status === 'Cancelled' || status === 'Rejected';
    return !isFinishedStatus || pay !== 'Paid';
  });
}

function formatPeso(val) {
  const num = Number(val);
  return isNaN(num) ? 'Pending' : '₱ ' + num.toFixed(2);
}

async function runPeriodicBookingSync() {
  const metaCache = await caches.open(SYNC_META_CACHE);
  const metaRes = await metaCache.match(SYNC_META_KEY);
  if (!metaRes) return;

  const meta = await metaRes.json();
  if (!meta || !meta.gasUrl || !meta.studentId) return;

  const res = await fetch(meta.gasUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'getMyBookings', studentId: meta.studentId })
  });
  if (!res.ok) return;

  const data = await res.json();
  if (!data || !data.ok || !Array.isArray(data.bookings)) return;

  const prevMap = meta.snapshot || {};
  const nextMap = {};
  const isFirstSync = Object.keys(prevMap).length === 0;
  const canNotify = typeof self.Notification !== 'undefined' && self.Notification.permission === 'granted';

  for (const b of data.bookings) {
    const curr = {
      estimatedWeightGrams: b.estimatedWeightGrams ?? '',
      estimatedHours: b.estimatedHours ?? '',
      estimatedMinutes: b.estimatedMinutes ?? '',
      supportRequired: b.supportRequired ?? '',
      jobStatus: b.jobStatus ?? '',
      priceToPay: b.priceToPay ?? '',
      paymentStatus: b.paymentStatus ?? '',
      adminNotes: b.adminNotes ?? ''
    };
    nextMap[b.bookingId] = curr;

    const prev = prevMap[b.bookingId];
    if (!prev && isFirstSync) continue;

    if (prev && canNotify) {
      const specsChanged =
        prev.estimatedWeightGrams !== curr.estimatedWeightGrams ||
        prev.estimatedHours !== curr.estimatedHours ||
        prev.estimatedMinutes !== curr.estimatedMinutes ||
        prev.supportRequired !== curr.supportRequired ||
        prev.jobStatus !== curr.jobStatus ||
        prev.adminNotes !== curr.adminNotes;

      if (specsChanged) {
        const parts = [];
        if (curr.estimatedWeightGrams !== '') parts.push(`Weight: ${curr.estimatedWeightGrams}g`);
        if (curr.estimatedHours !== '' || curr.estimatedMinutes !== '') {
          parts.push(`Duration: ${curr.estimatedHours || 0}h ${curr.estimatedMinutes || 0}m`);
        }
        if (curr.supportRequired) parts.push(`Supports: ${curr.supportRequired}`);
        parts.push(`Status: ${curr.jobStatus}`);
        if (curr.adminNotes) parts.push(`Note: ${curr.adminNotes}`);

        await self.registration.showNotification(`Admin Update (${b.bookingId})`, {
          body: parts.join(' · '),
          icon: './icon.svg',
          badge: './icon.svg',
          tag: `printlab-spec-${b.bookingId}`
        });
      }

      const priceChanged = prev.priceToPay !== curr.priceToPay && curr.priceToPay !== '' && curr.priceToPay !== null;
      const payStatusChanged = prev.paymentStatus !== curr.paymentStatus;

      if (priceChanged || payStatusChanged) {
        const amountText = curr.priceToPay !== '' && curr.priceToPay !== null
          ? formatPeso(curr.priceToPay)
          : 'Pending';
        await self.registration.showNotification(`Payment Update (${b.bookingId})`, {
          body: `Amount to pay: ${amountText} · Status: ${curr.paymentStatus}`,
          icon: './icon.svg',
          badge: './icon.svg',
          tag: `printlab-pay-${b.bookingId}`
        });
      }
    }
  }

  await metaCache.put(
    SYNC_META_KEY,
    new Response(JSON.stringify({ ...meta, snapshot: nextMap, updatedAt: Date.now() }), {
      headers: { 'Content-Type': 'application/json' }
    })
  );

  if (!hasActiveOrUnpaidJobs(data.bookings) && self.registration.periodicSync) {
    try {
      await self.registration.periodicSync.unregister(PERIODIC_SYNC_TAG);
    } catch {
      // Ignore if already unregistered
    }
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(runPeriodicBookingSync().catch(() => {}));
  }
});
