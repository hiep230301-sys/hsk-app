// Tiện ích pinyin (JS thuần, không DOM): bỏ dấu, thanh điệu, tách âm tiết, phương án nhiễu thanh điệu.

const TONE_TABLE = {
  a: ["ā", "á", "ǎ", "à"], e: ["ē", "é", "ě", "è"], i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"], u: ["ū", "ú", "ǔ", "ù"], ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
};
const MARKED = {};
for (const [base, list] of Object.entries(TONE_TABLE)) {
  list.forEach((ch, idx) => {
    MARKED[ch] = { base, tone: idx + 1 };
    MARKED[ch.toUpperCase()] = { base: base.toUpperCase(), tone: idx + 1 };
  });
}

const HAN_RE = /\p{Script=Han}/u;
export function isHan(ch) {
  return HAN_RE.test(ch || "");
}

/** "Wǒ ài nǐ" -> "wo ai ni" (ü -> v để gõ được bằng bàn phím). Giữ nguyên độ dài chuỗi. */
export function stripTones(text = "") {
  let out = "";
  for (const ch of String(text).normalize("NFC")) out += MARKED[ch] ? MARKED[ch].base : ch;
  return out.toLowerCase().replace(/ü/g, "v");
}

/** Đưa cách viết "u:" của nguồn CC-CEDICT về "ü": "lu:è" -> "lüè". */
export function fixUmlaut(text = "") {
  return String(text).replace(/u:/g, "ü").replace(/U:/g, "Ü");
}

/** So khớp đáp án gõ pinyin: bỏ dấu, khoảng trắng, dấu câu, số thanh ("ni3 hao3" -> "nihao"). */
export function normalizeTyped(text = "") {
  return stripTones(text).replace(/u:/g, "v").replace(/[^a-zv]/g, "");
}

/** Dãy thanh điệu theo thứ tự các nguyên âm có dấu: "bàba" -> [4]. */
export function toneSequence(text = "") {
  const seq = [];
  for (const ch of String(text).normalize("NFC")) if (MARKED[ch]) seq.push(MARKED[ch].tone);
  return seq;
}

/** Thanh của một âm tiết: "wǒ" -> 3, "men" -> 0 (thanh nhẹ). */
export function toneOfSyllable(syl = "") {
  for (const ch of String(syl).normalize("NFC")) if (MARKED[ch]) return MARKED[ch].tone;
  return 0;
}

export function hasToneMarks(text = "") {
  return toneSequence(text).length > 0;
}

/** Bỏ dấu tiếng Việt để tìm kiếm: "Yêu, thích" -> "yeu, thich". */
export function foldVi(text = "") {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}

// ---------------- Tách âm tiết ----------------
// Bảng âm tiết hợp lệ (không dấu, ü viết v), sinh từ quy tắc ghép thanh mẫu – vận mẫu; hơi rộng hơn bảng chuẩn.
const SYL = new Set("a o e ai ei ao ou an en ang eng er".split(" "));
const addSyl = (inits, finals) => {
  for (const i of inits.split(" ")) for (const f of finals.split(" ")) SYL.add(i + f);
};
addSyl("b p m", "a o ai ei ao an en ang eng i ie iao ian in ing u");
addSyl("p m f", "ou");
addSyl("m", "e iu");
addSyl("f", "a o ei an en ang eng u");
addSyl("d t n l", "a e ai ei ao ou an ang eng ong i ie iao ian ing u uo uan un");
addSyl("d t", "ui");
addSyl("d n l", "iu");
addSyl("n l", "in iang v ve");
addSyl("d n", "en");
addSyl("d l", "ia");
addSyl("g k h", "a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang");
addSyl("zh ch sh r z c s", "a e i ai ei ao ou an en ang eng ong u uo ui uan un");
addSyl("zh ch sh", "ua uai uang");
addSyl("j q x", "i ia ie iao iu ian in iang ing iong u ue uan un v ve");
addSyl("y", "a e i o u ao ou an in ang ing ong ue uan un");
addSyl("w", "a o u ai ei an en ang eng");

function splitPlain(s, strict) {
  const memo = new Map();
  const go = (pos) => {
    if (pos === s.length) return [];
    if (memo.has(pos)) return memo.get(pos);
    let out = null;
    for (let len = Math.min(6, s.length - pos); len >= 1 && !out; len -= 1) {
      const cand = s.slice(pos, pos + len);
      let ok = SYL.has(cand);
      // Chính tả pinyin: âm tiết giữa từ bắt đầu bằng a/o/e phải có dấu cách âm (') -> không tự tách ở đó
      if (ok && strict && pos > 0 && /^[aoe]/.test(cand)) ok = false;
      if (!ok && cand === "r" && pos > 0) ok = true; // âm cuốn lưỡi 儿: "wánr"
      if (!ok) continue;
      const rest = go(pos + len);
      if (rest) out = [len, ...rest];
    }
    memo.set(pos, out);
    return out;
  };
  return go(0);
}

/**
 * Tách pinyin có dấu thành từng âm tiết (chữ thường):
 * "Wǒ ài wǒ de māma." -> ["wǒ","ài","wǒ","de","mā","ma"]; "nǚ'ér" -> ["nǚ","ér"]; "wánr" -> ["wán","r"].
 * Mảnh không phân tích được thì giữ nguyên một khối.
 */
export function splitSyllables(text = "") {
  const out = [];
  const tokens = fixUmlaut(text).normalize("NFC").toLowerCase().replace(/[^\p{L}\s'’]/gu, " ").split(/[\s'’]+/).filter(Boolean);
  for (const token of tokens) {
    const plain = stripTones(token);
    const lens = /^[a-z]+$/.test(plain) ? splitPlain(plain, true) || splitPlain(plain, false) : null;
    if (!lens) {
      out.push(token);
      continue;
    }
    let pos = 0;
    for (const len of lens) {
      out.push(token.slice(pos, pos + len));
      pos += len;
    }
  }
  return out;
}

function retone(text, position, newTone) {
  let idx = -1;
  let out = "";
  for (const ch of text) {
    if (MARKED[ch]) {
      idx += 1;
      if (idx === position) {
        const info = MARKED[ch];
        const lower = info.base.toLowerCase();
        const replaced = TONE_TABLE[lower][newTone - 1];
        out += info.base === lower ? replaced : replaced.toUpperCase();
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** Sinh tối đa `count` cách viết pinyin sai thanh điệu để làm phương án nhiễu. */
export function toneVariants(pinyin, count = 3) {
  const seq = toneSequence(pinyin);
  if (!seq.length) return [];
  const results = new Set();
  let guard = 0;
  while (results.size < count && guard < 60) {
    guard += 1;
    let variant = pinyin;
    const changes = seq.length === 1 ? 1 : 1 + Math.floor(Math.random() * Math.min(2, seq.length));
    const positions = shuffle([...seq.keys()]).slice(0, changes);
    for (const pos of positions) {
      const options = [1, 2, 3, 4].filter((t) => t !== seq[pos]);
      variant = retone(variant, pos, options[Math.floor(Math.random() * options.length)]);
    }
    if (variant !== pinyin) results.add(variant);
  }
  return [...results];
}

export const TONE_NAMES = ["nhẹ", "ngang", "sắc (lên)", "hỏi (xuống-lên)", "huyền (xuống)"];
export const TONE_NAMES_EN = ["neutral", "high level", "rising", "falling-rising", "falling"];

export function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
