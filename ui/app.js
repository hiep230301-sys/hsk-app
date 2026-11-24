// Khởi động app: khung (sidebar desktop, thanh dưới mobile), router theo hash, PWA.
import { h, clear, toast, setSoundGetter, go } from "./components/dom.js";
import { t, applyLang } from "./i18n.js";
import * as A from "./api.js";
import { viewWelcome, viewPlacement, viewHome, viewLesson, levelPicker } from "./screens/learn.js";
import { viewReview, viewPractice, viewDrill, viewFlash, viewTest } from "./screens/practice.js";
import { viewLookup } from "./screens/lookup.js";
import { viewMe, viewSettings, viewAbout, applyTheme } from "./screens/me.js";

const NAV = [
  { hash: "#/", icon: "🏯", key: "nav.learn", match: /^#\/?(lesson.*)?$/ },
  { hash: "#/review", icon: "🔁", key: "nav.review", match: /^#\/review/ },
  { hash: "#/practice", icon: "🎯", key: "nav.practice", match: /^#\/(practice|drill|flash|test)/ },
  { hash: "#/ref", icon: "📖", key: "nav.lookup", match: /^#\/(ref|lookup)/ },
  { hash: "#/me", icon: "👤", key: "nav.me", match: /^#\/(me|settings|about)/ },
];
const SIDE_EXTRA = [
  { hash: "#/settings", icon: "⚙️", key: "nav.settings", match: /^#\/settings/ },
  { hash: "#/about", icon: "ℹ️", key: "nav.about", match: /^#\/about/ },
];
const SESSION = /^(lesson|review|drill|flash|test|placement|welcome)$/;

setSoundGetter(() => A.settings().sound !== false);
applyLang();
applyTheme();

const app = document.getElementById("app");
const main = h("main#view", { tabindex: "-1" });
const topbar = h("header.topbar");
const offlineBar = h("div.offline-banner", { role: "status", "aria-live": "polite", hidden: navigator.onLine !== false });
const nav = h("nav.nav");
const brandSub = h("small");
clear(app).append(
  h("a.skip-link", { href: "#view" }, "↓"),
  h("aside.side", h("a.brand", { href: "#/" }, h("span.logo", { lang: "zh-CN" }, "汉"), h("span", h("b", "Hán Ngữ Mỗi Ngày"), brandSub)), nav),
  h("div.content", topbar, offlineBar, main),
);

function syncOffline() {
  const off = navigator.onLine === false;
  offlineBar.hidden = !off;
  offlineBar.textContent = off ? `📡 ${t("app.offline")}` : "";
}
window.addEventListener("online", syncOffline);
window.addEventListener("offline", syncOffline);
syncOffline();

function navItem(n, hash, due) {
  const on = n.match.test(hash) && !(n.key === "nav.me" && SIDE_EXTRA.some((x) => x.match.test(hash)) && window.matchMedia("(min-width: 900px)").matches);
  return h(
    `a.nav-item${on ? ".on" : ""}${n.extra ? ".side-only" : ""}`,
    { href: n.hash, "aria-current": on ? "page" : null },
    h("span.ni", { "aria-hidden": "true" }, n.icon),
    h("span.nl", t(n.key)),
    n.hash === "#/review" && due ? h("span.badge-count", { "aria-label": t("path.dueN", { n: due }) }, due > 99 ? "99+" : String(due)) : null,
  );
}

function renderNav() {
  const hash = location.hash || "#/";
  const due = A.dueIds().length;
  nav.setAttribute("aria-label", t("nav.main"));
  brandSub.textContent = t("app.tagline");
  clear(nav).append(...NAV.map((n) => navItem(n, hash, due)), ...SIDE_EXTRA.map((n) => navItem({ ...n, extra: true }, hash, 0)));
}

function renderTop() {
  const s = A.st();
  const xp = A.todayXp();
  const goal = A.settings().dailyGoal;
  const goalOk = xp >= goal;
  clear(topbar).append(
    h("button.level-chip", { type: "button", onclick: () => levelPicker(), "aria-label": t("path.pickLevel") }, A.levelLabel(A.level()), h("span.caret", "▾")),
    h(
      "div.top-stats",
      h(`span.top-stat${s.lastActive === A.dayKey() ? ".lit" : ""}`, { title: t("me.streak") }, "🔥 ", h("b", String(s.streak || 0))),
      h(`span.top-stat${goalOk ? ".lit" : ""}`, { title: t("path.goalToday") }, goalOk ? "🎯 " : "⭐ ", h("b", `${xp}`), h("small", `/${goal}`)),
      h("a.icon-btn.top-gear", { href: "#/settings", "aria-label": t("nav.settings"), title: t("nav.settings") }, "⚙️"),
    ),
  );
}

let renderId = 0;
async function route() {
  const id = ++renderId;
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts[0] && !A.isOnboarded()) return go("#/welcome");
  const inSession = SESSION.test(parts[0] || "");
  document.body.classList.toggle("in-session", inSession);
  renderNav();
  renderTop();
  A.stopSpeaking();
  document.querySelectorAll(".sheet-wrap").forEach((x) => x.remove());
  try {
    switch (parts[0]) {
      case undefined:
        await viewHome(main);
        break;
      case "welcome":
        await viewWelcome(main);
        break;
      case "placement":
        await viewPlacement(main);
        break;
      case "lesson":
        await viewLesson(main, Number(parts[1]), Number(parts[2]), parts[3]);
        break;
      case "review":
        await viewReview(main, parts[1]);
        break;
      case "practice":
        await viewPractice(main);
        break;
      case "drill":
        await viewDrill(main, parts[1]);
        break;
      case "flash":
        await viewFlash(main);
        break;
      case "test":
        await viewTest(main);
        break;
      case "ref":
      case "lookup":
        await viewLookup(main, parts[1], parts[2]);
        break;
      case "me":
        await viewMe(main);
        break;
      case "settings":
        await viewSettings(main);
        break;
      case "about":
        await viewAbout(main);
        break;
      default:
        return go("#/");
    }
  } catch (e) {
    if (id !== renderId) return;
    console.error(e);
    clear(main).append(
      h("div.empty", h("div.empty-icon", "⚠️"), h("h2", t("app.error")), h("p.muted", e.message), h("button.btn.primary", { type: "button", onclick: () => location.reload() }, t("app.reload")), h("a.btn", { href: "#/" }, t("les.toPath"))),
    );
  }
  if (id !== renderId) return;
  if (!inSession) {
    main.focus({ preventScroll: true });
    if (parts[0] !== undefined) window.scrollTo({ top: 0 });
  }
}

let lastLang = A.settings().uiLang;
A.S.subscribe?.(() => {
  if (A.settings().uiLang !== lastLang) {
    lastLang = A.settings().uiLang;
    applyLang();
  }
  renderTop();
  renderNav();
});
window.addEventListener("hashchange", route);
window.matchMedia("(min-width: 900px)").addEventListener?.("change", renderNav);

// Khởi động
try {
  A.S.checkStreak();
} catch (e) {
  console.warn(e);
}
document.documentElement.dataset.ready = "1";
A.index()
  .then(route)
  .catch((e) => {
    console.error(e);
    clear(main).append(h("div.empty", h("div.empty-icon", "⚠️"), h("h2", t("app.error")), h("p.muted", e.message), h("button.btn.primary", { type: "button", onclick: () => location.reload() }, t("app.reload"))));
    toast(e.message, "bad", 5000);
  });

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
