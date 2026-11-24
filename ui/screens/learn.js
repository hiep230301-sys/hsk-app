// Chào mừng 3 bước + xếp lớp, Lộ trình theo cấp, Bài học (thẻ từ mới → luyện → kết quả).
import { h, clear, sheet, toast, pct, fmtNumber, go, onKeys, add, skeleton } from "../components/dom.js";
import { t, applyLang } from "../i18n.js";
import * as A from "../api.js";
import { wordCard, glossInline } from "../components/word.js";
import { runSession, resultScreen } from "../components/session.js";

const lvColor = (lv) => `var(--lv${Math.min(7, Number(lv) || 1)})`;

/** Nhãn "Sắp có" + thông báo nhẹ cho cấp chưa mở (A.READY_LEVELS trong ui/api.js). */
export const soonTag = () => h("span.soon-tag", t("lv.soon"));
export const soonToast = (lv) => toast(t("lv.soonMsg", { lv: A.levelLabel(lv) }));
/** Người đã chọn cấp chưa mở từ bản trước: báo đang học cấp nào thay thế. */
export const soonNotice = () => (A.isReady(A.storedLevel()) ? null : h("p.notice", t("lv.soonKept", { lv: A.levelLabel(A.storedLevel()), cur: A.levelLabel(A.level()) })));

// =============== CHÀO MỪNG (3 BƯỚC · ĐÚNG 3 LẦN CHẠM TỚI BÀI 1) ===============

export async function viewWelcome(root) {
  await A.index();
  let step = 1;
  let pickedTrack = "new"; // new | pick

  const renderStep = () => {
    const dots = h(
      "div.step-dots",
      { "aria-label": `${step}/3` },
      [1, 2, 3].map((k) => h(`i${k === step ? ".on" : k < step ? ".done" : ""}`)),
    );
    let inner;
    if (step === 1) {
      inner = [
        h("div.welcome-logo", { lang: "zh-CN" }, "汉"),
        h("h1", t("wel.s1Title")),
        h("p.muted", t("wel.s1Sub")),
        h(
          "div.welcome-opts",
          h(
            "button.welcome-opt",
            {
              type: "button",
              onclick: () => {
                A.setSetting({ uiLang: "vi", gloss: "both" });
                applyLang();
                step = 2;
                renderStep();
              },
            },
            h("span.wi", "🇻🇳"),
            h("b", "Tiếng Việt"),
            h("small", t("wel.viSub")),
          ),
          h(
            "button.welcome-opt",
            {
              type: "button",
              onclick: () => {
                A.setSetting({ uiLang: "en", gloss: "both" });
                applyLang();
                step = 2;
                renderStep();
              },
            },
            h("span.wi", "🇬🇧"),
            h("b", "English"),
            h("small", t("wel.enSub")),
          ),
        ),
      ];
    } else if (step === 2) {
      inner = [
        h("h1", t("wel.s2Title")),
        h("p.muted", t("wel.s2Sub")),
        h(
          "div.welcome-opts",
          h(
            "button.welcome-opt",
            {
              type: "button",
              onclick: () => {
                pickedTrack = "new";
                A.setSetting({ level: 1, pinyin: "always" });
                step = 3;
                renderStep();
              },
            },
            h("span.wi", "🌱"),
            h("b", t("wel.new")),
            h("small", t("wel.newSub")),
          ),
          h(
            "button.welcome-opt",
            { type: "button", onclick: () => go("#/placement") },
            h("span.wi", "🧭"),
            h("b", t("wel.some")),
            h("small", t("wel.someSub")),
          ),
          h(
            "button.welcome-opt",
            {
              type: "button",
              onclick: () => {
                pickedTrack = "pick";
                levelPicker(() => {
                  step = 3;
                  renderStep();
                }, { navigate: false });
              },
            },
            h("span.wi", "🎯"),
            h("b", t("wel.pick")),
            h("small", t("wel.pickSub")),
          ),
        ),
        h("button.btn.ghost", { type: "button", onclick: () => ((step = 1), renderStep()) }, `← ${t("c.back")}`),
      ];
    } else {
      const goals = [
        { xp: 20, icon: "☕", title: t("wel.g5"), sub: t("wel.g5Sub") },
        { xp: 50, icon: "🔥", title: t("wel.g10"), sub: t("wel.g10Sub"), hot: true },
        { xp: 100, icon: "🚀", title: t("wel.g20"), sub: t("wel.g20Sub") },
      ];
      inner = [
        h("h1", t("wel.s3Title")),
        h("p.muted", t("wel.s3Sub")),
        h(
          "div.welcome-opts",
          goals.map((g) =>
            h(
              `button.welcome-opt${g.hot ? ".hot" : ""}`,
              {
                type: "button",
                onclick: () => {
                  A.setSetting({ dailyGoal: g.xp });
                  A.setOnboarded();
                  if (pickedTrack === "new") go("#/lesson/1/0");
                  else go("#/");
                },
              },
              h("span.wi", g.icon),
              h("b", g.title),
              h("small", g.sub),
            ),
          ),
        ),
        h("button.btn.ghost", { type: "button", onclick: () => ((step = 2), renderStep()) }, `← ${t("c.back")}`),
      ];
    }
    clear(root).append(h("div.welcome", dots, inner));
  };
  renderStep();
}

