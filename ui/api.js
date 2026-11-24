// Cầu nối UI ↔ core. MỌI lời gọi lõi của giao diện đi qua file này (PLAN mục 5),
// để khi API lõi lệch thì chỉ sửa một chỗ. Không chứa logic sinh câu hỏi / SRS.
import * as C from "../core/content.js";
import * as P from "../core/pinyin.js";
import * as SRS from "../core/srs.js";
import * as S from "../core/store.js";
import * as L from "../core/lesson.js";
import * as SC from "../core/scoring.js";
import * as SP from "../core/speech.js";

export { C, P, S, L, SRS, SP };

export const UNIT_SIZE = L.UNIT_SIZE || 8;
export const UNITS_PER_CHAPTER = 5;
export const TYPES = ["meaning", "hanzi", "listen", "tone", "typing", "match", "fill", "order", "speak", "write"];
export const SPEEDS = { slow: 0.6, normal: 0.85, fast: 1.1 };

/**
 * Cấp đã mở để HỌC / LUYỆN / THI THỬ. Cấp ngoài danh sách (HSK 7–9: chưa đủ nghĩa Việt) hiện nhãn "Sắp có",
 * chỉ tra được ở từ điển. Mở cấp 7–9: thêm 7 vào đây (không phải sửa chỗ nào khác).
 */
export const READY_LEVELS = [1, 2, 3, 4, 5, 6];
/** Cấp có file data/ref/grammar-l<N>.json (phải khớp danh sách DATA trong sw.js). */
export const GRAMMAR_LEVELS = [1, 2, 3, 4, 5, 6];
export const isReady = (lv) => READY_LEVELS.includes(Number(lv));
/** Đưa một cấp bất kỳ về cấp đã mở gần nhất phía dưới (7 → 6). */
export function readyLevel(lv) {
  const n = Number(lv) || 1;
  if (isReady(n)) return n;
  const below = READY_LEVELS.filter((x) => x <= n);
  return below.length ? Math.max(...below) : Math.min(...READY_LEVELS);
}

const DEFAULTS = { uiLang: "vi", gloss: "vi", pinyin: "always", speed: "normal", voice: "", sound: true, theme: "auto", dailyGoal: 50, level: 1 };

export const st = () => S.getState() || {};
export function settings() {
  const s = st();
  return { ...DEFAULTS, ...(s.settings || {}) };
}
export function setSetting(patch) {
  if (typeof S.setSettings === "function") return S.setSettings(patch);
  return S.set({ settings: { ...settings(), ...patch } });
}
export const isOnboarded = () => Boolean(st().onboarded) || Object.keys(st().cards || {}).length > 0 || (st().xp || 0) > 0;
export const setOnboarded = () => S.set({ onboarded: true });
/** Cấp đang học: luôn là cấp đã mở (cài đặt cũ / xếp lớp ra cấp "Sắp có" thì lùi về cấp mở cao nhất). */
export const level = () => readyLevel(settings().level);
/** Cấp ghi trong cài đặt (chưa lùi), để báo "Sắp có" cho người đã chọn cấp 7–9 từ bản trước. */
export const storedLevel = () => Number(settings().level) || 1;
export const cards = () => st().cards || {};
export const cardOf = (id) => cards()[id];
export function strengthOf(x) {
  const id = typeof x === "string" ? x : x?.id;
  try {
    return (typeof S.strengthOf === "function" ? S.strengthOf(id) : SRS.strength(cardOf(id))) || "new";
  } catch {
    return "new";
  }
}

