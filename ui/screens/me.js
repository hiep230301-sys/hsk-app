// Hồ sơ tiến độ, Cài đặt, Giới thiệu (ghi công nguồn).
import { h, clear, toast, pct, fmtNumber, go } from "../components/dom.js";
import { t, lang, applyLang } from "../i18n.js";
import * as A from "../api.js";
import { switchLevel, soonTag } from "./learn.js";

const lvColor = (lv) => `var(--lv${Math.min(7, Number(lv) || 1)})`;

// =============== HỒ SƠ ===============

export async function viewMe(root) {
  await A.index();
  const s = A.st();
  const cards = A.cards();
  const ids = Object.keys(cards);
  const mastered = ids.filter((id) => A.strengthOf(id) === "mastered").length;
  const stats = s.stats || {};
  const badges = A.BADGES();
  clear(root).append(
    h("header.page-head", h("h1", t("me.title"))),
    h(
      "div.stat-grid",
      bigStat("🔥", s.streak || 0, t("me.streak"), `${t("me.bestStreak", { n: s.bestStreak ?? s.streak ?? 0 })}${s.freezes ? ` · ${t("me.freezes", { n: s.freezes })}` : ""}`),
      bigStat("⭐", fmtNumber(s.xp || 0), t("me.totalXp"), t("me.todayXp", { n: A.todayXp(), goal: A.settings().dailyGoal })),
      bigStat("📚", ids.length, t("me.learned"), t("me.mastered", { n: mastered })),
      bigStat("🔁", A.dueIds().length, t("me.due"), stats.lessons != null ? t("me.lessons", { n: stats.lessons }) : ""),
    ),
    h("section.card", h("h2", t("me.weeks")), heatmap(s.history || {})),
    h(
      "section.card",
      h("h2", t("me.byLevel")),
      A.levelsSync().map((l) => {
        const prefix = `n${l.lv}-`;
        const mine = ids.filter((id) => id.startsWith(prefix));
        const m = mine.filter((id) => A.strengthOf(id) === "mastered").length;
        const ready = A.isReady(l.lv);
        const loaded = ready && A.wordsOf(l.lv).length > 0;
        const p = loaded ? A.levelProgress(l.lv) : null;
        return h(
          `button.lv-row${ready ? "" : ".soon"}`,
          { type: "button", "aria-disabled": ready ? null : "true", onclick: () => switchLevel(l.lv), title: ready ? t("path.pickLevel") : t("lv.soon") },
          h("span.lv-badge", { style: { background: lvColor(l.lv) } }, l.lv >= 7 ? "7–9" : l.lv),
          h(
            "div.lv-bar-wrap",
            h("div.lv-bar", h("i.l", { style: { width: pct(mine.length / Math.max(1, l.count)) } }), h("i.m", { style: { width: pct(m / Math.max(1, l.count)) } })),
            h("small", `${l.label}: ${mine.length}/${fmtNumber(l.count)} ${t("c.words")} · ${t("me.mastered", { n: m })}${p ? ` · ${p.done}/${p.total} ${t("c.lessons")}` : ""}`, ready ? null : [" ", soonTag()]),
          ),
        );
      }),
    ),
    badges.length
      ? h(
          "section.card",
          h("h2", `${t("me.badges")} (${badges.filter((b) => A.hasBadge(b.id)).length}/${badges.length})`),
          h("div.badges", badges.map((b) => h(`div.badge${A.hasBadge(b.id) ? ".got" : ""}`, { title: bl(b, "desc") }, h("span", b.icon || "🏅"), h("b", bl(b, "name")), h("small", bl(b, "desc"))))),
        )
      : null,
    h(
      "div.link-row",
      h("a.btn", { href: "#/settings" }, `⚙️ ${t("nav.settings")}`),
      h("a.btn", { href: "#/about" }, `ℹ️ ${t("nav.about")}`),
    ),
  );
}

const bl = (b, k) => (lang() === "en" ? b[`${k}En`] || b[`${k}_en`] || b[k] : b[k]) || "";

function bigStat(icon, value, label, sub) {
  return h("div.big-stat", h("span.bs-icon", icon), h("b", String(value)), h("span", label), h("small.muted", sub));
}

