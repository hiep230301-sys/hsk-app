// Chia bài, sinh câu hỏi (OBJECT thuần, không render) và chấm câu trả lời. Không đụng DOM.
//
// Question = { qid, type, wordIds:[], prompt:{ zh?, py?, vi?, en?, audio?, sentence?, blanks? },
//              options?:[{ key, label, zh?, py?, vi?, en? }], answer, meta? }
// Xem bảng "Hình dạng Question theo type" trong core/README.md.
import { shuffle, toneVariants, hasToneMarks, normalizeTyped, splitSyllables, toneOfSyllable, toneSequence, isHan, fixUmlaut } from "./pinyin.js";
import { levelWords, levelCount, loadedLevels, allWords, segment, isPunct, charPinyin, normLevel } from "./content.js";
import { scorePronunciation, PASS_SCORE } from "./scoring.js";

export const UNIT_SIZE = 8;
export const TYPES = ["meaning", "hanzi", "listen", "tone", "typing", "match", "fill", "order", "speak", "write"];
export const TYPE_LABEL = {
  meaning: { vi: "Chọn nghĩa", en: "Pick the meaning" },
  hanzi: { vi: "Chọn chữ Hán", en: "Pick the characters" },
  listen: { vi: "Nghe chọn từ", en: "Listen and pick" },
  tone: { vi: "Chọn thanh điệu", en: "Pick the tones" },
  typing: { vi: "Gõ pinyin", en: "Type the pinyin" },
  match: { vi: "Ghép cặp", en: "Match pairs" },
  fill: { vi: "Điền từ vào câu", en: "Fill in the blank" },
  order: { vi: "Sắp xếp câu", en: "Order the sentence" },
  speak: { vi: "Luyện nói", en: "Speak" },
  write: { vi: "Viết chữ", en: "Write the characters" },
};
export const PLACEMENT_SIZE = 15;
const MATCH_MAX_MISTAKES = 1;
const WRITE_MISTAKES_PER_CHAR = 3;

let qSeq = 0;
const nextQid = (type) => `q${(qSeq += 1)}-${type}`;

// ---------------- Chia bài ----------------

/** Số bài của cấp (8 từ / bài). Dùng số từ đã nạp; chưa nạp thì theo index.json. */
export function unitsOf(lv) {
  return Math.ceil(levelCount(lv) / UNIT_SIZE);
}

/** Các từ của bài `u` (từ 0) trong cấp `lv`; cấp chưa nạp trả []. */
export function unitWords(lv, u) {
  const start = Math.max(0, Math.floor(Number(u) || 0)) * UNIT_SIZE;
  return levelWords(lv).slice(start, start + UNIT_SIZE);
}

// ---------------- Tiện ích ----------------

/** Nghĩa Anh của CC-CEDICT thường rất dài: nhãn phương án chỉ lấy 2 ý đầu. */
const shortEn = (w) => String(w.en || "").split(";").slice(0, 2).map((s) => s.trim()).filter(Boolean).join("; ");
const gloss = (w) => w.vi || shortEn(w);
const hanChars = (text) => [...String(text || "")].filter(isHan);
const firstPy = (w) => fixUmlaut(w.py || "").split(/[,;/]/)[0].trim();
const audioUrlOf = (w) => w.au?.w || null;

/** Phương án nhiễu: cùng cấp (hoặc `pool`), ưu tiên cùng từ loại và cùng độ dài; không trùng nhãn với đáp án. */
export function distractors(word, count = 3, pool = null, key = (w) => w.h) {
  let base = pool && pool.length > count + 2 ? pool : levelWords(word.lv);
  if (base.length <= count) base = [...new Set([...base, ...(pool || []), ...allWords()])];
  const target = key(word);
  const seen = new Set([target]);
  const pos = new Set(word.pos || []);
  const len = [...word.h].length;
  const scored = base
    .filter((w) => w.id !== word.id)
    .map((w) => {
      let score = Math.random();
      if ((w.pos || []).some((p) => pos.has(p))) score += 1;
      if ([...w.h].length === len) score += 0.8;
      if (w.lv === word.lv) score += 0.5;
      return { w, score };
    })
    .sort((a, b) => b.score - a.score);
  const out = [];
  for (const { w } of scored) {
    const k = key(w);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= count) break;
  }
  return out;
}

