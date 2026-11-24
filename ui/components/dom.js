// Tiện ích DOM nhỏ gọn + âm báo + thông báo nổi.

/** h("div.card#id", {onclick}, child1, "text", [children]) */
export function h(tag, attrs, ...children) {
  const [, name = "div", rest = ""] = tag.match(/^([a-z0-9-]*)(.*)$/i) || [];
  const el = document.createElement(name || "div");
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === ".") el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className += ` ${v}`;
    else if (k === "style" && typeof v === "object") {
      // biến CSS (--x) phải đặt bằng setProperty, gán thuộc tính không có tác dụng
      for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? el.style.setProperty(sk, String(sv)) : (el.style[sk] = sv);
    }
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else Element.prototype.append.call(el, c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  // append gốc của DOM in null / false thành chữ; thay bằng bản bỏ qua giá trị rỗng
  if (!Object.hasOwn(el, "append")) el.append = (...children) => append(el, children);
  return el;
}

/** Thêm con vào phần tử, bỏ qua null / false, nhận cả mảng lồng. */
export function add(el, ...children) {
  append(el, children);
  return el;
}

let toastBox;
export function toast(message, kind = "info", ms = 2600) {
  if (!toastBox) {
    toastBox = h("div.toasts", { role: "status", "aria-live": "polite" });
    document.body.append(toastBox);
  }
  const t = h(`div.toast.${kind}`, message);
  toastBox.append(t);
  setTimeout(() => t.classList.add("out"), ms);
  setTimeout(() => t.remove(), ms + 400);
}

let audioCtx;
/** Âm báo đúng / sai / hoàn thành (tổng hợp bằng WebAudio, không cần file). */
export function beep(kind) {
  if (soundOn && !soundOn()) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { ok: [660, 880], bad: [300, 220], done: [523, 659, 784, 1047] }[kind] || [440];
    notes.forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = kind === "bad" ? "sawtooth" : "sine";
      o.frequency.value = freq;
      const t0 = audioCtx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(kind === "bad" ? 0.05 : 0.12, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + 0.2);
    });
  } catch {
    /* không có âm thanh */
  }
}

export function vibrate(ms = 30) {
  try {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate?.(ms);
  } catch {
    /* bỏ qua */
  }
}

/** Hộp thoại đơn giản dạng bảng trượt. Trả về hàm đóng. */
export function sheet(content, { onClose } = {}) {
  const close = () => {
    wrap.classList.add("closing");
    setTimeout(() => wrap.remove(), 200);
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === "Escape" && close();
  const wrap = h(
    "div.sheet-wrap",
    { onclick: (e) => e.target === wrap && close() },
    h("div.sheet", { role: "dialog", "aria-modal": "true" }, h("button.sheet-close", { "aria-label": "Đóng / Close", onclick: close }, "✕"), content),
  );
  document.body.append(wrap);
  document.addEventListener("keydown", onKey);
  return close;
}

export function confetti(container = document.body) {
  const box = h("div.confetti");
  const colors = ["#e0533d", "#f5b83d", "#2f9e6e", "#2c7fb8", "#7b4fc4"];
  for (let i = 0; i < 40; i += 1) {
    box.append(
      h("i", {
        style: {
          left: `${Math.random() * 100}%`,
          background: colors[i % colors.length],
          animationDelay: `${Math.random() * 0.4}s`,
          transform: `rotate(${Math.random() * 360}deg)`,
        },
      }),
    );
  }
  container.append(box);
  setTimeout(() => box.remove(), 2400);
}

export function pct(n) {
  return `${Math.round(n * 100)}%`;
}

export function fmtNumber(n) {
  return n.toLocaleString(document.documentElement.lang === "en" ? "en-US" : "vi-VN");
}

let soundOn = null;
/** app.js gắn hàm đọc cài đặt âm báo (tránh dom.js phụ thuộc core). */
export function setSoundGetter(fn) {
  soundOn = fn;
}

export const go = (hash) => {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
};

/** Khung xương đang tải (Brief §7). */
export function skeleton(rows = 3) {
  return h(
    "div.skeleton-wrap",
    { role: "status", "aria-busy": "true" },
    h("div.skeleton.sk-title"),
    Array.from({ length: rows }, () => h("div.skeleton.sk-card")),
  );
}

/** Đăng ký phím cho một màn hình; tự gỡ khi đổi trang. Trả về hàm gỡ. */
export function onKeys(handler) {
  const off = () => {
    document.removeEventListener("keydown", handler);
    window.removeEventListener("hashchange", off);
  };
  document.addEventListener("keydown", handler);
  window.addEventListener("hashchange", off);
  return off;
}