export function dayKey(ts = Date.now()) {
  if (typeof S.dayKey === "function") return S.dayKey(ts);
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function todayXp() {
  if (typeof S.todayXp === "function") return S.todayXp();
  const e = (st().history || {})[dayKey()];
  return (typeof e === "number" ? e : e?.xp) || 0;
}
export const dueIds = () => {
  try {
    return S.dueIds() || [];
  } catch {
    return [];
  }
};

/** Kết quả một bài: { stars, best } | null. */
export function unitResult(lv, u) {
  if (typeof S.unitResult === "function") return S.unitResult(lv, u) || null;
  const units = st().units || {};
  for (const k of [`${lv}-${u}`, `${lv}:${u}`, `${lv}.${u}`, `${lv}/${u}`, `l${lv}u${u}`]) if (units[k]) return norm(units[k]);
  return null;
}
function norm(r) {
  if (typeof r === "number") return { stars: r >= 0.95 ? 3 : r >= 0.8 ? 2 : 1, best: r };
  const best = r.best ?? r.acc ?? 1;
  return { stars: r.stars ?? (best >= 0.95 ? 3 : best >= 0.8 ? 2 : 1), best };
}
export const unitsOf = (lv) => L.unitsOf(lv) || 0;
export const unitWords = (lv, u) => L.unitWords(lv, u) || [];
export const nextUnit = (lv) => {
  const total = unitsOf(lv);
  const n = S.nextUnit(lv, total);
  return Math.max(0, Math.min(Number(n) || 0, Math.max(0, total - 1)));
};
export function levelProgress(lv) {
  const total = unitsOf(lv);
  let done = 0;
  for (let u = 0; u < total; u += 1) if (unitResult(lv, u)) done += 1;
  return { done, total };
}
export function finishUnit(lv, u, acc) {
  const r = S.finishUnit(lv, u, acc);
  const stars = typeof r === "number" ? r : r?.stars;
  return stars ?? (acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : 1);
}
export function addXp(n, words = 0) {
  const r = S.addXp(n, words);
  return r && typeof r === "object" ? r : {};
}
export function newBadges() {
  try {
    const r = S.checkBadges();
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}
export const BADGES = () => S.BADGES || [];
export const hasBadge = (id) => {
  const b = st().badges;
  return Array.isArray(b) ? b.includes(id) : Boolean(b?.[id]);
};

// ---------- nội dung ----------
let indexCache = null;
export async function index() {
  indexCache = indexCache || (await C.loadIndex());
  return indexCache;
}
export const levelsSync = () => indexCache?.levels || [];
export const levelLabel = (lv) => levelsSync().find((l) => l.lv === Number(lv))?.label || (Number(lv) >= 7 ? "HSK 7–9" : `HSK ${lv}`);
const levelWords = new Map();
export async function loadLevel(lv) {
  if (!levelWords.has(lv)) levelWords.set(lv, (await C.loadLevel(lv)) || []);
  return levelWords.get(lv);
}
export const wordsOf = (lv) => levelWords.get(lv) || [];
let allWords = null;
export async function loadAll() {
  if (!allWords) {
    allWords = (await C.loadAll()) || [];
    for (const l of levelsSync()) if (!levelWords.has(l.lv)) levelWords.set(l.lv, allWords.filter((w) => w.lv === l.lv));
  }
  return allWords;
}
export const allLoaded = () => allWords;
export const getWord = (id) => C.getWord(id);
export const search = (q, opts) => C.search(q, opts) || [];
export const loadRef = (name) => C.loadRef(name);

// ---------- kế hoạch câu hỏi (lõi sinh, UI chỉ hiển thị) ----------
/** Tắt dạng bài thiết bị không làm được (tham số opts của core). */
const deviceOpts = () => ({ speak: canRecognize(), listen: canSpeak() });
export const lessonPlan = async (words, pool) => (await L.lessonPlan(words, pool, deviceOpts())) || [];
export const reviewPlan = async (words, pool) => (await L.reviewPlan(words, pool, strengthOf, deviceOpts())) || [];
export const drillPlan = async (type, words, pool) => (await L.drillPlan(type, words, pool)) || [];
export const placementPlan = async () => (await L.placementPlan()) || [];
export const testPlan = async (lv, n = 20) => (await L.testPlan(lv, n, deviceOpts())) || [];
export function check(question, response) {
  const r = L.check(question, response);
  return r && typeof r === "object" ? r : { correct: Boolean(r) };
}
/** Cấp đề xuất (1..7) từ nhật ký phiên xếp lớp [{ q, correct }]: lõi quyết định (placementResult). */
export const placementResult = (log) => L.placementResult(log);
/** Thống kê đúng / tổng theo cấp để hiển thị (core placementDetail, có thể thiếu). */
export const placementDetail = (log) => (typeof L.placementDetail === "function" ? L.placementDetail(log) : null);
/** Đưa từ vừa học vào lịch ôn. */
export const introduce = (id, mistakes) => (typeof S.introduce === "function" ? S.introduce(id, mistakes) : S.review(id, mistakes ? 1 : 2));
export const recordTest = (percent) => S.recordTest?.(percent);
export const scorePronunciation = (target, alternatives) => SC.scorePronunciation(target, alternatives, C.charPinyin);

// ---------- âm thanh ----------
export function speak(text, opts = {}) {
  if (!text) return;
  const s = settings();
  try {
    return SP.speak(text, { rate: SPEEDS[s.speed] || 0.85, lang: "zh-CN", voice: s.voice || undefined, ...opts });
  } catch (e) {
    console.warn(e);
  }
}
export const speakWord = (w, opts = {}) => w && speak(w.h, { audioUrl: w.au?.w || undefined, ...opts });
export const stopSpeaking = () => {
  try {
    SP.stopSpeaking();
  } catch {
    /* bỏ qua */
  }
};
export const chineseVoices = () => {
  try {
    return SP.chineseVoices() || [];
  } catch {
    return [];
  }
};
export const canRecognize = () => {
  try {
    return Boolean(SP.canRecognize());
  } catch {
    return false;
  }
};
export const canSpeak = () => "speechSynthesis" in window;
export const listen = (opts) => SP.listen(opts);

export const isHan = (c) => /\p{Script=Han}/u.test(c);
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- tùy chọn giao diện (lưu riêng localStorage, không sửa core/store.js) ----------
const UI_PREF_KEY = "hsk-v2-ui-prefs";
function readUiPrefs() {
  try {
    return JSON.parse(localStorage.getItem(UI_PREF_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function writeUiPrefs(p) {
  try {
    localStorage.setItem(UI_PREF_KEY, JSON.stringify(p));
  } catch {
    /* bỏ qua */
  }
}

export const toneColorsOn = () => readUiPrefs().toneColors !== false;
export function setToneColors(on) {
  const p = readUiPrefs();
  p.toneColors = Boolean(on);
  writeUiPrefs(p);
}

export const bookmarks = () => Array.isArray(readUiPrefs().bookmarks) ? readUiPrefs().bookmarks : [];
export const isBookmarked = (id) => bookmarks().includes(id);
export function toggleBookmark(id) {
  const p = readUiPrefs();
  const list = Array.isArray(p.bookmarks) ? p.bookmarks : [];
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(id);
  p.bookmarks = list;
  writeUiPrefs(p);
  return idx < 0;
}

export const searchHistory = () => Array.isArray(readUiPrefs().searchHistory) ? readUiPrefs().searchHistory : [];
export function addSearchHistory(q) {
  const clean = String(q || "").trim();
  if (!clean || clean.length > 40) return;
  const p = readUiPrefs();
  const list = (Array.isArray(p.searchHistory) ? p.searchHistory : []).filter((x) => x.toLowerCase() !== clean.toLowerCase());
  list.unshift(clean);
  p.searchHistory = list.slice(0, 8);
  writeUiPrefs(p);
}
export function clearSearchHistory() {
  const p = readUiPrefs();
  p.searchHistory = [];
  writeUiPrefs(p);
}

/** Tách dãy số thanh điệu 1..5 từ pn (vd "xue2 xiao4") hoặc py có dấu bằng core/pinyin.js */
export function tonesOf(wOrPy, pn) {
  try {
    // Chuỗi dạng pinyin số ("xue2 xiao4", "nu:3 er2") truyền ở tham số đầu cũng đọc như pn (lỗi KCS M1)
    const numbered = typeof wOrPy === "string" && /^\s*(?:[a-zü:']+[1-5]\s*)+$/i.test(wOrPy);
    const rawPn = typeof wOrPy === "string" ? pn || (numbered ? wOrPy : null) : wOrPy?.pn;
    if (rawPn) {
      const nums = String(rawPn).match(/[1-5](?=\b|\s|$)/g);
      if (nums && nums.length) return nums.map(Number);
    }
    const rawPy = typeof wOrPy === "string" ? wOrPy : wOrPy?.py || "";
    if (!rawPy) return [];
    const syls = P.splitSyllables?.(rawPy);
    if (Array.isArray(syls) && syls.length) {
      return syls.map((s) => {
        const n = P.toneOfSyllable(s);
        return n >= 1 && n <= 4 ? n : 5;
      });
    }
    const seq = P.toneSequence(rawPy);
    return Array.isArray(seq) ? seq.map((n) => (n >= 1 && n <= 5 ? n : 5)) : [];
  } catch {
    return [];
  }
}
