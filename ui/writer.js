// Viết chữ Hán theo nét: dùng thư viện hanzi-writer (dữ liệu nét Make Me a Hanzi, tải qua CDN).
import { h } from "./components/dom.js";
import { t } from "./i18n.js";

const LIB = "https://cdn.jsdelivr.net/npm/hanzi-writer@3.7.3/dist/hanzi-writer.min.js";
const DATA = (ch) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(ch)}.json`;
let loading = null;

export function loadWriter() {
  if (window.HanziWriter) return Promise.resolve(window.HanziWriter);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LIB;
    s.async = true;
    s.onload = () => resolve(window.HanziWriter);
    s.onerror = () => {
      loading = null;
      reject(new Error(t("wr.noLib")));
    };
    document.head.append(s);
  });
  return loading;
}

function charLoader(ch, onLoad, onError) {
  fetch(DATA(ch))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(t("wr.noData")))))
    .then(onLoad)
    .catch(onError);
}

function colors() {
  const css = getComputedStyle(document.documentElement);
  return {
    strokeColor: css.getPropertyValue("--ink").trim() || "#222",
    radicalColor: css.getPropertyValue("--brand").trim() || "#c0392b",
    outlineColor: css.getPropertyValue("--line").trim() || "#ddd",
    drawingColor: css.getPropertyValue("--brand").trim() || "#c0392b",
    highlightColor: css.getPropertyValue("--ok").trim() || "#2f9e6e",
  };
}

function gridBox(size) {
  return h("div.hz-grid", { style: { width: `${size}px`, height: `${size}px` } });
}

/** Ô xem hoạt hình thứ tự nét. Trả về { el, play } */
export function strokeAnimator(char, size = 160) {
  const box = gridBox(size);
  const status = h("div.hz-status", t("wr.loading"));
  const el = h("div.hz-wrap", box, status);
  let writer = null;
  const ready = loadWriter()
    .then((HW) => {
      writer = HW.create(box, char, {
        width: size,
        height: size,
        padding: 6,
        showOutline: true,
        strokeAnimationSpeed: 1.1,
        delayBetweenStrokes: 180,
        charDataLoader: charLoader,
        onLoadCharDataSuccess: () => status.remove(),
        onLoadCharDataError: (e) => (status.textContent = e?.message || t("wr.noData")),
        ...colors(),
      });
      return writer;
    })
    .catch((e) => {
      status.textContent = e.message;
    });
  return {
    el,
    play: () => ready.then(() => writer?.animateCharacter()),
    loop: () => ready.then(() => writer?.loopCharacterAnimation()),
  };
}

/**
 * Ô luyện viết có chấm: người học tự vẽ từng nét.
 * onDone({ mistakes, strokes }) khi viết xong.
 */
export function strokeQuiz(char, { size = 260, onDone, showOutline = true } = {}) {
  const box = gridBox(size);
  const status = h("div.hz-status", t("wr.loading"));
  const el = h("div.hz-wrap.quiz", box, status);
  let writer = null;
  const ready = loadWriter()
    .then((HW) => {
      writer = HW.create(box, char, {
        width: size,
        height: size,
        padding: 8,
        showCharacter: false,
        showOutline,
        showHintAfterMisses: 2,
        highlightOnComplete: true,
        charDataLoader: charLoader,
        onLoadCharDataSuccess: (data) => {
          status.textContent = t("wr.strokes", { n: data.strokes.length });
        },
        onLoadCharDataError: (e) => (status.textContent = e?.message || t("wr.noData")),
        ...colors(),
      });
      start();
      return writer;
    })
    .catch((e) => {
      status.textContent = e.message;
    });
  function start() {
    writer.quiz({
      onComplete: (summary) => onDone?.({ mistakes: summary.totalMistakes, char }),
    });
  }
  return {
    el,
    restart: () =>
      ready.then(() => {
        writer?.hideCharacter();
        start();
      }),
    hint: () =>
      ready.then(async () => {
        if (!writer) return;
        await writer.animateCharacter();
        await writer.hideCharacter();
        start();
      }),
  };
}