const glossOption = (w) => ({ key: w.id, label: gloss(w), vi: w.vi || "", en: shortEn(w) });
const zhOption = (w) => ({ key: w.id, label: w.h, zh: w.h, py: w.py || "" });

function exampleWithWord(word) {
  return (word.ex || []).find((ex) => ex.zh && ex.zh.includes(word.h)) || null;
}

/** Tách câu thành 3–7 mảnh (bỏ dấu câu) cho bài sắp xếp. */
export function sentenceTiles(sentence) {
  const tokens = segment(sentence).filter((t) => !isPunct(t));
  while (tokens.length > 7) {
    let best = 0;
    let bestLen = Infinity;
    for (let k = 0; k < tokens.length - 1; k += 1) {
      const len = tokens[k].length + tokens[k + 1].length;
      if (len < bestLen) {
        bestLen = len;
        best = k;
      }
    }
    tokens.splice(best, 2, tokens[best] + tokens[best + 1]);
  }
  return tokens;
}

function orderExample(word) {
  return (word.ex || []).find((ex) => ex.zh && sentenceTiles(ex.zh).length >= 3) || null;
}

/** Từ này có làm được dạng bài `type` không (chỉ xét dữ liệu; khả năng thiết bị do UI quyết). */
export function canDo(type, word) {
  if (!word || !word.h) return false;
  switch (type) {
    case "meaning":
    case "hanzi":
      return Boolean(gloss(word));
    case "tone":
      return hasToneMarks(firstPy(word)) && !/[,;/]/.test(word.py || "");
    case "typing":
      return normalizeTyped(firstPy(word)).length > 0;
    case "fill":
      return Boolean(exampleWithWord(word));
    case "order":
      return Boolean(orderExample(word));
    case "write":
      return hanChars(word.h).length >= 1 && hanChars(word.h).length <= 3;
    case "listen":
    case "speak":
    case "match":
      return true;
    default:
      return false;
  }
}

// ---------------- Sinh từng dạng câu hỏi ----------------

function choice(type, word, pool, prompt, kind) {
  const mk = kind === "gloss" ? glossOption : zhOption;
  const wrong = distractors(word, 3, pool, kind === "gloss" ? gloss : (w) => w.h);
  return {
    qid: nextQid(type),
    type,
    wordIds: [word.id],
    prompt,
    options: shuffle([word, ...wrong]).map(mk),
    answer: word.id,
    meta: { lv: word.lv, audioUrl: audioUrlOf(word) },
  };
}

