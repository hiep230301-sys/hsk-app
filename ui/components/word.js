// Hiển thị một mục từ: nghĩa theo cài đặt gloss, nhãn rv, pinyin, thẻ chi tiết.
import { h, clear, add, toast } from "./dom.js";
import { t, lang } from "../i18n.js";
import * as A from "../api.js";
import { strokeAnimator } from "../writer.js";

/** Tô màu từng chữ Hán theo thanh điệu (dùng core/pinyin.js qua api.tonesOf). */
export function toneHanzi(zh, pnOrWord) {
  if (!zh || !A.toneColorsOn()) return zh || "";
  const tones = A.tonesOf(pnOrWord);
  if (!tones.length) return zh;
  let k = 0;
  return [...zh].map((ch) => {
    if (!A.isHan(ch)) return ch;
    const tn = tones[k++] || 5;
    return h(`span.tone-${tn}`, ch);
  });
}

/** Tô màu từng âm tiết pinyin theo thanh điệu. */
export function tonePinyin(py, pnOrWord) {
  if (!py || !A.toneColorsOn()) return py || "";
  const tones = A.tonesOf(pnOrWord || py);
  if (!tones.length) return py;
  const parts = String(py).split(/(\s+)/);
  let k = 0;
  const out = [];
  for (const seg of parts) {
    if (!seg) continue;
    if (/^\s+$/.test(seg)) {
      out.push(seg);
      continue;
    }
    // Nếu 1 chuỗi dính nhiều âm tiết (vd "xuéxiào"), tách theo thanh của từng âm tiết nếu có
    if (parts.filter((x) => x.trim()).length === 1 && tones.length > 1) {
      try {
        const syls = A.P.splitSyllables?.(seg);
        if (Array.isArray(syls) && syls.length === tones.length) {
          syls.forEach((s, idx) => out.push(h(`span.tone-${tones[idx]}`, s)));
          continue;
        }
      } catch {
        /* fallback */
      }
    }
    const tn = tones[k++] || A.P.toneOfSyllable?.(seg) || 5;
    out.push(h(`span.tone-${tn >= 1 && tn <= 5 ? tn : 5}`, seg));
  }
  return out;
}

export function speakerBtn(text, cls = "", opts) {
  return h(`button.icon-btn.speak${cls}`, { type: "button", "aria-label": t("c.listen"), title: t("c.listen"), onclick: (e) => (e.stopPropagation(), A.speak(text, opts)) }, "🔊");
}

/** Từ chưa có nghĩa Việt (rv:"todo" hoặc vi rỗng). */
export const noVi = (w) => !w?.vi || w.rv === "todo";

/** Nghĩa dạng chữ thuần (dùng cho phương án, hàng danh sách). */
export function glossText(w, mode = A.settings().gloss) {
  if (!w) return "";
  const vi = noVi(w) ? "" : w.vi;
  const en = w.en || "";
  if (mode === "en") return en || vi;
  if (mode === "both") return vi && en ? `${vi} · ${en}` : vi || en;
  return vi || en;
}

/**
 * Nghĩa trên một dòng, tách Việt / Anh thành phần tử riêng để tô màu khác nhau.
 * Có cả hai → [span.gl-vi, span.gl-sep, span.gl-en]; chỉ một thứ tiếng → chuỗi thuần (là nghĩa chính, không mờ).
 */
export function glossParts(vi, en, mode = A.settings().gloss) {
  vi = vi || "";
  en = en || "";
  const showVi = vi && mode !== "en";
  const showEn = en && (mode !== "vi" || !vi);
  if (showVi && showEn && mode === "both") return [h("span.gl-vi", { lang: "vi" }, vi), h("span.gl-sep", { "aria-hidden": "true" }, " · "), h("span.gl-en", { lang: "en" }, en)];
  return (mode === "en" ? en || vi : vi || en) || "";
}

/** Như glossText nhưng trả nút DOM (Việt + Anh tách span) — dùng cho phương án, ô ghép cặp, hàng danh sách. */
export function glossInline(w, mode = A.settings().gloss) {
  return w ? glossParts(noVi(w) ? "" : w.vi, w.en, mode) : "";
}

