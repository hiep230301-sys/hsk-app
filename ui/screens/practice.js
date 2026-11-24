// Ôn tập SRS, Luyện tập (10 dạng + thẻ ghi nhớ + thi thử).
import { h, clear, toast, go, onKeys, skeleton } from "../components/dom.js";
import { t, lang } from "../i18n.js";
import * as A from "../api.js";
import { glossNode, exGloss, toneHanzi, tonePinyin } from "../components/word.js";
import { runSession, resultScreen, gradeOf, starsOf } from "../components/session.js";
import { soonNotice } from "./learn.js";

const loading = (root) => clear(root).append(skeleton(3));

// =============== ÔN TẬP SRS ===============

export async function viewReview(root, mode) {
  loading(root);
  await A.index();
  await A.loadAll();
  let ids = A.dueIds();
  let label = t("rev.due");
  const cards = A.cards();
  if (!ids.length && mode === "weak") {
    ids = Object.entries(cards)
      .sort((a, b) => (b[1].wrong || 0) / Math.max(1, b[1].seen || 0) - (a[1].wrong || 0) / Math.max(1, a[1].seen || 0) || (a[1].iv || 0) - (b[1].iv || 0))
      .slice(0, 15)
      .map(([id]) => id);
    label = t("rev.weak");
  }
  if (!ids.length) {
    const learned = Object.keys(cards).length;
    const soon = Object.values(cards).sort((a, b) => a.due - b.due)[0];
    const when = soon ? new Date(soon.due).toLocaleString(lang() === "en" ? "en-GB" : "vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";
    clear(root).append(
      h(
        "div.empty",
        h("div.empty-icon", "🎉"),
        h("h2", learned ? t("rev.noneDue") : t("rev.nothing")),
        h("p.muted", learned ? t("rev.nextAt", { n: learned, when }) : t("rev.learnFirst")),
        learned ? h("button.btn.primary", { type: "button", onclick: () => go("#/review/weak") }, t("rev.moreWeak")) : h("button.btn.primary", { type: "button", onclick: () => go("#/") }, t("rev.learnNew")),
      ),
    );
    return;
  }
  const words = ids.slice(0, 20).map(A.getWord).filter(Boolean);
  const pool = await A.loadLevel(A.level());
  const qs = await A.reviewPlan(words, pool);
  if (!qs.length) return (toast(t("s.noQuestions"), "bad"), go("#/"));
  const started = Date.now();
  runSession(root, qs, {
    exitTo: "#/",
    onFinish: (res) => {
      words.forEach((w) => A.S.review(w.id, gradeOf(res.perWord.get(w.id) || 0)));
      A.S.bumpStat?.("reviews", words.length);
      const acc = res.firstTryRight / Math.max(1, res.answered);
      resultScreen(root, {
        title: t("rev.finished", { label }),
        acc,
        xp: 5 + res.correct * 2,
        stars: starsOf(acc),
        wordIds: words.map((w) => w.id),
        perWord: res.perWord,
        started,
        actions: [A.dueIds().length ? { label: t("rev.again"), hash: "#/review", primary: true } : null, { label: t("les.toPath"), hash: "#/" }],
      });
    },
  });
}

// =============== LUYỆN TẬP ===============

const DRILL_ICON = { flash: "🃏", meaning: "💡", hanzi: "🈶", listen: "🎧", tone: "〰️", typing: "⌨️", match: "🧩", fill: "✏️", order: "🔀", speak: "🎙️", write: "🖌️", test: "📝" };

function practicePool() {
  const lv = A.level();
  const all = A.wordsOf(lv);
  const cards = A.cards();
  const learned = all.filter((w) => cards[w.id]);
  const scope = sessionStorage.getItem("hsk2-scope") || "learned";
  if (scope === "learned" && learned.length >= A.UNIT_SIZE) return { words: learned, scope: "learned", learned: learned.length, pool: all };
  return { words: all, scope: "all", learned: learned.length, pool: all };
}

export async function viewPractice(root) {
  loading(root);
  await A.index();
  await A.loadLevel(A.level());
  const { scope, learned } = practicePool();
  const seg = h(
    "div.segmented",
    [
      ["learned", t("pr.learned", { n: learned })],
      ["all", t("pr.all", { lv: A.levelLabel(A.level()) })],
    ].map(([id, label]) =>
      h(`button${scope === id ? ".on" : ""}`, { type: "button", disabled: id === "learned" && learned < A.UNIT_SIZE, title: id === "learned" && learned < A.UNIT_SIZE ? t("pr.need8") : null, onclick: () => (sessionStorage.setItem("hsk2-scope", id), viewPractice(root)) }, label),
    ),
  );
  const items = ["flash", ...A.TYPES, "test"];
  clear(root).append(
    h("header.page-head", h("h1", t("pr.title")), h("p.muted", t("pr.sub"))),
    soonNotice(),
    seg,
    h(
      "div.drill-grid",
      items.map((id) => {
        const off = (id === "speak" && !A.canRecognize()) || (id === "listen" && !A.canSpeak());
        return h(
          `button.drill${off ? ".off" : ""}`,
          { type: "button", onclick: () => go(id === "flash" ? "#/flash" : id === "test" ? "#/test" : `#/drill/${id}`) },
          h("span.di", DRILL_ICON[id]),
          h("b", id === "flash" ? t("pr.flash") : id === "test" ? t("pr.test") : t(`type.${id}`)),
          h("small", off ? t("pr.unsupported") : t(`drill.${id}`)),
        );
      }),
    ),
  );
}

export async function viewDrill(root, type) {
  if (!A.TYPES.includes(type)) return go("#/practice");
  loading(root);
  await A.index();
  await A.loadLevel(A.level());
  const { words, pool } = practicePool();
  const n = type === "write" || type === "speak" ? 6 : type === "match" ? 4 : 10;
  const qs = (await A.drillPlan(type, A.shuffle(words).slice(0, 60), pool)).slice(0, n);
  if (!qs.length) {
    toast(t("pr.noWords"), "bad");
    return go("#/practice");
  }
  const started = Date.now();
  const cards = A.cards();
  runSession(root, qs, {
    exitTo: "#/practice",
    onFinish: (res) => {
      const ids = [...new Set(qs.flatMap((q) => q.wordIds || []))];
      // Từ đã có trong lịch ôn: cập nhật nhẹ theo kết quả
      ids.forEach((id) => {
        if (cards[id] && res.perWord.has(id)) A.S.review(id, res.perWord.get(id) ? 0 : 2);
      });
      const acc = res.firstTryRight / Math.max(1, res.answered);
      resultScreen(root, {
        title: t("pr.finished", { label: t(`type.${type}`) }),
        acc,
        xp: 2 + res.correct,
        stars: starsOf(acc),
        wordIds: ids,
        perWord: res.perWord,
        started,
        actions: [{ label: t("pr.again"), hash: `#/drill/${type}`, primary: true }, { label: t("pr.back"), hash: "#/practice" }],
      });
    },
  });
}

// ---------- Thẻ ghi nhớ ----------
export async function viewFlash(root) {
  loading(root);
  await A.index();
  await A.loadLevel(A.level());
  const { words } = practicePool();
  const due = new Set(A.dueIds());
  const deck = A.shuffle(words).sort((a, b) => Number(due.has(b.id)) - Number(due.has(a.id))).slice(0, 20);
  let i = 0;
  let known = 0;
  const counter = h("div.flash-count");
  const stage = h("div.flash-stage");
  clear(root).append(
    h("div.session-head", h("button.icon-btn", { type: "button", "aria-label": t("c.exit"), onclick: () => go("#/practice") }, "✕"), h("div.intro-title", t("pr.flash")), counter),
    stage,
  );
  const off = onKeys((e) => {
    if (e.key === " " || e.key === "Enter") (e.preventDefault(), stage.querySelector(".flash")?.click());
    const k = Number(e.key);
    if (k >= 1 && k <= 4) stage.querySelectorAll(".grade:not(.hidden) button")[k - 1]?.click();
  });
  function show() {
    if (i >= deck.length) {
      off();
      A.addXp(Math.round(known / 2) + 2, 0);
      clear(stage).append(
        h("div.empty", h("div.empty-icon", "🃏"), h("h2", t("fl.done", { n: deck.length })), h("p.muted", t("fl.known", { k: known, n: deck.length })), h("button.btn.primary", { type: "button", onclick: () => go("#/flash") }, t("pr.again")), h("button.btn", { type: "button", onclick: () => go("#/practice") }, t("pr.back"))),
      );
      return;
    }
    const w = deck[i];
    const ex = (w.ex || [])[0];
    counter.textContent = `${i + 1}/${deck.length}`;
    const card = h(
      "button.flash",
      { type: "button", "aria-label": t("fl.flip") },
      h("div.face.front", h("div.wc-hz", { lang: "zh-CN" }, toneHanzi(w.h, w)), h("small.muted", t("fl.hint"))),
      h("div.face.back", h("div.wc-py", tonePinyin(w.py, w)), h("div.wc-hz.small", { lang: "zh-CN" }, toneHanzi(w.h, w)), glossNode(w, { cls: ".wc-gloss" }), ex ? h("div.ex-zh.small", { lang: "zh-CN" }, ex.zh) : null, ex ? exGloss(ex) : null),
    );
    const grades = h(
      "div.grade.hidden",
      [
        ["fl.g0", 0, "bad"],
        ["fl.g1", 1, "mid"],
        ["fl.g2", 2, "good"],
        ["fl.g3", 3, "easy"],
      ].map(([key, g, cls], k) =>
        h(`button.${cls}`, { type: "button", onclick: () => (A.S.review(w.id, g), g >= 2 && (known += 1), (i += 1), show()) }, h("span.key", String(k + 1)), " ", t(key)),
      ),
    );
    card.addEventListener("click", () => {
      card.classList.toggle("flipped");
      grades.classList.remove("hidden");
      A.speakWord(w);
    });
    clear(stage).append(card, grades);
  }
  show();
}

// ---------- Thi thử ----------
export async function viewTest(root) {
  loading(root);
  await A.index();
  const lv = A.level();
  await A.loadLevel(lv);
  const N = 20;
  const qs = await A.testPlan(lv, N);
  if (!qs.length) return (toast(t("s.noQuestions"), "bad"), go("#/practice"));
  const started = Date.now();
  const timerEl = h("div.test-timer", { "aria-live": "off" });
  let left = qs.length * 45;
  let session = null;
  const paint = () => (timerEl.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
  paint();
  const tick = setInterval(() => {
    left -= 1;
    paint();
    if (left <= 0) {
      clearInterval(tick);
      toast(t("test.timeUp"), "bad");
      session?.forceFinish();
    }
  }, 1000);
  window.addEventListener("hashchange", () => clearInterval(tick), { once: true });
  session = runSession(root, qs, {
    retryWrong: false,
    silent: true,
    exitTo: "#/practice",
    headExtra: timerEl,
    onFinish: (res) => {
      clearInterval(tick);
      const score = Math.round((res.correct / qs.length) * 100);
      A.recordTest(score);
      const wrongList = (res.log || []).filter((x) => !x.correct).map((x) => x.q);
      resultScreen(root, {
        title: t("test.score", { n: score }),
        acc: res.correct / qs.length,
        xp: Math.round(score / 5),
        stars: score >= 90 ? 3 : score >= 70 ? 2 : 1,
        wordIds: qs.flatMap((q) => q.wordIds || []),
        perWord: res.perWord,
        wrongList,
        started,
        note: t("test.note", { lv: A.levelLabel(lv), n: qs.length }),
        actions: [{ label: t("pr.again"), hash: "#/test", primary: true }, { label: t("pr.back"), hash: "#/practice" }],
      });
    },
  });
}