const builders = {
  meaning: (w, ctx) => choice("meaning", w, ctx.pool, { zh: w.h, py: w.py || "", audio: w.h }, "gloss"),
  hanzi: (w, ctx) => choice("hanzi", w, ctx.pool, { vi: w.vi || "", en: w.en || "" }, "zh"),
  listen: (w, ctx) => choice("listen", w, ctx.pool, { audio: w.h }, "zh"),

  tone(w) {
    const py = firstPy(w);
    const labels = shuffle([py, ...toneVariants(py, 3)]);
    const options = labels.map((label, i) => ({ key: `t${i}`, label }));
    return {
      qid: nextQid("tone"),
      type: "tone",
      wordIds: [w.id],
      prompt: { zh: w.h, vi: w.vi || "", en: w.en || "", audio: w.h },
      options,
      answer: options.find((o) => o.label === py).key,
      meta: { lv: w.lv, py, audioUrl: audioUrlOf(w) },
    };
  },

  typing(w) {
    return {
      qid: nextQid("typing"),
      type: "typing",
      wordIds: [w.id],
      prompt: { zh: w.h, vi: w.vi || "", en: w.en || "", audio: w.h },
      answer: fixUmlaut(w.py),
      meta: { lv: w.lv, audioUrl: audioUrlOf(w) },
    };
  },

  match(w, ctx) {
    const group = ctx.group && ctx.group.length >= 2 ? ctx.group : [w, ...distractors(w, 3, ctx.pool, gloss)];
    const seen = new Set();
    const set = group.filter((x) => gloss(x) && !seen.has(gloss(x)) && seen.add(gloss(x))).slice(0, 5);
    const answer = {};
    set.forEach((x) => (answer[x.id] = x.id));
    return {
      qid: nextQid("match"),
      type: "match",
      wordIds: set.map((x) => x.id),
      prompt: {},
      options: shuffle(set).map(zhOption), // cột trái: chữ Hán
      answer, // key trái -> key phải (cùng mã từ)
      meta: { lv: w.lv, right: shuffle(set).map(glossOption), maxMistakes: MATCH_MAX_MISTAKES }, // cột phải: nghĩa
    };
  },

  fill(w, ctx) {
    const ex = exampleWithWord(w);
    const parts = ex.zh.split(w.h);
    const blanks = [];
    let at = 0;
    parts.slice(0, -1).forEach((p) => {
      at += p.length;
      blanks.push({ start: at, length: w.h.length });
      at += w.h.length;
    });
    const q = choice("fill", w, ctx.pool, { sentence: ex.zh, blanks, vi: ex.vi || "", en: ex.en || "" }, "zh");
    q.meta = { ...q.meta, parts, zh: ex.zh, py: ex.py || "" };
    return q;
  },

  order(w) {
    const ex = orderExample(w);
    const tiles = sentenceTiles(ex.zh);
    const answer = tiles.join("");
    let order = shuffle(tiles.map((label, i) => ({ label, i })));
    for (let n = 0; n < 5 && order.map((o) => o.label).join("") === answer; n += 1) order = shuffle(order);
    if (order.map((o) => o.label).join("") === answer) order.push(order.shift());
    return {
      qid: nextQid("order"),
      type: "order",
      wordIds: [w.id],
      prompt: { vi: ex.vi || "", en: ex.en || "" },
      options: order.map((o, k) => ({ key: `k${k}`, label: o.label, zh: o.label })),
      answer, // chuỗi ghép đúng (không dấu câu)
      meta: { lv: w.lv, zh: ex.zh, py: ex.py || "", tiles },
    };
  },

  speak(w) {
    return {
      qid: nextQid("speak"),
      type: "speak",
      wordIds: [w.id],
      prompt: { zh: w.h, py: w.py || "", vi: w.vi || "", en: w.en || "", audio: w.h },
      answer: w.h,
      meta: { lv: w.lv, passScore: PASS_SCORE, audioUrl: audioUrlOf(w) },
    };
  },

  write(w) {
    const chars = hanChars(w.h).slice(0, 3);
    return {
      qid: nextQid("write"),
      type: "write",
      wordIds: [w.id],
      prompt: { py: w.py || "", vi: w.vi || "", en: w.en || "", audio: w.h },
      answer: chars, // các chữ cần viết, theo thứ tự
      meta: { lv: w.lv, maxMistakes: chars.length * WRITE_MISTAKES_PER_CHAR, audioUrl: audioUrlOf(w) },
    };
  },
};

/** Sinh một câu hỏi. ctx: { pool?: Word[], group?: Word[] (cho match) }. Không làm được thì trả null. */
export function makeQuestion(type, word, ctx = {}) {
  if (!builders[type] || !canDo(type, word)) return null;
  return builders[type](word, { ...ctx, pool: ctx.pool || levelWords(word.lv) });
}

function firstPossible(types, word, allowed) {
  return types.find((t) => allowed(t) && canDo(t, word)) || (canDo("meaning", word) ? "meaning" : "listen");
}

function allowFn(opts = {}) {
  const off = new Set(TYPES.filter((t) => opts[t] === false));
  return (t) => !off.has(t);
}

// ---------------- Kế hoạch bài ----------------

/**
 * Bài học mới (thường 8 từ): làm quen -> ghép cặp -> củng cố -> sắp xếp câu, nói, viết.
 * opts: tắt dạng bài theo thiết bị, vd { speak:false, listen:false, write:false }.
 */