// =============== XẾP LỚP ===============

export async function viewPlacement(root) {
  clear(root).append(skeleton(3));
  await A.index();
  await A.loadAll();
  const qs = await A.placementPlan();
  if (!qs.length) {
    toast(t("pl.none"), "bad");
    return go("#/welcome");
  }
  const started = Date.now();
  runSession(root, qs, {
    retryWrong: false,
    allowDontKnow: true,
    exitTo: "#/welcome",
    onFinish: (res) => {
      // Cấp đề xuất do LÕI tính (placementResult); UI không tự đặt ngưỡng, chỉ hiện số đúng theo cấp
      const rawPlaced = A.placementResult(res.log);
      const placed = A.readyLevel(rawPlaced); // cấp "Sắp có" (7–9) → lùi về cấp đã mở cao nhất
      const perLevel = A.placementDetail(res.log)?.perLevel || {};
      const by = Object.keys(perLevel).map(Number).sort((a, b) => a - b).map((lv) => `${A.levelLabel(lv)}: ${perLevel[lv].right}/${perLevel[lv].total}`);
      A.setSetting({ level: placed });
      A.setOnboarded();
      const acc = res.correct / Math.max(1, res.answered);
      resultScreen(root, {
        title: t("pl.result", { lv: A.levelLabel(placed) }),
        emoji: "🧭",
        acc,
        xp: 5,
        started,
        note: `${by.length ? `${by.join(" · ")}. ` : ""}${t("pl.note")}${A.isReady(rawPlaced) ? "" : ` ${t("lv.soonMsg", { lv: A.levelLabel(rawPlaced) })}`}`,
        actions: [
          { label: t("pl.start", { lv: A.levelLabel(placed) }), hash: `#/lesson/${placed}/0`, primary: true },
          { label: t("pl.other"), onclick: () => levelPicker(() => go("#/")) },
        ],
      });
    },
  });
}

// =============== LỘ TRÌNH ===============

export function levelPicker(after, { navigate = true } = {}) {
  let close;
  close = sheet(
    h(
      "div.level-picker",
      h("h2", t("path.pickLevel")),
      A.levelsSync().map((l) => {
        const ready = A.isReady(l.lv);
        const loaded = ready && A.wordsOf(l.lv).length > 0;
        const p = loaded ? A.levelProgress(l.lv) : null;
        return h(
          `button.level-opt${l.lv === A.level() ? ".on" : ""}${ready ? "" : ".soon"}`,
          { type: "button", "aria-disabled": ready ? null : "true", style: { "--lv": lvColor(l.lv) }, onclick: () => (ready ? (close(), switchLevel(l.lv, after, { navigate })) : soonToast(l.lv)) },
          h("span.lv-badge", { style: { background: lvColor(l.lv) } }, l.lv >= 7 ? "7–9" : l.lv),
          h("span", h("b", l.label, ready ? null : [" ", soonTag()]), h("small", `${fmtNumber(l.count)} ${t("c.words")}${p ? ` · ${p.done}/${p.total} ${t("c.lessons")}` : ""}`)),
        );
      }),
    ),
  );
}

