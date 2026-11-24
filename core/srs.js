// Lịch ôn ngắt quãng (biến thể SM-2). Hàm thuần: không đọc/ghi trạng thái, không đụng DOM.
// Card = { r, iv, ef, due, l, last, seen, right, wrong }
//   r: số lần đúng liên tiếp · iv: khoảng cách (ngày) · ef: hệ số dễ · due: mốc ôn (ms)
//   l: số lần quên · last: lần ôn gần nhất (ms) · seen/right/wrong: bộ đếm
// grade: 0 = quên, 1 = khó, 2 = nhớ, 3 = dễ

export const DAY = 86400000;
export const AGAIN_DELAY = 10 * 60000; // quên -> hỏi lại sau 10 phút
export const MAX_INTERVAL = 365;

export function newCard(now = Date.now()) {
  return { r: 0, iv: 0, ef: 2.5, due: now, l: 0, last: 0, seen: 0, right: 0, wrong: 0 };
}

/** Trả về thẻ MỚI sau khi chấm (không sửa thẻ truyền vào). */
export function schedule(card, grade, now = Date.now()) {
  const c = { ...newCard(now), ...(card || {}) };
  const g = Math.max(0, Math.min(3, Math.round(Number(grade) || 0)));
  c.seen += 1;
  if (g === 0) {
    c.l += 1;
    c.r = 0;
    c.iv = 0;
    c.ef = Math.max(1.3, c.ef - 0.2);
    c.due = now + AGAIN_DELAY;
    c.wrong += 1;
  } else {
    c.right += 1;
    c.r += 1;
    if (c.r === 1) c.iv = g === 3 ? 3 : g === 1 ? 0.5 : 1;
    else if (c.r === 2) c.iv = g === 3 ? 7 : g === 1 ? 2 : 3;
    else c.iv = Math.round(c.iv * (g === 1 ? 1.2 : g === 3 ? c.ef * 1.3 : c.ef) * 10) / 10;
    c.ef = Math.max(1.3, c.ef + (g === 3 ? 0.15 : g === 1 ? -0.15 : 0));
    c.iv = Math.min(c.iv, MAX_INTERVAL);
    c.due = now + c.iv * DAY;
  }
  c.ef = Math.round(c.ef * 100) / 100;
  c.last = now;
  return c;
}

/** Độ nhớ: chưa có thẻ -> "new"; iv < 4 ngày -> "learning"; < 21 ngày -> "known"; còn lại "mastered". */
export function strength(card) {
  if (!card) return "new";
  if (card.iv >= 21) return "mastered";
  if (card.iv >= 4) return "known";
  return "learning";
}

export const STRENGTH_LABEL = {
  vi: { new: "Chưa học", learning: "Đang học", known: "Đã nhớ", mastered: "Thuộc lòng" },
  en: { new: "New", learning: "Learning", known: "Known", mastered: "Mastered" },
};

export function isDue(card, now = Date.now()) {
  return Boolean(card) && card.due <= now;
}