export function lessonPlan(words, pool, opts = {}) {
  const ok = allowFn(opts);
  const list = (words || []).filter(Boolean);
  const q = [];
  const phase1 = list.map((w, i) => makeQuestion(i % 2 ? firstPossible(["listen", "meaning"], w, ok) : firstPossible(["meaning"], w, ok), w, { pool }));
  const phase2 = list.map((w) => makeQuestion(firstPossible(shuffle(["hanzi", "tone", "fill", "typing"]), w, ok), w, { pool }));
  q.push(...shuffle(phase1));
  if (list.length >= 3 && ok("match")) q.push(makeQuestion("match", list[0], { pool, group: shuffle(list).slice(0, 5) }));
  q.push(...shuffle(phase2));
  const extra = shuffle(list);
  const orderWord = ok("order") && extra.find((w) => canDo("order", w));
  if (orderWord) q.push(makeQuestion("order", orderWord, { pool }));
  if (ok("speak") && extra[0]) q.push(makeQuestion("speak", extra[0], { pool }));
  const writeWord = ok("write") && extra.find((w) => hanChars(w.h).length <= 2 && canDo("write", w));
  if (writeWord) q.push(makeQuestion("write", writeWord, { pool }));
  return q.filter(Boolean);
}

/** Ôn tập theo độ nhớ: càng nhớ chắc càng dùng dạng khó. strengthOf(id) -> "new"|"learning"|"known"|"mastered". */
export function reviewPlan(words, pool, strengthOf = () => "learning", opts = {}) {
  const ok = allowFn(opts);
  const list = (words || []).filter(Boolean);
  const q = list.map((w) => {
    const s = strengthOf(w.id);
    const types =
      s === "known"
        ? shuffle(["fill", "typing", "hanzi", "listen", "tone"])
        : s === "mastered"
          ? shuffle(["typing", "fill", "order", "listen"])
          : shuffle(["meaning", "listen", "hanzi", "tone"]);
    return makeQuestion(firstPossible(types, w, ok), w, { pool });
  });
  if (list.length >= 4 && ok("match")) q.splice(Math.floor(q.length / 2), 0, makeQuestion("match", list[0], { pool, group: shuffle(list).slice(0, 5) }));
  return q.filter(Boolean);
}

/** Luyện một dạng bài. match: mỗi câu 3–5 từ, tối đa 4 câu. */
export function drillPlan(type, words, pool) {
  const list = shuffle((words || []).filter(Boolean));
  if (type === "match") {
    const q = [];
    for (let i = 0; i + 3 <= list.length && q.length < 4; i += 5) q.push(makeQuestion("match", list[i], { pool, group: list.slice(i, i + 5) }));
    return q.filter(Boolean);
  }
  return list.map((w) => makeQuestion(type, w, { pool })).filter(Boolean);
}

/** Câu thay thế khi làm sai (đổi dạng meaning <-> hanzi), cho UI muốn hỏi lại bằng dạng khác. */
export function retryQuestion(question, word, pool) {
  return makeQuestion(question.type === "meaning" ? "hanzi" : "meaning", word, { pool }) || makeQuestion("listen", word, { pool });
}

// ---------------- Xếp lớp, thi thử ----------------

/**
 * 15 câu trắc nghiệm trải đều từ cấp 1 -> 7 (theo các cấp ĐÃ nạp — gọi loadAll() trước), khó dần.
 * Mỗi câu có meta.lv và meta.placement = true. Chưa nạp cấp nào -> [].
 */
export function placementPlan() {
  const lvs = loadedLevels().filter((lv) => levelWords(lv).some((w) => canDo("meaning", w)));
  if (!lvs.length) return [];
  const per = new Map(lvs.map((lv) => [lv, Math.floor(PLACEMENT_SIZE / lvs.length)]));
  for (let k = 0, rest = PLACEMENT_SIZE - lvs.length * Math.floor(PLACEMENT_SIZE / lvs.length); k < rest; k += 1) per.set(lvs[k % lvs.length], per.get(lvs[k % lvs.length]) + 1);
  const plan = [];
  for (const lv of lvs) {
    const pool = levelWords(lv);
    // Ưu tiên nửa thông dụng của cấp để câu hỏi đại diện cho cấp
    const usable = pool.filter((w) => canDo("meaning", w));
    const common = usable.slice(0, Math.max(per.get(lv), Math.ceil(usable.length / 2)));
    shuffle(common)
      .slice(0, per.get(lv))
      .forEach((w, i) => {
        const q = makeQuestion(i % 2 ? "hanzi" : "meaning", w, { pool });
        q.meta = { ...q.meta, lv, placement: true };
        plan.push(q);
      });
  }
  return plan;
}

