// Nội dung: nạp index + file cấp, tra từ, tìm kiếm, tách câu, chữ -> pinyin, tài liệu tra cứu.
// Không đụng DOM. Mặc định dùng fetch; trong Node gọi setFetcher(fn) để đọc từ đĩa.
import { stripTones, splitSyllables, foldVi, isHan } from "./pinyin.js";

export { isHan };
export const MAX_LEVEL = 7; // lv 7 = băng HSK 7–9

let base = "data/";
const defaultFetcher = (url) => globalThis.fetch(url);
let fetcher = defaultFetcher;

let indexPromise = null;
let indexData = null;
const levels = new Map(); // lv -> Word[]
const pending = new Map(); // lv -> Promise
const refs = new Map(); // name -> Promise
const byId = new Map();
const byHanzi = new Map(); // h -> Word[]
const searchKeys = new Map(); // id -> khóa tìm kiếm đã chuẩn hóa
const segDict = new Set();
let maxWordLen = 1;
const charReadings = new Map(); // chữ -> [pinyin có dấu]

/** Thay hàm tải. fn(url) trả về JSON đã parse HOẶC đối tượng kiểu Response (có .json()). Gọi không tham số để về fetch. */
export function setFetcher(fn) {
  fetcher = typeof fn === "function" ? fn : defaultFetcher;
}

/** Đổi thư mục gốc dữ liệu (mặc định "data/"). */
export function setBase(url) {
  base = url.endsWith("/") ? url : `${url}/`;
}

/** Xóa mọi thứ đã nạp (dùng cho test). */
export function resetContent() {
  indexPromise = null;
  indexData = null;
  for (const m of [levels, pending, refs, byId, byHanzi, searchKeys, charReadings]) m.clear();
  segDict.clear();
  maxWordLen = 1;
}

async function getJson(path) {
  const res = await fetcher(base + path);
  if (res && typeof res.json === "function") {
    if (res.ok === false) throw new Error(`Không tải được ${path} (${res.status})`);
    return res.json();
  }
  if (res == null) throw new Error(`Không tải được ${path}`);
  return res;
}

/** Cấp hợp lệ 1..7; HSK 8, 9 quy về băng 7. */
export function normLevel(lv) {
  const n = Math.round(Number(lv));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_LEVEL, n);
}

export function loadIndex() {
  if (!indexPromise) {
    indexPromise = getJson("vocab/index.json").then(
      (data) => {
        indexData = data;
        return data;
      },
      (err) => {
        indexPromise = null;
        throw err;
      },
    );
  }
  return indexPromise;
}

/** Index đã nạp (đồng bộ) hoặc null. */
export function getIndex() {
  return indexData;
}

export function loadLevel(lv) {
  const level = normLevel(lv);
  if (levels.has(level)) return Promise.resolve(levels.get(level));
  if (pending.has(level)) return pending.get(level);
  const task = loadIndex()
    .then((index) => {
      const entry = (index.levels || []).find((l) => l.lv === level);
      if (!entry) throw new Error(`index.json không có cấp ${level}`);
      return Promise.all(entry.files.map((f) => getJson(`vocab/${f}`)));
    })
    .then((parts) => {
      const rows = parts.flat().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      levels.set(level, rows);
      pending.delete(level);
      indexWords(rows);
      return rows;
    })
    .catch((err) => {
      pending.delete(level);
      throw err;
    });
  pending.set(level, task);
  return task;
}

export async function loadAll() {
  const index = await loadIndex();
  await Promise.all((index.levels || []).map((l) => loadLevel(l.lv)));
  return allWords();
}

/** Từ của một cấp ĐÃ nạp (đồng bộ), chưa nạp trả []. Thứ tự theo id (thông dụng trước). */
export function levelWords(lv) {
  return levels.get(normLevel(lv)) || [];
}

export function loadedLevels() {
  return [...levels.keys()].sort((a, b) => a - b);
}

export function allWords() {
  return loadedLevels().flatMap((lv) => levels.get(lv));
}

/** Số từ của cấp: theo dữ liệu đã nạp, chưa nạp thì theo index, không có thì 0. */
export function levelCount(lv) {
  const level = normLevel(lv);
  if (levels.has(level)) return levels.get(level).length;
  return indexData?.levels?.find((l) => l.lv === level)?.count || 0;
}

export function getWord(id) {
  return byId.get(id) || null;
}

/** Các mục từ có chữ Hán đúng bằng `h` (một chữ có thể xuất hiện ở nhiều cấp / nhiều nghĩa). */
export function findByHanzi(h) {
  return byHanzi.get(h) || [];
}

