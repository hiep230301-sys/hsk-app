// Service worker: lưu sẵn khung app (ui/, core/) + dữ liệu (data/vocab, data/ref) để học offline.
const VERSION = "hsk-v2-ui-7";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "icon.svg",
  "ui/styles/tokens.css", "ui/styles/app.css",
  "ui/app.js", "ui/api.js", "ui/i18n.js", "ui/writer.js",
  "ui/components/dom.js", "ui/components/word.js", "ui/components/questions.js", "ui/components/session.js",
  "ui/screens/learn.js", "ui/screens/practice.js", "ui/screens/lookup.js", "ui/screens/me.js",
  "core/pinyin.js", "core/content.js", "core/srs.js", "core/store.js", "core/lesson.js", "core/scoring.js", "core/speech.js",
  "data/vocab/index.json",
];
// Dữ liệu lớn / có thể chưa có: nạp nền, thiếu file nào bỏ qua file đó (không làm hỏng việc cài SW)
const DATA = [
  "data/vocab/l1.json", "data/vocab/l2.json", "data/vocab/l3.json", "data/vocab/l4.json", "data/vocab/l5.json", "data/vocab/l6.json",
  "data/vocab/l7-1.json", "data/vocab/l7-2.json", "data/vocab/l7-3.json", "data/vocab/l7-4.json",
  "data/ref/pinyin.json", "data/ref/tones.json", "data/ref/radicals.json", "data/ref/classifiers.json",
  "data/ref/grammar-l1.json", "data/ref/grammar-l2.json", "data/ref/grammar-l3.json", "data/ref/grammar-l4.json",
  "data/ref/grammar-l5.json", "data/ref/grammar-l6.json",
];

const putAll = (cache, urls) =>
  Promise.all(urls.map((u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? cache.put(u, r) : null)).catch(() => null)));

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then(async (c) => {
        await putAll(c, SHELL);
        putAll(c, DATA); // không chờ: khoảng 4 MB, tải nền
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "hsk-cdn").map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Thư viện viết chữ, dữ liệu nét, font: lưu dần khi dùng
  if (/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(
      caches.open("hsk-cdn").then(async (c) => {
        const hit = await c.match(e.request);
        const net = fetch(e.request).then((r) => (r.ok && c.put(e.request, r.clone()), r)).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }
  if (url.origin !== location.origin) return;
  // Mã + dữ liệu: ưu tiên mạng (để cập nhật), mất mạng thì dùng bản lưu
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then((r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())),
      ),
  );
});