/** Thống kê xếp lớp: { level, right, total, perLevel: { [lv]: { right, total } } }. */
export function placementDetail(answers) {
  const perLevel = {};
  let right = 0;
  let total = 0;
  for (const a of answers || []) {
    if (!a) continue;
    const q = a.question || a.q || a;
    const lv = normLevel(a.lv ?? q.meta?.lv ?? q.lv ?? 1);
    const e = (perLevel[lv] = perLevel[lv] || { right: 0, total: 0 });
    e.total += 1;
    total += 1;
    if (a.correct) {
      e.right += 1;
      right += 1;
    }
  }
  // Cấp đề xuất = cấp đầu tiên chưa vững (đúng < 60 %). Đúng một nửa mà cấp kế tiếp đúng hết thì coi là lỡ tay, cho qua.
  const lvs = Object.keys(perLevel).map(Number).sort((a, b) => a - b);
  const ratio = (lv) => perLevel[lv].right / perLevel[lv].total;
  let level = lvs.length ? Math.min(7, lvs[lvs.length - 1]) : 1;
  for (let i = 0; i < lvs.length; i += 1) {
    const r = ratio(lvs[i]);
    if (r >= 0.6) continue;
    const next = lvs[i + 1];
    if (r >= 0.5 && next !== undefined && ratio(next) === 1) continue;
    level = lvs[i];
    break;
  }
  return { level, right, total, perLevel };
}

/**
 * Cấp đề xuất (1..7) từ kết quả xếp lớp.
 * answers: [{ lv, correct }] hoặc [{ question, correct }] / [{ q, correct }] (lấy question.meta.lv).
 */
export function placementResult(answers) {
  return placementDetail(answers).level;
}

/** Đề thi thử `n` câu của cấp `lv` (cấp phải đã nạp; chưa nạp -> []). Trộn 6 dạng tự chấm được. opts như lessonPlan. */
export function testPlan(lv, n = 20, opts = {}) {
  const ok = allowFn(opts);
  const pool = levelWords(lv);
  const cycle = ["meaning", "hanzi", "listen", "tone", "fill", "typing"];
  return shuffle(pool)
    .slice(0, Math.max(0, n))
    .map((w, i) => {
      const rotated = [...cycle.slice(i % cycle.length), ...cycle.slice(0, i % cycle.length)];
      const q = makeQuestion(firstPossible(rotated, w, ok), w, { pool });
      if (q) q.meta = { ...q.meta, test: true };
      return q;
    })
    .filter(Boolean);
}

// ---------------- Chấm ----------------

function responseKey(question, response) {
  if (response && typeof response === "object") return response.key ?? null;
  if (typeof response === "number") return question.options?.[response]?.key ?? null;
  return response ?? null;
}

function typedTones(text) {
  const digits = String(text).match(/[1-5]/g);
  if (digits) return { kind: "digits", seq: digits.map((d) => (d === "5" ? 0 : Number(d))) };
  const marks = toneSequence(text);
  return marks.length ? { kind: "marks", seq: marks } : null;
}

function checkTyping(question, response) {
  const typed = String(response?.text ?? response ?? "").trim();
  if (!typed) return { correct: false };
  const letters = normalizeTyped(typed);
  const target = String(question.answer || "").split(/[,;/]/).map((s) => s.trim()).filter(Boolean).find((alt) => normalizeTyped(alt) === letters);
  if (!target) return { correct: false, note: `Đáp án: ${question.answer}`, noteEn: `Answer: ${question.answer}` };
  const tones = typedTones(typed);
  if (!tones) return { correct: true, note: `Đúng âm: ${target}. Lần sau thử gõ cả số thanh nhé!`, noteEn: `Right sounds: ${target}. Try adding tone numbers next time!` };
  const full = splitSyllables(target).map(toneOfSyllable);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const tonesOk = tones.kind === "digits" ? same(tones.seq, full) || same(tones.seq, full.filter(Boolean)) : same(tones.seq, toneSequence(target));
  return tonesOk ? { correct: true } : { correct: true, note: `Đúng âm nhưng sai thanh: ${target}`, noteEn: `Right sounds, wrong tones: ${target}`, toneError: true };
}