function heatmap(hist) {
  const days = 7 * 12;
  const end = new Date();
  const cells = [];
  for (let k = days - 1; k >= 0; k -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - k);
    const e = hist[A.dayKey(d.getTime())];
    const xp = (typeof e === "number" ? e : e?.xp) || 0;
    const lvl = e?.frozen && !xp ? "f" : xp === 0 ? 0 : xp < 20 ? 1 : xp < 50 ? 2 : xp < 100 ? 3 : 4;
    cells.push(h(`i.h${lvl}`, { title: `${d.toLocaleDateString(lang() === "en" ? "en-GB" : "vi-VN")}: ${xp} XP` }));
  }
  return h("div.heat-wrap", h("div.heat", cells), h("div.heat-legend.small.muted", `${t("me.less")} `, h("i.h1"), h("i.h2"), h("i.h3"), h("i.h4"), ` ${t("me.more")}`));
}

// =============== CÀI ĐẶT ===============

export async function viewSettings(root) {
  await A.index();
  const s = A.settings();
  const voices = A.chineseVoices();
  const rerender = () => viewSettings(root);
  const seg = (key, options, after) =>
    h(
      "div.segmented",
      { role: "group" },
      options.map(([v, label]) =>
        h(`button${s[key] === v ? ".on" : ""}`, { type: "button", "aria-pressed": String(s[key] === v), onclick: () => (A.setSetting({ [key]: v }), after?.(v), rerender()) }, label),
      ),
    );
  const fileInput = h("input", {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    onchange: async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        A.S.importJson(await f.text());
        applyLang();
        toast(t("set.restored"), "good");
        go("#/me");
      } catch (err) {
        toast(err.message, "bad", 4000);
      }
    },
  });
  clear(root).append(
    h("header.page-head", h("a.back-link", { href: "#/me" }, `← ${t("nav.me")}`), h("h1", t("nav.settings"))),
    h(
      "section.card.settings",
      h("h2", t("set.display")),
      row(t("set.uiLang"), seg("uiLang", [["vi", "Tiếng Việt"], ["en", "English"]], () => applyLang())),
      row(t("set.gloss"), seg("gloss", [["vi", t("set.glossVi")], ["en", t("set.glossEn")], ["both", t("set.glossBoth")]]), t("set.glossHelp")),
      row(t("set.pinyin"), seg("pinyin", [["always", t("set.pyAlways")], ["hint", t("set.pyHint")], ["off", t("set.pyOff")]]), t("set.pinyinHelp")),
      row(t("set.toneColors"), toggle(A.toneColorsOn(), (v) => (A.setToneColors(v), rerender()), t("set.toneColors")), t("set.toneColorsHelp")),
      row(t("set.theme"), seg("theme", [["auto", t("set.thAuto")], ["light", t("set.thLight")], ["dark", t("set.thDark")]], () => applyTheme())),
    ),
    h(
      "section.card.settings",
      h("h2", t("set.study")),
      row(
        t("set.level"),
        h("select.select", { "aria-label": t("set.level"), onchange: (e) => switchLevel(Number(e.target.value)) }, A.levelsSync().map((l) => h("option", { value: l.lv, selected: l.lv === A.level(), disabled: !A.isReady(l.lv) }, `${l.label} · ${A.isReady(l.lv) ? `${fmtNumber(l.count)} ${t("c.words")}` : t("lv.soon")}`))),
      ),
      row(
        t("set.goal"),
        h(
          "select.select",
          { "aria-label": t("set.goal"), onchange: (e) => A.setSetting({ dailyGoal: Number(e.target.value) }) },
          [20, 50, 100, 200].map((v) => h("option", { value: v, selected: v === Number(s.dailyGoal) }, `${t(`set.goal${v}`)} · ${v} XP`)),
        ),
      ),
    ),
    h(
      "section.card.settings",
      h("h2", t("set.audio")),
      row(t("set.speed"), seg("speed", [["slow", t("set.spSlow")], ["normal", t("set.spNormal")], ["fast", t("set.spFast")]], () => setTimeout(() => A.speak("你好，我们一起学习中文。"), 50))),
      row(
        t("set.voice"),
        voices.length
          ? h(
              "select.select",
              { "aria-label": t("set.voice"), onchange: (e) => (A.setSetting({ voice: e.target.value }), A.speak("你好")) },
              h("option", { value: "" }, t("set.voiceAuto")),
              voices.map((v) => h("option", { value: v.voiceURI, selected: v.voiceURI === s.voice }, `${v.name} (${v.lang})`)),
            )
          : h("span.muted.small", t("set.noVoice")),
      ),
      row(t("set.sound"), toggle(Boolean(s.sound), (v) => A.setSetting({ sound: v }), t("set.sound"))),
    ),
    h(
      "section.card.settings",
      h("h2", t("set.data")),
      h(
        "div.settings-actions",
        h("button.btn", { type: "button", onclick: download }, `⬇ ${t("set.backup")}`),
        h("button.btn", { type: "button", onclick: () => fileInput.click() }, `⬆ ${t("set.restore")}`),
        h("button.btn.danger", { type: "button", onclick: () => confirm(t("set.resetConfirm")) && (A.S.resetAll(), applyLang(), applyTheme(), toast(t("set.resetDone")), go("#/welcome")) }, t("set.reset")),
        fileInput,
      ),
      h("p.muted.small", t("set.dataHelp")),
    ),
    h("div.link-row", h("a.btn", { href: "#/placement" }, `🧭 ${t("set.placement")}`), h("a.btn", { href: "#/about" }, `ℹ️ ${t("nav.about")}`)),
  );
}