/** Nhãn nhỏ theo trạng thái duyệt. */
export function rvBadge(w) {
  if (!w) return null;
  if (w.rv === "ai") return h("span.rv.rv-ai", { title: t("rv.aiTitle") }, t("rv.ai"));
  if (noVi(w)) return h("span.rv.rv-todo", { title: t("rv.todoTitle") }, t("rv.todo"));
  return null;
}

/** Nghĩa dạng khối: Việt / Anh / cả hai + nhãn rv. */
export function glossNode(w, { mode = A.settings().gloss, badge = true, cls = "" } = {}) {
  const vi = noVi(w) ? "" : w.vi;
  const en = w.en || "";
  const showVi = vi && mode !== "en";
  const showEn = en && (mode !== "vi" || !vi);
  return h(
    `div.gloss${cls}`,
    showVi ? h("div.g-vi", { lang: "vi" }, vi) : null,
    showEn ? h(`div.g-en${showVi ? ".sub" : ""}`, { lang: "en" }, en) : null,
    !showVi && !showEn ? h("div.g-en", "—") : null,
    badge ? rvBadge(w) : null,
  );
}

/** Câu ví dụ: nghĩa theo gloss. */
export function exGloss(ex, mode = A.settings().gloss) {
  const out = [];
  if (ex.vi && mode !== "en") out.push(h("div.ex-vi", { lang: "vi" }, ex.vi));
  if (ex.en && (mode !== "vi" || !ex.vi)) out.push(h("div.ex-vi.en", { lang: "en" }, ex.en));
  return out;
}

/** Pinyin ở câu hỏi theo cài đặt: luôn hiện / chạm để gợi ý / ẩn. */
export function pinyinHint(py, { force = false, pn = null } = {}) {
  if (!py) return null;
  const mode = force ? "always" : A.settings().pinyin;
  if (mode === "off") return null;
  if (mode === "always") return h("div.py", tonePinyin(py, pn || py));
  const b = h("button.py.py-hint", { type: "button", "aria-label": t("c.showPinyin"), onclick: (e) => (e.stopPropagation(), b.replaceWith(h("div.py", tonePinyin(py, pn || py)))) }, `💡 ${t("c.showPinyin")}`);
  return b;
}

export function highlight(text, word) {
  if (!word || !text || !text.includes(word)) return text || "";
  const parts = text.split(word);
  const out = [];
  parts.forEach((p, i) => {
    out.push(p);
    if (i < parts.length - 1) out.push(h("mark", word));
  });
  return out;
}

export const posLabel = (p) => {
  const k = `pos.${p}`;
  const s = t(k);
  return s === k ? p : s;
};

export function strengthChip(id) {
  const s = A.strengthOf(id);
  return h(`span.chip.st-${s}`, t(`st.${s}`));
}