export async function switchLevel(lv, after, { navigate = true } = {}) {
  if (!A.isReady(lv)) return soonToast(lv); // cấp "Sắp có": không đổi cấp, không vào bài
  A.setSetting({ level: lv });
  after?.();
  await A.loadLevel(lv);
  toast(t("path.switched", { lv: A.levelLabel(lv) }), "good");
  if (navigate) go("#/");
}

const unitUnlocked = (lv, u) => u === 0 || Boolean(A.unitResult(lv, u - 1)) || Boolean(A.unitResult(lv, u));

export async function viewHome(root) {
  clear(root).append(skeleton(4));
  await A.index();
  const lv = A.level();
  const words = await A.loadLevel(lv);
  const total = A.unitsOf(lv);
  const next = A.nextUnit(lv);
  const due = A.dueIds().length;
  const goal = A.settings().dailyGoal;
  const xpToday = A.todayXp();
  const prog = A.levelProgress(lv);
  const todo = words.filter((w) => w.rv === "todo").length;

  const hero = h(
    "section.hero",
    { style: { "--lv": lvColor(lv) } },
    h(
      "div.hero-main",
      h("button.eyebrow.hero-level", { type: "button", onclick: () => levelPicker(), "aria-label": t("path.pickLevel") }, `${A.levelLabel(lv)} ▾`),
      h("h1", prog.done === 0 ? t("path.begin") : prog.done >= total ? t("path.allDone") : t("path.lessonOf", { n: next + 1, total })),
      h("p", t("path.summary", { words: fmtNumber(words.length), units: total, size: A.UNIT_SIZE })),
      h(
        "div.hero-actions",
        h("button.btn.light", { type: "button", onclick: () => go(`#/lesson/${lv}/${next}`) }, prog.done ? t("path.continue") : t("path.start1")),
        due ? h("button.btn.outline-light", { type: "button", onclick: () => go("#/review") }, t("path.reviewN", { n: due })) : null,
      ),
    ),
    ring(xpToday / Math.max(1, goal), `${xpToday}`, `/${goal} XP`),
  );

  const levelStrip = h(
    "div.level-strip",
    { role: "tablist", "aria-label": t("path.pickLevel") },
    A.levelsSync().map((l) =>
      h(
        `button${l.lv === lv ? ".on" : ""}${A.isReady(l.lv) ? "" : ".soon"}`,
        { type: "button", role: "tab", "aria-selected": String(l.lv === lv), "aria-disabled": A.isReady(l.lv) ? null : "true", style: { "--lv": lvColor(l.lv) }, onclick: () => l.lv !== lv && switchLevel(l.lv) },
        l.label,
        A.isReady(l.lv) ? null : [" ", soonTag()],
      ),
    ),
  );

  const path = h("section.path");
  const chapters = Math.ceil(total / A.UNITS_PER_CHAPTER);
  // Cấp lớn (HSK 7–9: ~700 bài) chỉ vẽ quanh bài hiện tại, bấm để mở thêm
  let from = Math.max(0, Math.floor(next / A.UNITS_PER_CHAPTER) - 2);
  let to = Math.min(chapters, from + 12);
  const draw = () => {
    clear(path);
    if (from > 0) add(path, h("button.btn.wide", { type: "button", onclick: () => ((from = Math.max(0, from - 12)), draw()) }, t("path.earlier")));
    for (let c = from; c < to; c += 1) add(path, chapter(lv, c, total, next, words));
    if (to < chapters) add(path, h("button.btn.wide", { type: "button", onclick: () => ((to = Math.min(chapters, to + 12)), draw()) }, t("path.more", { n: chapters - to })));
  };
  draw();
  clear(root).append(hero, levelStrip, soonNotice(), todo ? h("p.notice", t("path.todoNote", { n: fmtNumber(todo) })) : null, quickRow(due), path);
  // Mới học vài bài đầu thì giữ đầu trang (thấy thẻ tổng quan); học xa hơn mới cuộn tới bài hiện tại
  if (next >= 3) root.querySelector(".node.current")?.scrollIntoView({ block: "center", behavior: "instant" });
  else window.scrollTo({ top: 0 });
}

