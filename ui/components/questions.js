// Renderer cho từng type Question của core (xem core/lesson.js). UI chỉ hiện + thu câu trả lời,
// chấm bằng core `check(question, response)`. renderQuestion trả về hàm xử lý phím (hoặc null).
import { h, clear, beep, vibrate, add } from "./dom.js";
import { t, lang } from "../i18n.js";
import * as A from "../api.js";
import { glossInline, glossParts, glossNode, pinyinHint, rvBadge, toneHanzi, tonePinyin } from "./word.js";
import { strokeQuiz } from "../writer.js";

const TONE_PATHS = {
  1: "M3 7 L35 7",
  2: "M3 20 Q19 13 35 6",
  3: "M3 16 Q17 25 35 11",
  4: "M3 6 L35 22",
  5: "M16 14 A3 3 0 1 0 22 14 A3 3 0 1 0 16 14",
};

function miniToneSvg(label) {
  const tn = A.P.toneOfSyllable?.(String(label || "").trim());
  const d = TONE_PATHS[tn];
  if (!d || String(label || "").trim().includes(" ")) return null;
  return h("span.tone-curve", {
    "aria-hidden": "true",
    html: `<svg width="38" height="26" viewBox="0 0 38 26"><path d="${d}" fill="none" stroke="var(--tone-${tn})" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  });
}

const noteOf = (r) => (lang() === "en" ? r.noteEn || r.note : r.note) || null;
const wordOf = (q) => A.getWord((q.wordIds || [])[0]);
const audioOpts = (q, extra = {}) => ({ audioUrl: q.meta?.audioUrl || undefined, ...extra });
const say = (q, extra) => A.speak(q.prompt?.audio || q.prompt?.zh || wordOf(q)?.h, audioOpts(q, extra));

function speakBtn(q) {
  return h("button.icon-btn.speak", { type: "button", "aria-label": t("c.listen"), title: t("c.listen"), onclick: () => say(q) }, "🔊");
}

/** Chữ Hán của đề + pinyin theo cài đặt. */
function hanziBlock(zh, py, { pinyin = true, force = false, word = null } = {}) {
  const showTone = pinyin && A.settings().pinyin === "always";
  return h(
    "div.hz-prompt.big",
    pinyin ? pinyinHint(py, { force, pn: word || py }) : null,
    h("div.hz", { lang: "zh-CN" }, showTone && word ? toneHanzi(zh, word) : zh),
  );
}

/** Nghĩa (Việt / Anh theo cài đặt) của đề: ưu tiên mục từ, không có thì lấy prompt.vi / prompt.en. */
function meaningBlock(q, { cls = ".vi-sub", fromWord = true } = {}) {
  const w = fromWord ? wordOf(q) : null;
  if (w) return glossNode(w, { cls });
  const g = A.settings().gloss;
  const { vi, en } = q.prompt || {};
  return h(`div.gloss${cls}`, vi && g !== "en" ? h("div.g-vi", { lang: "vi" }, vi) : null, en && (g !== "vi" || !vi) ? h(`div.g-en${vi && g !== "en" ? ".sub" : ""}`, { lang: "en" }, en) : null);
}

/** Nhãn một phương án: phương án nghĩa → theo cài đặt gloss; còn lại dùng label của core. */
function optionLabel(q, o) {
  if (o.zh) return h("b", { lang: "zh-CN" }, o.zh);
  if (q.type === "tone") return h("span.py-opt-wrap", h("span.py-opt", tonePinyin(o.label, o.label)), miniToneSvg(o.label));
  const w = A.getWord(o.key);
  if (w) return h("span", glossInline(w), w.rv === "ai" ? h("sup.ai-mark", { title: t("rv.ai") }, " AI") : null);
  const g = A.settings().gloss;
  const parts = glossParts(o.vi, o.en, g);
  return h("span", Array.isArray(parts) || parts ? parts : o.label);
}

/** Lưới phương án 1–4; chọn là chấm ngay bằng core. */
function optionGrid(q, done, { onPicked, silent = false } = {}) {
  let locked = false;
  const zh = Boolean(q.options?.[0]?.zh);
  const buttons = (q.options || []).map((o, idx) =>
    h(
      `button.opt${zh ? ".zh" : ""}`,
      {
        type: "button",
        onclick: () => {
          if (locked) return;
          locked = true;
          const r = A.check(q, o.key);
          if (!silent) {
            buttons[idx].classList.add(r.correct ? "right" : "wrong");
            if (!r.correct) q.options.forEach((x, k) => A.check(q, x.key).correct && buttons[k].classList.add("right"));
          } else {
            buttons[idx].classList.add("picked");
          }
          buttons.forEach((b) => (b.disabled = true));
          onPicked?.(r);
          done({ correct: r.correct, note: noteOf(r) });
        },
      },
      h("span.key", { "aria-hidden": "true" }, String(idx + 1)),
      optionLabel(q, o),
    ),
  );
  const grid = h("div.opts", { role: "group" }, buttons);
  grid.keyHandler = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= buttons.length) buttons[n - 1].click();
  };
  return grid;
}

const R = {
  meaning(q, host, done, opts = {}) {
    add(host, h("div.prompt-row", hanziBlock(q.prompt.zh, q.prompt.py, { word: wordOf(q) }), speakBtn(q)));
    const grid = optionGrid(q, done, opts);
    add(host, grid);
    setTimeout(() => say(q), 250);
    return grid.keyHandler;
  },

  hanzi(q, host, done, opts = {}) {
    add(host, meaningBlock(q, { cls: ".vi-prompt" }));
    const grid = optionGrid(q, done, { ...opts, onPicked: () => !opts.silent && say({ ...q, prompt: { audio: wordOf(q)?.h } }) });
    add(host, grid);
    return grid.keyHandler;
  },

  listen(q, host, done, opts = {}) {
    add(host, 
      h(
        "div.listen-row",
        h("button.big-speaker", { type: "button", "aria-label": t("q.play"), onclick: () => say(q) }, "🔊"),
        h("button.small-speaker", { type: "button", "aria-label": t("q.slow"), title: t("q.slow"), onclick: () => say(q, { rate: 0.5 }) }, "🐢"),
      ),
    );
    const grid = optionGrid(q, done, opts);
    add(host, grid);
    setTimeout(() => say(q), 300);
    const keys = grid.keyHandler;
    return (e) => (e.key === "r" || e.key === "R" ? say(q) : keys(e));
  },

  tone(q, host, done, opts = {}) {
    add(host, h("div.prompt-row", hanziBlock(q.prompt.zh, "", { pinyin: false }), speakBtn(q)), meaningBlock(q));
    const grid = optionGrid(q, done, opts);
    add(host, grid);
    setTimeout(() => say(q), 250);
    return grid.keyHandler;
  },

  typing(q, host, done, opts = {}) {
    add(host, h("div.prompt-row", hanziBlock(q.prompt.zh, "", { pinyin: false }), speakBtn(q)), meaningBlock(q));
    const input = h("input.typing", { type: "text", inputmode: "text", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", placeholder: t("q.typingPlaceholder"), "aria-label": "Pinyin" });
    const submit = () => {
      if (input.disabled || !input.value.trim()) return;
      input.disabled = true;
      btn.disabled = true;
      toneKeys.querySelectorAll("button").forEach((b) => (b.disabled = true));
      const r = A.check(q, input.value.trim());
      if (!opts.silent) input.classList.add(r.correct ? "right" : "wrong");
      done({ correct: r.correct, note: noteOf(r) });
    };
    const btn = h("button.btn.primary", { type: "button", onclick: submit }, t("c.check"));
    const toneKeys = h(
      "div.tone-keypad",
      { role: "group", "aria-label": t("type.tone") },
      [
        ["1", "ā"],
        ["2", "á"],
        ["3", "ǎ"],
        ["4", "à"],
      ].map(([n, m]) =>
        h("button.btn.small.tone-key", {
          type: "button",
          onclick: () => {
            if (input.disabled) return;
            input.value += n;
            input.focus();
          },
        }, h(`span.tone-${n}`, `${n} · ${m}`)),
      ),
    );
    input.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), e.stopPropagation(), submit()));
    add(host, h("div.typing-row", input, btn), toneKeys);
    setTimeout(() => input.focus(), 50);
    return null;
  },

  match(q, host, done) {
    let picked = null;
    let matched = 0;
    let mistakes = 0;
    const leftOpts = q.options || [];
    const rightOpts = q.meta?.right || [];
    const left = leftOpts.map((o) => h("button.tile.zh", { type: "button", lang: "zh-CN", "data-key": o.key }, o.zh || o.label));
    const right = rightOpts.map((o) => h("button.tile", { type: "button", "data-key": o.key }, ((g) => (Array.isArray(g) || g ? g : o.label))(glossInline(A.getWord(o.key)))));
    const select = (btn, side) => {
      if (btn.classList.contains("done")) return;
      if (side === "l") A.speak(btn.textContent);
      if (!picked || picked.side === side) {
        picked?.btn.classList.remove("sel");
        picked = { btn, side };
        btn.classList.add("sel");
        return;
      }
      const l = side === "l" ? btn : picked.btn;
      const r = side === "r" ? btn : picked.btn;
      const ok = !A.check(q, [[l.dataset.key, r.dataset.key]]).mistakes;
      if (ok) {
        [l, r].forEach((b) => {
          b.classList.remove("sel");
          b.classList.add("done");
          b.disabled = true;
        });
        matched += 1;
        beep("ok");
        if (matched === left.length) {
          const res = A.check(q, mistakes);
          done({ correct: res.correct, note: noteOf(res) });
        }
      } else {
        mistakes += 1;
        vibrate(40);
        beep("bad");
        const a = picked.btn;
        a.classList.add("shake");
        btn.classList.add("shake");
        setTimeout(() => {
          a.classList.remove("shake", "sel");
          btn.classList.remove("shake");
        }, 400);
      }
      picked = null;
    };
    left.forEach((b) => b.addEventListener("click", () => select(b, "l")));
    right.forEach((b) => b.addEventListener("click", () => select(b, "r")));
    add(host, h("div.match", h("div.col", left), h("div.col", right)));
    return null;
  },

  fill(q, host, done, opts = {}) {
    const w = wordOf(q);
    const zh = q.meta?.zh || q.prompt.sentence || "";
    const sentence = h("div.sentence", { lang: "zh-CN" });
    // Dựng câu từ prompt.sentence + prompt.blanks [{ start, length }]
    let at = 0;
    (q.prompt.blanks || []).forEach((b) => {
      add(sentence, zh.slice(at, b.start), h("span.blank", "？"));
      at = b.start + b.length;
    });
    add(sentence, zh.slice(at));
    add(host, sentence, meaningBlock(q, { fromWord: false }));
    const grid = optionGrid(q, done, {
      ...opts,
      onPicked: (r) => {
        if (opts.silent) return;
        sentence.querySelectorAll(".blank").forEach((b) => {
          b.textContent = w?.h || "";
          b.classList.add(r.correct ? "right" : "wrong");
        });
        if (q.meta?.py) sentence.after(h("div.ex-py.center-text", q.meta.py));
        A.speak(zh);
      },
    });
    add(host, grid);
    return grid.keyHandler;
  },

  order(q, host, done) {
    const answer = h("div.answer-line", { lang: "zh-CN", role: "group", "aria-label": t("q.yourSentence") });
    const bank = h("div.bank", { lang: "zh-CN", role: "group", "aria-label": t("q.bank") });
    const placed = [];
    const opts = q.options || [];
    const btnCheck = h("button.btn.primary", { type: "button", disabled: true }, t("c.check"));
    const refresh = () => (btnCheck.disabled = placed.length !== opts.length);
    const tiles = opts.map((o) => {
      const b = h("button.tile.zh", { type: "button" }, o.zh || o.label);
      b.addEventListener("click", () => {
        if (b.parentElement === bank) {
          answer.append(b);
          placed.push(o.key);
        } else {
          bank.append(b);
          placed.splice(placed.indexOf(o.key), 1);
        }
        refresh();
      });
      bank.append(b);
      return b;
    });
    btnCheck.addEventListener("click", () => {
      if (btnCheck.disabled) return;
      btnCheck.disabled = true;
      const r = A.check(q, [...placed]);
      tiles.forEach((b) => (b.disabled = true));
      answer.classList.add(r.correct ? "right" : "wrong");
      const zh = q.meta?.zh || q.answer;
      A.speak(zh);
      done({ correct: r.correct, reveal: h("div.reveal-sentence", h("div.zh", { lang: "zh-CN" }, zh), q.meta?.py ? h("div.py", q.meta.py) : null) });
    });
    add(host, meaningBlock(q, { cls: ".vi-prompt.small", fromWord: false }), answer, bank, h("div.center", btnCheck));
    // Phím: 1–9 chọn mảnh còn trong kho, Backspace trả mảnh cuối, Enter kiểm tra
    return (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 9) bank.children[n - 1]?.click();
      else if (e.key === "Backspace") answer.lastElementChild?.click();
      else if (e.key === "Enter" && !btnCheck.disabled) (e.preventDefault(), btnCheck.click());
    };
  },

  speak(q, host, done) {
    add(host, h("div.prompt-row", hanziBlock(q.prompt.zh, q.prompt.py, { force: true }), speakBtn(q)), meaningBlock(q));
    const result = h("div.speak-result", { role: "status", "aria-live": "polite" });
    const mic = h("button.mic", { type: "button", "aria-label": t("q.tapToSpeak"), title: t("q.tapToSpeak") }, "🎙️");
    const skip = h("button.link", { type: "button" }, t("q.cantSpeak"));
    let finished = false;
    let tries = 0;
    const finish = (r) => {
      if (finished) return;
      finished = true;
      mic.disabled = true;
      skip.remove();
      done(r);
    };
    mic.addEventListener("click", async () => {
      if (!A.canRecognize()) return result.replaceChildren(h("p.warn", t("q.noRecog")));
      mic.classList.add("live");
      result.replaceChildren(h("p.muted", t("q.listening")));
      try {
        const { alternatives, audioUrl } = (await A.listen()) || {};
        mic.classList.remove("live");
        tries += 1;
        A.S.bumpStat?.("speak");
        const r = A.check(q, { alternatives: alternatives || [] });
        const detail = r.detail || A.scorePronunciation(q.answer, alternatives || []);
        const score = r.score ?? detail.score;
        result.replaceChildren(scoreView({ ...detail, score }, audioUrl));
        if (r.correct) finish({ correct: true, note: t("q.score", { n: score }) });
        else if (tries >= 3) finish({ correct: false, note: t("q.scoreLow", { n: score }) });
        else result.append(h("p.muted", t("q.retry", { n: tries })));
      } catch (e) {
        mic.classList.remove("live");
        result.replaceChildren(h("p.warn", (lang() === "en" && e.messageEn) || e.message));
      }
    });
    skip.addEventListener("click", () => finish({ correct: true, skipped: true }));
    add(host, h("div.center", mic), result, h("div.center", skip));
    return (e) => {
      if (e.key === "Enter" || e.key === " ") (e.preventDefault(), mic.click());
    };
  },

  write(q, host, done) {
    const chars = Array.isArray(q.answer) ? q.answer : [...String(q.answer || "")].filter(A.isHan);
    let idx = 0;
    let total = 0;
    const area = h("div.write-area");
    const info = h("div.write-info");
    const skip = h("button.link", { type: "button" }, t("q.skipWrite"));
    let finished = false;
    const finish = (r) => {
      if (finished) return;
      finished = true;
      skip.remove();
      done(r);
    };
    const next = () => {
      clear(area);
      info.replaceChildren(h("span", t("q.charOf", { i: idx + 1, n: chars.length })), q.prompt.py ? h("span.muted", ` · ${q.prompt.py}`) : null);
      const quiz = strokeQuiz(chars[idx], {
        size: Math.max(180, Math.min(280, window.innerWidth - 80)),
        onDone: ({ mistakes }) => {
          total += mistakes;
          A.S.bumpStat?.("write");
          idx += 1;
          if (idx < chars.length) setTimeout(next, 600);
          else {
            const r = A.check(q, total);
            finish({ correct: r.correct, note: t("q.strokeMiss", { n: total }) });
          }
        },
      });
      add(area, quiz.el, h("div.center", h("button.btn.ghost", { type: "button", onclick: () => quiz.hint() }, t("q.hint"))));
    };
    skip.addEventListener("click", () => finish({ correct: true, skipped: true }));
    add(host, h("div.prompt-row", meaningBlock(q), speakBtn(q)), info, area, h("div.center", skip));
    if (!chars.length) finish({ correct: true, skipped: true });
    else next();
    return null;
  },
};

function scoreView(s, audioUrl) {
  const tone = s.score >= 85 ? "good" : s.score >= 60 ? "mid" : "low";
  return h(
    "div.score-card",
    h(`div.score.${tone}`, String(s.score)),
    h(
      "div",
      h("div.score-chars", { lang: "zh-CN" }, (s.chars || []).map((c) => h(`span.${c.status}`, c.ch))),
      h("div.muted.small", s.heard ? t("q.heard", { s: s.heard }) : t("q.heardNone")),
      h("div.legend.small", h("span.ok", t("q.legOk")), h("span.tone", t("q.legTone")), h("span.bad", t("q.legBad"))),
      audioUrl ? h("button.btn.ghost.small", { type: "button", onclick: () => new Audio(audioUrl).play() }, t("q.playback")) : null,
    ),
  );
}

export function renderQuestion(q, host, done, opts = {}) {
  const fn = R[q.type];
  if (!fn) throw new Error(`type "${q.type}"`);
  const w = q.type === "match" ? null : wordOf(q);
  const keys = fn(q, host, done, opts);
  const badge = w ? rvBadge(w) : null;
  if (badge && !host.querySelector(".rv")) add(host, h("div.center", badge));
  return keys;
}