// ---------------- Lập chỉ mục ----------------

function hanziForms(h) {
  return String(h || "")
    .split(/[／/、，,|｜]/)
    .map((p) => p.replace(/[（(].*?[)）]/g, "").trim())
    .filter(Boolean);
}

function addReading(ch, py, primary = false) {
  if (!py || !isHan(ch)) return;
  const plain = py.toLowerCase();
  const list = charReadings.get(ch) || [];
  const at = list.indexOf(plain);
  if (at === -1) primary ? list.unshift(plain) : list.push(plain);
  else if (primary && at > 0) {
    list.splice(at, 1);
    list.unshift(plain);
  }
  charReadings.set(ch, list);
}

/** Ghép 1:1 chữ Hán với âm tiết pinyin khi số lượng khớp. */
function learnPairs(zh, py) {
  if (!zh || !py) return;
  const chars = [...zh].filter(isHan);
  if (!chars.length) return;
  const syls = splitSyllables(py);
  if (chars.length !== syls.length) return;
  chars.forEach((c, i) => addReading(c, syls[i]));
}

function indexWords(rows) {
  for (const w of rows) {
    byId.set(w.id, w);
    const forms = hanziForms(w.h);
    for (const form of new Set([w.h, ...forms])) {
      const list = byHanzi.get(form) || [];
      list.push(w);
      byHanzi.set(form, list);
    }
    for (const form of forms) {
      segDict.add(form);
      maxWordLen = Math.max(maxWordLen, Math.min([...form].length, 8));
    }
    const firstPy = String(w.py || "").split(/[,;/]/)[0].trim();
    if ([...w.h].length === 1) {
      for (const alt of w.alt || []) addReading(w.h, String(alt.py || "").trim());
      addReading(w.h, firstPy, true); // cách đọc chính của từ một chữ đứng đầu
    } else learnPairs(forms[0] || w.h, firstPy);
    for (const ex of w.ex || []) learnPairs(ex.zh, ex.py);
  }
}

/** Các cách đọc (pinyin có dấu, chữ thường) của một chữ Hán, học từ từ điển + câu ví dụ đã nạp. */
export function charPinyin(ch) {
  return [...(charReadings.get(ch) || [])];
}

// ---------------- Tách câu ----------------

const PUNCT_RE = /[\p{P}\p{S}]/u;

/**
 * Tách câu thành từ: khớp dài nhất theo từ điển đã nạp. Dấu câu là mảnh riêng, bỏ khoảng trắng;
 * chữ số / chữ Latin liền nhau gom một mảnh. "我爱我的妈妈。" -> ["我","爱","我","的","妈妈","。"]
 */
export function segment(sentence) {
  const chars = [...String(sentence || "")];
  const tokens = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (!isHan(ch)) {
      if (PUNCT_RE.test(ch)) {
        tokens.push(ch);
        i += 1;
        continue;
      }
      let j = i;
      while (j < chars.length && !isHan(chars[j]) && !PUNCT_RE.test(chars[j]) && !/\s/.test(chars[j])) j += 1;
      tokens.push(chars.slice(i, j).join(""));
      i = j;
      continue;
    }
    let taken = 1;
    for (let len = Math.min(maxWordLen, chars.length - i); len > 1; len -= 1) {
      if (segDict.has(chars.slice(i, i + len).join(""))) {
        taken = len;
        break;
      }
    }
    tokens.push(chars.slice(i, i + taken).join(""));
    i += taken;
  }
  return tokens;
}

export function isPunct(token) {
  return /^[\p{P}\p{S}]+$/u.test(token || "");
}

// ---------------- Tìm kiếm ----------------