function chapter(lv, c, total, next, words) {
  const first = c * A.UNITS_PER_CHAPTER;
  const last = Math.min(total, first + A.UNITS_PER_CHAPTER) - 1;
  const sample = words.slice(first * A.UNIT_SIZE, first * A.UNIT_SIZE + 6);
  let allDone = true;
  const nodes = [];
  for (let u = first; u <= last; u += 1) {
    const r = A.unitResult(lv, u);
    if (!r) allDone = false;
    const open = unitUnlocked(lv, u);
    const isNext = u === next && !r;
    const offset = [0, 1, 2, 1, 0, -1, -2, -1][u % 8];
    nodes.push(
      h(
        `button.node${r ? ".done" : ""}${isNext ? ".current" : ""}${open ? "" : ".locked"}`,
        { type: "button", style: { "--x": offset }, "aria-label": `${t("c.lesson")} ${u + 1}${r ? `, ${r.stars}★` : open ? "" : `, ${t("path.locked")}`}`, onclick: () => unitSheet(lv, u) },
        h("span.node-num", r ? "✓" : open ? String(u + 1) : "🔒"),
        r ? h("span.stars", "★".repeat(r.stars) + "☆".repeat(3 - r.stars)) : null,
        isNext ? h("span.bubble", t("path.go")) : null,
      ),
    );
  }
  return h(
    `div.chapter${allDone ? ".done" : ""}`,
    h(
      "div.chapter-head",
      h("div", h("div.eyebrow", `${t("path.chapter")} ${c + 1}`), h("div.chapter-words", { lang: "zh-CN" }, sample.map((w) => w.h).join(" · "))),
      h("span.chip", `${t("c.lesson")} ${first + 1}–${last + 1}`),
    ),
    h("div.nodes", nodes),
  );
}

function quickRow(due) {
  const tiles = [
    { icon: "🔁", label: t("nav.review"), sub: due ? t("path.dueN", { n: due }) : t("path.noDue"), go: "#/review", hot: due > 0 },
    { icon: "🎧", label: t("type.listen"), sub: t("drill.listen"), go: "#/drill/listen" },
    { icon: "🎙️", label: t("type.speak"), sub: t("drill.speak"), go: "#/drill/speak" },
    { icon: "📖", label: t("nav.lookup"), sub: t("look.dictSub"), go: "#/ref/dict" },
  ];
  return h(
    "section.quick",
    tiles.map((x) => h(`button.quick-tile${x.hot ? ".hot" : ""}`, { type: "button", onclick: () => go(x.go) }, h("span.qi", x.icon), h("b", x.label), h("small", x.sub))),
  );
}

function ring(ratio, big, small) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, ratio || 0));
  return h("div.ring", {
    html: `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="${r}" class="ring-bg"/><circle cx="40" cy="40" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg><div class="ring-text"><b>${big}</b><small>${small}</small></div>`,
    title: t("path.goalToday"),
  });
}

function unitSheet(lv, u) {
  const words = A.unitWords(lv, u);
  const r = A.unitResult(lv, u);
  const open = unitUnlocked(lv, u);
  let close;
  close = sheet(
    h(
      "div.unit-sheet",
      h("div.eyebrow", `${A.levelLabel(lv)} · ${t("c.lesson")} ${u + 1}`),
      h("h2", r ? `${"★".repeat(r.stars)} · ${pct(r.best)}` : open ? t("path.newLesson") : t("path.locked")),
      h("ul.word-chips", words.map((w) => h("li", { onclick: () => A.speakWord(w) }, h("b", { lang: "zh-CN" }, w.h), h("small", w.py), h("span", glossInline(w))))),
      open
        ? h("button.btn.primary.wide", { type: "button", onclick: () => (close(), go(`#/lesson/${lv}/${u}`)) }, r ? t("path.redo") : t("path.startLesson"))
        : h("div", h("p.muted", t("path.lockedHelp")), h("button.btn.wide", { type: "button", onclick: () => (close(), go(`#/lesson/${lv}/${u}/skip`)) }, t("path.skipTest"))),
    ),
  );
}

// =============== BÀI HỌC ===============

