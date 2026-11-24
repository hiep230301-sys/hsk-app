// Trình chạy một phiên câu hỏi: nhận Question[] của core, hiển thị lần lượt, tổng kết.
import { h, clear, beep, vibrate, confetti, toast, pct, go, add } from "./dom.js";
import { t, lang, pickPraise } from "../i18n.js";
import * as A from "../api.js";
import { renderQuestion } from "./questions.js";
import { glossInline, speakerBtn } from "./word.js";

/**
 * opts: { retryWrong=true, exitTo="#/", onFinish(result), headExtra }
 * result: { answered, correct, firstTryRight, perWord: Map(id → số lần sai), skipped, total, log:[{q, correct}] }
 */
export function runSession(root, questions, opts = {}) {
  const queue = [...questions];
  const retry = opts.retryWrong !== false;
  const silent = Boolean(opts.silent);
  const allowDontKnow = Boolean(opts.allowDontKnow);
  const total = queue.length;
  const perWord = new Map();
  const log = [];
  const retried = new Set();
  let answered = 0;
  let correct = 0;
  let skipped = 0;
  let firstTryRight = 0;
  let combo = 0;
  let shown = 0;
  let current = null;
  let keyHandler = null;
  let stage = "answer";

  const bar = h("div.progress-fill");
  const comboEl = h("div.combo");
  const head = h(
    "div.session-head",
    h("button.icon-btn", { type: "button", "aria-label": t("c.exit"), onclick: () => exit() }, "✕"),
    h("div.progress", { role: "progressbar", "aria-label": t("s.progress") }, bar),
    comboEl,
    opts.headExtra || null,
  );
  const body = h("div.session-body");
  const foot = h("div.session-foot");
  clear(root).append(h("div.session", head, body, foot));

  const onKey = (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (stage === "next" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      advance();
    } else if (stage === "answer") keyHandler?.(e);
  };
  document.addEventListener("keydown", onKey);
  const cleanup = () => {
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("hashchange", cleanup);
    A.stopSpeaking();
  };
  window.addEventListener("hashchange", cleanup);

  function exit() {
    if (answered > 0 && stage !== "done" && !confirm(t("s.confirmExit"))) return;
    cleanup();
    go(opts.exitTo || "#/");
  }

  function show() {
    if (!queue.length) return finish();
    current = queue.shift();
    shown += 1;
    stage = "answer";
    bar.style.width = `${Math.min(100, ((shown - 1) / (shown + queue.length)) * 100)}%`;
    clear(foot).className = "session-foot";
    clear(body);
    const card = h("div.exercise", h("div.ex-type", t(`type.${current.type}`)), h("h2.ex-prompt", t(`ask.${current.type}`)));
    add(body, card);
    try {
      keyHandler = renderQuestion(current, card, onAnswer, { silent });
      if (allowDontKnow) {
        add(card, h("div.center", h("button.btn.ghost.small", { type: "button", onclick: () => onAnswer({ correct: false, dontKnow: true }) }, t("pl.dontKnow"))));
      }
    } catch (e) {
      console.error(e);
      add(card, h("p.warn", `${t("s.badQuestion")} (${current.type}): ${e.message}`));
      keyHandler = null;
      onAnswer({ correct: true, skipped: true });
    }
    body.scrollTo?.({ top: 0 });
  }

  function onAnswer(r) {
    if (stage !== "answer") return;
    stage = "next";
    const ids = current.wordIds || [];
    if (r.skipped) skipped += 1;
    else {
      answered += 1;
      if (r.correct) correct += 1;
      log.push({ q: current, correct: Boolean(r.correct) });
    }
    ids.forEach((id) => {
      if (!r.correct) perWord.set(id, (perWord.get(id) || 0) + 1);
      else if (!perWord.has(id)) perWord.set(id, 0);
    });
    if (r.correct && !r.skipped && !retried.has(current)) firstTryRight += 1;
    combo = r.correct && !r.skipped ? combo + 1 : 0;
    comboEl.textContent = !silent && combo >= 3 ? `🔥 ${combo}` : "";
    // Thi thử (silent) hoặc Xếp lớp bấm "Tôi không biết": không hiện chân phản hồi đúng/sai, sang câu tiếp ngay
    // stage = "wait": Enter / Space trong 160 ms này không được gọi advance() → show() lần hai (lỗi KCS M5)
    if (silent || r.dontKnow) {
      stage = "wait";
      setTimeout(() => stage === "wait" && show(), 160);
      return;
    }
    if (!r.skipped) {
      beep(r.correct ? "ok" : "bad");
      if (!r.correct) vibrate(60);
    }
    // Câu sai: cho làm lại đúng câu đó ở cuối phiên (1 lần) — không tự sinh câu mới
    if (!r.correct && retry && !retried.has(current)) {
      retried.add(current);
      queue.push(current);
    }
    const w = current.type === "match" ? null : A.getWord(ids[0]);
    const info = w
      ? h("div.foot-word", h("span.zh", { lang: "zh-CN" }, w.h), w.py ? h("span.py", w.py) : null, h("span.vi", glossInline(w)), speakerBtn(w.h))
      : null;
    foot.className = `session-foot show ${r.skipped ? "skip" : r.correct ? "good" : "bad"}`;
    const nextBtn = h("button.btn.primary.wide", { type: "button", onclick: advance }, queue.length ? t("c.continue") : t("s.seeResult"));
    add(foot, 
      h(
        "div.foot-inner",
        h(
          "div.foot-msg",
          { role: "status", "aria-live": "polite" },
          h("strong", r.skipped ? t("s.skipped") : r.correct ? pickPraise() : t("s.wrong")),
          r.note ? h("div.small", r.note) : null,
          r.reveal || null,
          info,
        ),
        nextBtn,
      ),
    );
    setTimeout(() => nextBtn.focus({ preventScroll: true }), 30);
  }

  function advance() {
    if (stage !== "next") return;
    show();
  }

  function finish() {
    if (stage === "done") return;
    stage = "done";
    cleanup();
    bar.style.width = "100%";
    opts.onFinish?.({ answered, correct, firstTryRight, perWord, skipped, total, log });
  }

  show();
  return {
    exit,
    forceFinish() {
      queue.length = 0;
      finish();
    },
  };
}