function checkMatch(question, response) {
  const max = question.meta?.maxMistakes ?? MATCH_MAX_MISTAKES;
  let mistakes;
  if (typeof response === "number") mistakes = response;
  else if (Array.isArray(response)) mistakes = response.filter(([l, r]) => question.answer[l] !== r).length; // [[keyTrái, keyPhải], ...]
  else if (response && typeof response === "object") mistakes = Number(response.mistakes) || 0;
  else return { correct: false };
  const correct = mistakes <= max;
  return mistakes ? { correct, mistakes, note: `Ghép sai ${mistakes} lần`, noteEn: `${mistakes} wrong match${mistakes > 1 ? "es" : ""}` } : { correct, mistakes };
}

function checkOrder(question, response) {
  const byKey = new Map((question.options || []).map((o) => [o.key, o.label]));
  const items = Array.isArray(response) ? response : response && typeof response === "object" ? response.order || response.keys || [] : [response ?? ""];
  const built = items.map((x) => (x && typeof x === "object" ? x.label ?? byKey.get(x.key) ?? "" : byKey.get(x) ?? String(x))).join("");
  const clean = (s) => [...s].filter((c) => !isPunct(c) && !/\s/.test(c)).join("");
  const correct = clean(built) === clean(question.answer);
  return correct ? { correct } : { correct, note: question.meta?.zh || question.answer, noteEn: question.meta?.zh || question.answer };
}

function checkSpeak(question, response) {
  if (response == null || response.skipped) return { correct: true, skipped: true };
  const pass = question.meta?.passScore ?? PASS_SCORE;
  let score;
  let detail = null;
  if (typeof response === "number") score = response;
  else if (Array.isArray(response) || typeof response === "string" || response.alternatives) {
    detail = scorePronunciation(question.answer, Array.isArray(response) || typeof response === "string" ? response : response.alternatives, charPinyin);
    score = detail.score;
  } else score = Number(response.score) || 0;
  const out = { correct: score >= pass, score, note: `Phát âm ${score}/100`, noteEn: `Pronunciation ${score}/100` };
  if (detail) out.detail = detail;
  return out;
}

function checkWrite(question, response) {
  if (response == null || response.skipped) return { correct: true, skipped: true };
  const mistakes = typeof response === "number" ? response : Number(response.mistakes) || 0;
  const max = question.meta?.maxMistakes ?? question.answer.length * WRITE_MISTAKES_PER_CHAR;
  return { correct: mistakes <= max, mistakes, note: `Sai ${mistakes} nét`, noteEn: `${mistakes} stroke mistake${mistakes === 1 ? "" : "s"}` };
}

/**
 * Chấm một câu. Trả về { correct, note?, noteEn?, ... }.
 * response theo type:
 *  - meaning | hanzi | listen | tone | fill: key của phương án (hoặc { key } hoặc chỉ số phương án)
 *  - typing: chuỗi pinyin người học gõ (không dấu / có dấu / số thanh đều được)
 *  - match: số lần ghép sai (hoặc { mistakes } hoặc [[keyTrái, keyPhải], ...])
 *  - order: mảng key (hoặc mảng nhãn, hoặc chuỗi đã ghép)
 *  - speak: { alternatives: string[] } (core tự chấm) | { score } | số điểm | { skipped:true }
 *  - write: số nét sai (hoặc { mistakes }) | { skipped:true }
 */
export function check(question, response) {
  if (!question) return { correct: false };
  switch (question.type) {
    case "typing":
      return checkTyping(question, response);
    case "match":
      return checkMatch(question, response);
    case "order":
      return checkOrder(question, response);
    case "speak":
      return checkSpeak(question, response);
    case "write":
      return checkWrite(question, response);
    default: {
      const key = responseKey(question, response);
      return { correct: key != null && key === question.answer };
    }
  }
}
