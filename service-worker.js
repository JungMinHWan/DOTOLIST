const CACHE_NAME = 'todo-list-cache-v3';

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