/** Thẻ từ đầy đủ (bài học + từ điển): pinyin tô thanh, nét viết, đánh dấu ⭐, thêm vào ôn tập, ví dụ, nguồn. */
export function wordCard(w, { inDict = false } = {}) {
  const chars = [...w.h].filter(A.isHan);
  const strokesBox = h("div.strokes");
  const showStrokes = () => {
    clear(strokesBox);
    chars.slice(0, 4).forEach((ch) => {
      const a = strokeAnimator(ch, 116);
      add(strokesBox, a.el);
      a.play();
    });
  };
  const bmBtn = h("button.icon-btn.bm-btn", {
    type: "button",
    "aria-label": t("w.bookmark"),
    "aria-pressed": String(A.isBookmarked(w.id)),
    title: t("w.bookmark"),
    onclick: () => {
      const on = A.toggleBookmark(w.id);
      bmBtn.textContent = on ? "⭐" : "☆";
      bmBtn.classList.toggle("on", on);
      bmBtn.setAttribute("aria-pressed", String(on));
      toast(on ? `⭐ ${t("w.bookmarked")}` : t("w.unbookmarked"));
    },
  }, A.isBookmarked(w.id) ? "⭐" : "☆");
  if (A.isBookmarked(w.id)) bmBtn.classList.add("on");

  // Từ đã có thẻ ôn: khóa nút (bấm lại = chấm "Nhớ" thêm một lượt, đẩy hạn ôn — lỗi KCS M4)
  const inReview = Boolean(A.cardOf(w.id));
  const addReviewBtn = inDict
    ? h("button.btn.small.add-rev", {
        type: "button",
        disabled: inReview,
        onclick: (e) => {
          const btn = e.currentTarget;
          if (btn.disabled || A.cardOf(w.id)) return;
          A.introduce(w.id, 0);
          btn.disabled = true;
          btn.textContent = `✓ ${t("w.inReview")}`;
          toast(`✓ ${t("w.addedReview")}`, "good");
        },
      }, inReview ? `✓ ${t("w.inReview")}` : `➕ ${t("w.addReview")}`)
    : null;

  const cl = (w.cl || []).map((c) => (typeof c === "string" ? c : c?.char || c?.h)).filter(Boolean);
  const src = w.src || {};
  const srcLine = [
    src.pdf ? `${t("w.srcPdf")}: ${String(src.pdf).replace("#", `, ${t("w.page")} `)}` : null,
    src.vi === "ai" || src.ex === "ai" ? t("w.srcAi") : null,
    t("w.srcOpen"),
  ].filter(Boolean);
  return h(
    "article.word-card",
    h(
      "div.wc-top",
      h("span.chip", { style: { background: `var(--lv${Math.min(7, Number(w.lv) || 1)})`, color: "var(--lv-ink)" } }, A.levelLabel(w.lv)),
      (w.pos || []).slice(0, 3).map((p) => h("span.chip.soft", posLabel(p))),
      strengthChip(w.id),
    ),
    h("div.wc-py", tonePinyin(w.py || "—", w)),
    h("div.wc-hz", { lang: "zh-CN", onclick: () => A.speakWord(w) }, toneHanzi(w.h, w)),
    w.tr && w.tr !== w.h ? h("div.wc-tr.muted.small", `${t("w.trad")}: `, h("span", { lang: "zh-Hant" }, w.tr)) : null,
    h(
      "div.wc-actions",
      h("button.icon-btn.speak", { type: "button", "aria-label": t("c.listen"), title: t("c.listen"), onclick: () => A.speakWord(w) }, "🔊"),
      h("button.btn.ghost.small", { type: "button", onclick: () => A.speakWord(w, { rate: 0.5 }) }, `🐢 ${t("c.slow")}`),
      chars.length ? h("button.btn.ghost.small", { type: "button", onclick: showStrokes }, `✍️ ${t("w.strokes")}`) : null,
      bmBtn,
      addReviewBtn,
    ),
    strokesBox,
    glossNode(w, { cls: ".wc-gloss" }),
    h(
      "dl.wc-meta",
      cl.length ? [h("dt", t("w.classifier")), h("dd", { lang: "zh-CN" }, cl.map((c) => h("button.cl-chip", { type: "button", onclick: () => A.speak(c) }, c)))] : null,
      w.rad ? [h("dt", t("w.radical")), h("dd", { lang: "zh-CN" }, w.rad)] : null,
      w.fq ? [h("dt", t("w.freq")), h("dd", `#${w.fq}`)] : null,
      (w.alt || []).length ? [h("dt", t("w.alt")), h("dd", w.alt.map((a) => h("div.small", h("b.py", a.py), " ", a.en || a.vi || "")))] : null,
    ),
    (w.ex || []).length
      ? h(
          "div.examples",
          h("div.eyebrow", t("w.examples")),
          w.ex.map((ex) =>
            h(
              "div.ex",
              { onclick: () => A.speak(ex.zh) },
              h("div.ex-zh", { lang: "zh-CN" }, highlight(ex.zh, w.h), " ", speakerBtn(ex.zh, ".mini")),
              ex.py ? h("div.ex-py", ex.py) : null,
              exGloss(ex),
            ),
          ),
        )
      : h("p.muted.small", t("w.noEx")),
    h("div.src", srcLine.join(" · ")),
  );
}

/** Hàng từ gọn trong danh sách. */
export function wordRow(w, onclick) {
  const s = A.strengthOf(w.id);
  return h(
    "button.word-row",
    { type: "button", onclick },
    h(`i.dot.st-${s}`, { title: t(`st.${s}`) }),
    h("b", { lang: "zh-CN" }, toneHanzi(w.h, w)),
    h("span.py", tonePinyin(w.py, w)),
    h("span.vi", glossInline(w), w.rv === "ai" ? h("sup.ai-mark", { title: t("rv.ai") }, " AI") : null),
    h("span.lv", Number(w.lv) >= 7 ? "7–9" : String(w.lv)),
  );
}

export const uiLang = lang;
