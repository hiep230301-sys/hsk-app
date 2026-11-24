// Chấm phát âm từ kết quả nhận dạng giọng nói (hàm thuần, không DOM).
import { stripTones, isHan } from "./pinyin.js";

export const PASS_SCORE = 70;

function sylPlain(s) {
  return stripTones(s).replace(/[^a-zv]/g, "");
}

function compareChar(target, heard, charPinyin) {
  if (!heard) return "bad";
  if (target === heard) return "ok";
  const tp = charPinyin(target) || [];
  const hp = charPinyin(heard) || [];
  if (!tp.length || !hp.length) return "bad";
  if (tp.some((a) => hp.includes(a))) return "ok"; // đồng âm, cùng thanh
  if (tp.some((a) => hp.some((b) => sylPlain(a) === sylPlain(b)))) return "tone";
  return "bad";
}

/**
 * So chữ máy nghe được với chữ mục tiêu (cho phép chữ đồng âm).
 * @param {string} target  từ / câu chữ Hán cần đọc
 * @param {string[]} alternatives  các phương án máy nhận dạng được
 * @param {(ch:string)=>string[]} charPinyin  hàm chữ -> các cách đọc (content.charPinyin)
 * @returns {{score:number, chars:{ch:string,status:"ok"|"tone"|"bad"}[], heard:string}}  score 0–100
 */
export function scorePronunciation(target, alternatives, charPinyin = () => []) {
  const alts = (Array.isArray(alternatives) ? alternatives : [alternatives]).filter((a) => typeof a === "string");
  const tChars = [...String(target || "")].filter(isHan);
  let best = { score: 0, chars: tChars.map((ch) => ({ ch, status: "bad" })), heard: alts[0] || "" };
  for (const alt of alts) {
    const hChars = [...alt].filter(isHan);
    const span = Math.max(1, hChars.length - tChars.length + 1);
    for (let off = 0; off < span; off += 1) {
      const chars = tChars.map((ch, i) => ({ ch, status: compareChar(ch, hChars[off + i], charPinyin) }));
      const pts = chars.reduce((s, c) => s + (c.status === "ok" ? 1 : c.status === "tone" ? 0.5 : 0), 0);
      let score = Math.round((pts / Math.max(1, tChars.length)) * 100);
      if (hChars.length > tChars.length + 2) score = Math.max(0, score - 10); // nói thừa nhiều chữ: trừ nhẹ
      if (score > best.score) best = { score, chars, heard: alt };
    }
  }
  return best;
}
