// Trạng thái người học lưu trên máy (localStorage): cài đặt, XP, chuỗi ngày, thẻ SRS, bài đã xong, huy hiệu.
// Không đụng DOM. Trong Node / test: setStorage({ getItem, setItem }) rồi dùng như thường.
import { schedule, strength as cardStrength, DAY } from "./srs.js";

export const KEY = "hsk-v2-state"; // cùng khóa với bản v0 để tự chuyển dữ liệu cũ
export const VERSION = 2;

export const SETTING_DEFAULTS = Object.freeze({
  uiLang: "vi", // "vi" | "en"
  gloss: "vi", // "vi" | "en" | "both"
  pinyin: "always", // "always" | "hint" | "off"
  speed: "normal", // "slow" | "normal" | "fast"
  voice: "", // voiceURI giọng đọc, "" = tự chọn
  sound: true,
  theme: "auto", // "auto" | "light" | "dark"
  dailyGoal: 50, // XP mỗi ngày
  level: 1, // 1..7 (7 = băng HSK 7–9)
});
const ENUMS = {
  uiLang: ["vi", "en"],
  gloss: ["vi", "en", "both"],
  pinyin: ["always", "hint", "off"],
  speed: ["slow", "normal", "fast"],
  theme: ["auto", "light", "dark"],
};

function cleanSettings(input = {}) {
  const s = { ...SETTING_DEFAULTS, ...input };
  for (const [k, allowed] of Object.entries(ENUMS)) if (!allowed.includes(s[k])) s[k] = SETTING_DEFAULTS[k];
  s.voice = typeof s.voice === "string" ? s.voice : "";
  s.sound = s.sound !== false;
  const goal = Math.round(Number(s.dailyGoal));
  s.dailyGoal = Number.isFinite(goal) && goal > 0 ? Math.min(1000, goal) : SETTING_DEFAULTS.dailyGoal;
  const lv = Math.round(Number(s.level));
  s.level = Number.isFinite(lv) ? Math.max(1, Math.min(7, lv)) : 1;
  return s;
}

const defaultStats = () => ({ lessons: 0, reviews: 0, correct: 0, wrong: 0, speak: 0, write: 0, perfect: 0, tests: 0, bestTest: 0 });
const defaults = () => ({
  version: VERSION,
  settings: { ...SETTING_DEFAULTS },
  onboarded: false, // đã qua màn chào / xếp lớp chưa (UI tự đặt)
  xp: 0,
  streak: 0,
  bestStreak: 0,
  lastActive: "",
  freezes: 1,
  history: {}, // "YYYY-MM-DD": { xp, words, frozen? }
  cards: {}, // id: Card (xem srs.js)
  units: {}, // "lv-unit": { stars, best, at }
  badges: {}, // id: timestamp
  stats: defaultStats(),
  createdAt: Date.now(),
});

const OLD_SETTING_KEYS = ["level", "dailyGoal", "speed", "voice", "sound", "showPinyin"];
const NEW_ID = /^n[1-7]-\d{4}$/;

/** Chuẩn hóa dữ liệu đọc được (kể cả bản v0 version 1) về dạng hiện tại. Hàm thuần. */
export function migrate(raw) {
  if (!raw || typeof raw !== "object") return defaults();
  const out = { ...defaults(), ...raw, stats: { ...defaultStats(), ...(raw.stats || {}) } };
  const old = !raw.settings || (raw.version || 1) < 2;
  const fromOld = {};
  if (old) {
    for (const k of ["level", "dailyGoal", "speed", "voice", "sound"]) if (raw[k] !== undefined) fromOld[k] = raw[k];
    if (typeof raw.showPinyin === "boolean") fromOld.pinyin = raw.showPinyin ? "always" : "off";
    // Thẻ / bài của v0 dùng mã "hsk1-0001" và danh sách từ khác -> cất riêng, không xóa
    const cards = {};
    const legacyCards = {};
    for (const [id, c] of Object.entries(raw.cards || {})) (NEW_ID.test(id) ? cards : legacyCards)[id] = c;
    if (Object.keys(legacyCards).length) {
      out.legacyV1 = { cards: legacyCards, units: raw.units || {} };
      out.cards = cards;
      out.units = {};
    }
  }
  out.settings = cleanSettings({ ...fromOld, ...(raw.settings || {}) });
  for (const k of OLD_SETTING_KEYS) delete out[k];
  for (const k of ["history", "cards", "units", "badges"]) if (!out[k] || typeof out[k] !== "object" || Array.isArray(out[k])) out[k] = {};
  out.version = VERSION;
  return out;
}

// ---------------- Lưu trữ ----------------

let storage; // undefined = chưa dò; null = không có
let state = null;
const listeners = new Set();

function getStorage() {
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage ?? null;
    } catch {
      storage = null;
    }
  }
  return storage;
}

/** Thay nơi lưu (test / Node). Trạng thái được đọc lại từ nơi lưu mới. */
export function setStorage(s) {
  storage = s || null;
  state = null;
}

