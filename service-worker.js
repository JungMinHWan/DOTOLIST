const CACHE_NAME = 'todo-list-cache-v5';

// 설치 단계: 대기 없이 즉시 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 활성화 단계: 제어권 즉시 획득 및 이전 캐시 제거
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 페치 단계: 실시간 Supabase API 연결을 방해하지 않는 심플 패스스루
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// 백그라운드 푸시 알림 수신
self.addEventListener('push', (event) => {
  let data = { title: 'Grow Quest', body: '할 일 예약 알림이 도착했습니다!' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Grow Quest', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: './images/logo.png',
    badge: './images/logo.png',
    vibrate: [100, 50, 100],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 알림 클릭 핸들러: 앱 활성화 또는 새 창 오픈
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 이미 열려 있는 탭이 있다면 포커스
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // 없으면 신규 윈도우 오픈
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