export function applyTheme() {
  const th = A.settings().theme;
  if (th === "light" || th === "dark") document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
}

function row(label, control, help) {
  return h("div.set-row", h("span.set-label", label, help ? h("small.muted", help) : null), control);
}

function toggle(value, onChange, label) {
  const input = h("input", { type: "checkbox", checked: value, "aria-label": label, onchange: (e) => onChange(e.target.checked) });
  return h("label.switch", input, h("span"));
}

function download() {
  const blob = new Blob([A.S.exportJson()], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `hsk-tien-do-${A.dayKey()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// =============== GIỚI THIỆU ===============

export async function viewAbout(root) {
  const idx = await A.index();
  const total = (idx.levels || []).reduce((s, l) => s + (l.count || 0), 0);
  const src = (name, url, lic, what) => h("li", h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, name), ` — ${lic}`, h("div.muted.small", what));
  clear(root).append(
    h("header.page-head", h("a.back-link", { href: "#/me" }, `← ${t("nav.me")}`), h("h1", t("nav.about"))),
    h("section.card", h("h2", t("ab.appTitle")), h("p", t("ab.app", { n: fmtNumber(total) })), h("p.muted.small", `${t("ab.dataBuilt")}: ${idx.built || "—"} · v${idx.version ?? "—"}`)),
    h(
      "section.card",
      h("h2", t("ab.sources")),
      h(
        "ul.credits",
        src("complete-hsk-vocabulary (drkameleon)", "https://github.com/drkameleon/complete-hsk-vocabulary", "MIT", t("ab.srcHsk")),
        src("CC-CEDICT", "https://cc-cedict.org/wiki/", "CC BY-SA 4.0", t("ab.srcCedict")),
        src("Make Me a Hanzi", "https://github.com/skishore/makemeahanzi", t("ab.licMmah"), t("ab.srcMmah")),
        src("hanzi-writer", "https://hanziwriter.org/", "MIT", t("ab.srcWriter")),
      ),
      (idx.credits || []).length ? h("p.muted.small", `${t("ab.indexCredits")}: ${idx.credits.join(" · ")}`) : null,
    ),
    h(
      "section.card",
      h("h2", t("ab.reviewTitle")),
      h("p", h("span.rv.rv-ai", t("rv.ai")), " ", t("ab.reviewAi")),
      h("p", h("span.rv.rv-todo", t("rv.todo")), " ", t("ab.reviewTodo")),
      h("p.muted.small", t("ab.reviewPdf")),
    ),
    h("section.card", h("h2", t("ab.offlineTitle")), h("p", t("ab.offline")), h("p.muted.small", t("ab.speech"))),
  );
}