function load() {
  try {
    const text = getStorage()?.getItem(KEY);
    if (text) return migrate(JSON.parse(text));
  } catch {
    /* dữ liệu hỏng hoặc bị chặn: dùng mặc định */
  }
  return defaults();
}

function cur() {
  if (!state) state = load();
  return state;
}

export function save() {
  const s = cur();
  try {
    getStorage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* chế độ riêng tư / đầy bộ nhớ: bỏ qua */
  }
  listeners.forEach((fn) => {
    try {
      fn(s);
    } catch {
      /* lỗi của người nghe không làm hỏng việc lưu */
    }
  });
}

export function getState() {
  return cur();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Gộp nông vào state; riêng `settings` được gộp từng khóa và kiểm giá trị. */
export function set(patch = {}) {
  const s = cur();
  const next = { ...s, ...patch };
  if (patch.settings) next.settings = cleanSettings({ ...s.settings, ...patch.settings });
  state = next;
  save();
  return state;
}

export function getSettings() {
  return cur().settings;
}

export function setSettings(patch = {}) {
  return set({ settings: patch }).settings;
}

// ---------------- Ngày, XP, chuỗi ----------------

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a, b) {
  if (!a || !b) return Infinity;
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY);
}

/** Gọi khi mở app: lỡ đúng 1 ngày và còn "đóng băng chuỗi" thì giữ chuỗi, lỡ nhiều hơn thì chuỗi về 0. */
export function checkStreak(now = Date.now()) {
  const s = cur();
  const gap = daysBetween(s.lastActive, dayKey(now));
  if (gap === Infinity || gap <= 1) return s.streak;
  if (gap === 2 && s.freezes > 0) {
    s.freezes -= 1;
    const y = dayKey(now - DAY);
    s.history[y] = { ...(s.history[y] || { xp: 0, words: 0 }), frozen: true };
    s.lastActive = y;
  } else {
    s.streak = 0;
  }
  save();
  return s.streak;
}

export function todayXp(now = Date.now()) {
  return cur().history[dayKey(now)]?.xp || 0;
}

/** Cộng XP, cập nhật chuỗi ngày. Trả về { streakUp, goalReached, streak, todayXp }. */
export function addXp(amount, words = 0, now = Date.now()) {
  const s = cur();
  const n = Math.max(0, Number(amount) || 0);
  const today = dayKey(now);
  const before = s.history[today]?.xp || 0;
  const entry = s.history[today] || { xp: 0, words: 0 };
  entry.xp += n;
  entry.words = (entry.words || 0) + (Number(words) || 0);
  s.history[today] = entry;
  s.xp += n;
  let streakUp = false;
  if (s.lastActive !== today) {
    s.streak = daysBetween(s.lastActive, today) === 1 ? s.streak + 1 : 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastActive = today;
    streakUp = true;
    if (s.streak % 7 === 0) s.freezes = Math.min(2, s.freezes + 1); // mỗi 7 ngày thưởng 1 lần đóng băng (tối đa 2)
  }
  const goal = s.settings.dailyGoal;
  const goalReached = before < goal && entry.xp >= goal;
  save();
  return { streakUp, goalReached, streak: s.streak, todayXp: entry.xp };
}

// ---------------- SRS ----------------

export function card(id) {
  return cur().cards[id];
}

/** Chấm một thẻ (grade 0..3) và lưu. Trả về thẻ mới. */
export function review(id, grade, now = Date.now()) {
  const s = cur();
  const c = schedule(s.cards[id], grade, now);
  s.cards[id] = c;
  save();
  return c;
}

/** Từ vừa học xong bài: đưa vào SRS; có sai trong bài thì hẹn sớm hơn. */
export function introduce(id, mistakes = 0, now = Date.now()) {
  return review(id, mistakes ? 1 : 2, now);
}

export function strengthOf(id) {
  return cardStrength(cur().cards[id]);
}

/** Mã các thẻ đến hạn ôn, hạn cũ nhất trước. filter(id) tùy chọn. */
export function dueIds(now = Date.now(), filter = null) {
  return Object.entries(cur().cards)
    .filter(([id, c]) => c.due <= now && (!filter || filter(id)))
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}

export function learnedIds(filter = null) {
  return Object.keys(cur().cards).filter((id) => !filter || filter(id));
}

// ---------------- Bài học ----------------

export function unitKey(lv, u) {
  return `${lv}-${u}`;
}

export function unitResult(lv, u) {
  return cur().units[unitKey(lv, u)] || null;
}

/** Ghi kết quả bài (acc 0..1). Trả về số sao 1..3. */
export function finishUnit(lv, u, acc) {
  const s = cur();
  const accuracy = Math.max(0, Math.min(1, Number(acc) || 0));
  const stars = accuracy >= 0.95 ? 3 : accuracy >= 0.8 ? 2 : 1;
  const key = unitKey(lv, u);
  const prev = s.units[key];
  s.units[key] = { stars: Math.max(stars, prev?.stars || 0), best: Math.max(accuracy, prev?.best || 0), at: Date.now() };
  s.stats.lessons += 1;
  if (accuracy >= 0.999) s.stats.perfect += 1;
  save();
  return stars;
}