/** Điểm SRS 0..3 từ số lần sai trong phiên. */
export const gradeOf = (mistakes) => (mistakes === 0 ? 2 : mistakes === 1 ? 1 : 0);
export const starsOf = (acc) => (acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : 1);

/** Màn hình kết quả dùng chung. actions: [{ label, hash, primary }] */
export function resultScreen(root, { title, acc, xp = 0, stars = 0, wordIds = [], perWord = new Map(), started = Date.now(), emoji, note, wrongList = null, actions = [] }) {
  const before = A.st().streak || 0;
  const { streakUp, goalReached } = xp ? A.addXp(xp, wordIds.length) : {};
  const badges = A.newBadges();
  const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
  const words = [...new Set(wordIds)].map(A.getWord).filter(Boolean);
  const now = A.st().streak || 0;
  const wrongBlock = Array.isArray(wrongList)
    ? h(
        "div.wrong-review",
        h("h2", wrongList.length ? t("test.wrongList", { n: wrongList.length }) : t("test.allRight")),
        wrongList.length
          ? h(
              "ul.result-words",
              wrongList.map((q) => {
                const w = A.getWord((q.wordIds || [])[0]);
                return h(
                  "li.miss",
                  { onclick: () => w && A.speakWord(w) },
                  h("b", { lang: "zh-CN" }, w?.h || q.prompt?.zh || "—"),
                  h("small", w?.py || q.prompt?.py || ""),
                  h("span", w ? glossInline(w) : q.prompt?.vi || q.prompt?.en || ""),
                  h("i", t(`type.${q.type}`)),
                );
              }),
            )
          : null,
      )
    : null;
  clear(root).append(
    h(
      "div.result",
      h("div.result-stars", emoji || [1, 2, 3].map((k) => h(`span${k <= stars ? ".on" : ""}`, { style: { animationDelay: `${k * 0.2}s` } }, "★"))),
      h("h1", title),
      h(
        "div.result-stats",
        stat(t("r.accuracy"), pct(acc)),
        stat("XP", `+${xp}`),
        stat(t("r.time"), `${mins} ${t("r.min")}`),
        now > before || streakUp ? stat(t("r.streak"), `🔥 ${now}`) : null,
      ),
      note ? h("p.muted", note) : null,
      wrongBlock,
      !wrongBlock && words.length
        ? h(
            "ul.result-words",
            words.map((w) => {
              const m = perWord.get(w.id) || 0;
              return h(`li${m ? ".miss" : ""}`, { onclick: () => A.speakWord(w) }, h("b", { lang: "zh-CN" }, w.h), h("small", w.py), h("span", glossInline(w)), h("i", m ? t("r.missed", { n: m }) : "✓"));
            }),
          )
        : null,
      h("div.result-actions", actions.filter(Boolean).map((a) => h(`button.btn.wide${a.primary ? ".primary" : ""}`, { type: "button", onclick: () => (a.onclick ? a.onclick() : go(a.hash)) }, a.label))),
    ),
  );
  root.querySelector(".result-actions .btn")?.focus({ preventScroll: true });
  beep("done");
  if (stars === 3 || goalReached) confetti(root);
  if (goalReached) toast(`🎯 ${t("r.goal")}`, "good", 3500);
  if (now > before) toast(`🔥 ${t("r.streakN", { n: now })}`, "good");
  badges.forEach((b, k) => setTimeout(() => toast(`${b.icon || "🏅"} ${t("r.badge")}: ${(lang() === "en" && b.nameEn) || b.name || b.id || ""}`, "good", 3500), 600 + k * 700));
}

function stat(label, value) {
  return h("div.stat", h("b", value), h("small", label));
}