const squash = (s) => s.replace(/[\s'’\-·.]/g, "");
const wordsPad = (s) => ` ${s.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

function keysOf(w) {
  let k = searchKeys.get(w.id);
  if (k) return k;
  const py = squash(stripTones(w.py || ""));
  const vi = String(w.vi || "").toLowerCase();
  const en = String(w.en || "").toLowerCase();
  k = {
    py,
    pyU: py.includes("v") ? py.replace(/v/g, "u") : "",
    pn: squash(String(w.pn || "").toLowerCase()).replace(/u:/g, "v"),
    vi,
    viF: foldVi(vi),
    viSegs: vi.split(/[,;]/).map((s) => s.replace(/[（(].*?[)）]/g, "").trim()).filter(Boolean),
    en,
    enSegs: en.split(/[,;]/).map((s) => s.replace(/[（(].*?[)）]/g, "").trim().replace(/^to /, "")).filter(Boolean),
  };
  k.viPad = wordsPad(k.vi);
  k.viFPad = wordsPad(k.viF);
  k.viFSegs = k.viSegs.map(foldVi);
  k.enPad = wordsPad(k.en);
  searchKeys.set(w.id, k);
  return k;
}

function scoreWord(w, q) {
  if (q.han) {
    if (w.h === q.raw) return 100;
    if (w.tr === q.raw) return 98;
    if (w.h.startsWith(q.raw)) return 80;
    if (w.h.includes(q.raw)) return 70;
    if ((w.tr || "").includes(q.raw)) return 65;
    return 0;
  }
  const k = keysOf(w);
  let s = 0;
  const up = (v) => {
    if (v > s) s = v;
  };
  if (q.pn) {
    if (k.pn === q.pn) up(92);
    else if (k.pn.startsWith(q.pn)) up(76);
  }
  if (q.py) {
    for (const key of [k.py, k.pyU]) {
      if (!key) continue;
      if (key === q.py) up(90);
      else if (key.startsWith(q.py)) up(75);
      else if (q.py.length >= 2 && key.includes(q.py)) up(50);
    }
  }
  if (k.vi) {
    if (k.viSegs.includes(q.low)) up(88);
    else if (k.viPad.includes(q.pad)) up(72);
    else if (k.vi.includes(q.low)) up(60);
    else if (k.viFSegs.includes(q.fold)) up(70);
    else if (k.viFPad.includes(q.foldPad)) up(58);
    else if (q.fold.length >= 2 && k.viF.includes(q.fold)) up(45);
  }
  if (k.en) {
    if (k.enSegs.includes(q.low) || k.enSegs.includes(q.low.replace(/^to /, ""))) up(85);
    else if (k.enPad.includes(q.pad)) up(65);
    else if (q.low.length >= 2 && k.en.includes(q.low)) up(40);
  }
  return s;
}

/**
 * Tìm trong các cấp ĐÃ nạp. Khớp chữ Hán (giản / phồn), pinyin không dấu bỏ khoảng trắng ("nihao", "ni3hao3"),
 * nghĩa Việt (có dấu hoặc không dấu), nghĩa Anh. Xếp theo độ khớp, rồi cấp, rồi độ thông dụng.
 * q rỗng -> trả danh sách theo thứ tự cấp. opts: { levels?: number|number[], limit?: number }
 */
export function search(q, { levels: only, limit } = {}) {
  const wanted = only == null ? null : new Set([].concat(only).map(normLevel));
  const list = wanted ? loadedLevels().filter((lv) => wanted.has(lv)).flatMap((lv) => levels.get(lv)) : allWords();
  const max = Number.isFinite(limit) && limit > 0 ? limit : Infinity;
  const raw = String(q ?? "").trim();
  if (!raw) return max === Infinity ? list : list.slice(0, max);
  const low = raw.toLowerCase();
  const fold = foldVi(low);
  const letters = squash(stripTones(low));
  const query = {
    raw,
    low,
    han: [...raw].some(isHan),
    pad: wordsPad(low),
    fold,
    foldPad: wordsPad(fold),
    py: /^[a-zv0-9:]+$/.test(letters) ? letters.replace(/u:/g, "v").replace(/[0-9]/g, "") : "",
    pn: /^[a-zv:]+[0-9][a-zv0-9:]*$/.test(letters) ? letters.replace(/u:/g, "v") : "",
  };
  const hits = [];
  for (const w of list) {
    const score = scoreWord(w, query);
    if (score > 0) hits.push({ w, score });
  }
  hits.sort((a, b) => b.score - a.score || a.w.lv - b.w.lv || (a.w.id < b.w.id ? -1 : 1));
  return (max === Infinity ? hits : hits.slice(0, max)).map((x) => x.w);
}

// ---------------- Tài liệu tra cứu ----------------

/** Đọc data/ref/<name>.json: "pinyin" | "tones" | "radicals" | "grammar-l1" … | "classifiers". Có nhớ đệm. */
export function loadRef(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(name))) return Promise.reject(new Error(`Tên tài liệu không hợp lệ: ${name}`));
  if (!refs.has(name)) {
    refs.set(
      name,
      getJson(`ref/${name}.json`).catch((err) => {
        refs.delete(name);
        throw err;
      }),
    );
  }
  return refs.get(name);
}