/** Bài kế tiếp chưa hoàn thành của cấp (chỉ số từ 0); xong hết thì trả bài cuối. */
export function nextUnit(lv, total) {
  const s = cur();
  for (let u = 0; u < total; u += 1) if (!s.units[unitKey(lv, u)]) return u;
  return Math.max(0, total - 1);
}

export function bumpStat(name, by = 1) {
  const s = cur();
  s.stats[name] = (s.stats[name] || 0) + by;
  save();
  return s.stats[name];
}

/** Ghi kết quả thi thử (điểm 0..100). */
export function recordTest(percent) {
  const s = cur();
  s.stats.tests += 1;
  s.stats.bestTest = Math.max(s.stats.bestTest || 0, Math.round(Number(percent) || 0));
  save();
}

// ---------------- Huy hiệu ----------------

const learned = (s) => Object.keys(s.cards).length;
export const BADGES = [
  { id: "first", icon: "🌱", name: "Khởi đầu", nameEn: "First step", desc: "Hoàn thành bài học đầu tiên", descEn: "Finish your first lesson", test: (s) => s.stats.lessons >= 1 },
  { id: "streak3", icon: "🔥", name: "Lửa nhỏ", nameEn: "Small flame", desc: "Học 3 ngày liên tục", descEn: "3-day streak", test: (s) => s.bestStreak >= 3 },
  { id: "streak7", icon: "🏮", name: "Một tuần bền bỉ", nameEn: "One steady week", desc: "Học 7 ngày liên tục", descEn: "7-day streak", test: (s) => s.bestStreak >= 7 },
  { id: "streak30", icon: "🐉", name: "Rồng kiên trì", nameEn: "Persistent dragon", desc: "Học 30 ngày liên tục", descEn: "30-day streak", test: (s) => s.bestStreak >= 30 },
  { id: "w50", icon: "📗", name: "50 từ", nameEn: "50 words", desc: "Đã học 50 từ", descEn: "50 words learned", test: (s) => learned(s) >= 50 },
  { id: "w300", icon: "📚", name: "300 từ", nameEn: "300 words", desc: "Đã học 300 từ", descEn: "300 words learned", test: (s) => learned(s) >= 300 },
  { id: "w1000", icon: "🏯", name: "1.000 từ", nameEn: "1,000 words", desc: "Đã học 1.000 từ", descEn: "1,000 words learned", test: (s) => learned(s) >= 1000 },
  { id: "w3000", icon: "🗻", name: "3.000 từ", nameEn: "3,000 words", desc: "Đã học 3.000 từ", descEn: "3,000 words learned", test: (s) => learned(s) >= 3000 },
  { id: "perfect", icon: "💯", name: "Hoàn hảo", nameEn: "Flawless", desc: "Một bài học không sai câu nào", descEn: "A lesson with no mistakes", test: (s) => s.stats.perfect >= 1 },
  { id: "speak20", icon: "🎙️", name: "Mạnh dạn nói", nameEn: "Speaking up", desc: "Luyện phát âm 20 lần", descEn: "20 speaking attempts", test: (s) => s.stats.speak >= 20 },
  { id: "write20", icon: "🖌️", name: "Thư pháp nhí", nameEn: "Young calligrapher", desc: "Viết đúng 20 chữ", descEn: "20 characters written", test: (s) => s.stats.write >= 20 },
  { id: "xp1000", icon: "⭐", name: "1.000 XP", nameEn: "1,000 XP", desc: "Tích lũy 1.000 điểm kinh nghiệm", descEn: "Earn 1,000 XP", test: (s) => s.xp >= 1000 },
  { id: "test90", icon: "🏆", name: "Thủ khoa", nameEn: "Top of the class", desc: "Bài thi thử đạt từ 90%", descEn: "Score 90%+ on a mock test", test: (s) => s.stats.bestTest >= 90 },
];

/** Mở khóa huy hiệu đủ điều kiện. Trả về mảng huy hiệu VỪA mở ([] nếu không có). */
export function checkBadges() {
  const s = cur();
  const fresh = [];
  for (const b of BADGES) {
    if (!s.badges[b.id] && b.test(s)) {
      s.badges[b.id] = Date.now();
      fresh.push(b);
    }
  }
  if (fresh.length) save();
  return fresh;
}

// ---------------- Sao lưu ----------------

export function exportJson() {
  return JSON.stringify({ app: "hsk-v2", exportedAt: new Date().toISOString(), state: cur() }, null, 1);
}

/** Nhập bản sao lưu (kể cả bản xuất từ v0). Sai định dạng thì ném lỗi, trạng thái hiện tại giữ nguyên. */
export function importJson(text) {
  const parsed = JSON.parse(text);
  const incoming = parsed?.state;
  if (!incoming || typeof incoming !== "object" || !incoming.cards || typeof incoming.cards !== "object") {
    throw new Error("File không đúng định dạng sao lưu của app.");
  }
  state = migrate(incoming);
  save();
  return state;
}

export function resetAll() {
  state = defaults();
  save();
  return state;
}