export async function viewLesson(root, lv, u, mode) {
  if (!A.isReady(lv)) return (soonToast(lv), go("#/")); // gõ thẳng #/lesson/7/…: không vào bài
  clear(root).append(skeleton(3));
  await A.index();
  const pool = await A.loadLevel(lv);
  const words = A.unitWords(lv, u);
  if (!words.length) return go("#/");
  const started = Date.now();
  const skip = mode === "skip";
  const start = async () => {
    // Vượt bài: dùng bài luyện "gõ / chọn" của lõi trên đúng 8 từ, không cho làm lại
    const qs = skip ? await A.drillPlan("hanzi", words, pool) : await A.lessonPlan(words, pool);
    if (!qs.length) {
      toast(t("s.noQuestions"), "bad");
      return go("#/");
    }
    runSession(root, qs, {
      retryWrong: !skip,
      exitTo: "#/",
      onFinish: (res) => {
        const acc = res.answered ? res.firstTryRight / res.answered : 1;
        const ids = words.map((w) => w.id);
        const total = A.unitsOf(lv);
        if (skip && acc < 0.85) {
          return resultScreen(root, { title: t("les.skipFail"), emoji: "😅", acc, wordIds: ids, perWord: res.perWord, started, note: t("les.skipNote"), actions: [{ label: t("les.learnThis"), hash: `#/lesson/${lv}/${u}`, primary: true }, { label: t("les.toPath"), hash: "#/" }] });
        }
        ids.forEach((id) => A.introduce(id, res.perWord.get(id) || 0));
        const stars = A.finishUnit(lv, u, acc);
        const xp = 10 + res.correct * 2 + (acc >= 0.999 ? 5 : 0);
        resultScreen(root, {
          title: stars === 3 ? t("les.great") : stars === 2 ? t("les.good") : t("les.done"),
          acc,
          xp,
          stars,
          wordIds: ids,
          perWord: res.perWord,
          started,
          actions: [u + 1 < total ? { label: t("les.next"), hash: `#/lesson/${lv}/${u + 1}`, primary: true } : null, { label: t("les.toPath"), hash: "#/" }],
        });
      },
    });
  };
  if (skip) return start();
  introCards(root, words, lv, u, start);
}

function introCards(root, words, lv, u, onDone) {
  let i = 0;
  const dots = h("div.dots", words.map(() => h("i")));
  const stage = h("div.intro-stage");
  const nextBtn = h("button.btn.primary.wide", { type: "button" });
  let off = () => {};
  const done = () => (off(), onDone());
  clear(root).append(
    h(
      "div.session.intro",
      h(
        "div.session-head",
        h("button.icon-btn", { type: "button", "aria-label": t("c.exit"), onclick: () => go("#/") }, "✕"),
        h("div.intro-title", `${A.levelLabel(lv)} · ${t("c.lesson")} ${u + 1} · ${t("les.newWords")}`),
        h("button.link", { type: "button", onclick: done }, t("les.skipIntro")),
      ),
      dots,
      stage,
      h("div.intro-foot", h("button.btn.ghost", { type: "button", "aria-label": t("c.back"), onclick: () => show(i - 1) }, "←"), nextBtn),
    ),
  );
  off = onKeys((e) => {
    if (e.key === "ArrowRight" || e.key === "Enter") (e.preventDefault(), nextBtn.click());
    if (e.key === "ArrowLeft") show(i - 1);
  });
  // Vuốt trái / phải trên mobile để chuyển thẻ từ mới (Brief §5.3)
  let touchX = null;
  stage.addEventListener("touchstart", (e) => { touchX = e.changedTouches?.[0]?.clientX ?? null; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = (e.changedTouches?.[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (dx < -48) nextBtn.click();
    else if (dx > 48) show(i - 1);
  }, { passive: true });
  nextBtn.addEventListener("click", () => (i < words.length - 1 ? show(i + 1) : done()));
  function show(k) {
    if (k < 0 || k >= words.length) return;
    i = k;
    [...dots.children].forEach((d, idx) => d.classList.toggle("on", idx <= i));
    nextBtn.textContent = i === words.length - 1 ? t("les.startPractice") : t("c.next");
    clear(stage).append(wordCard(words[i]));
    A.speakWord(words[i]);
  }
  show(0);
}
