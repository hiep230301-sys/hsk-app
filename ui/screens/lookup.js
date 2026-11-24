// Tra cứu: Từ điển 1–9, Ngữ pháp, Bảng pinyin, Thanh điệu, Bộ thủ, Lượng từ.
import { h, clear, sheet, fmtNumber, go, add } from "../components/dom.js";
import { t, lang } from "../i18n.js";
import * as A from "../api.js";
import { wordCard, wordRow, speakerBtn, exGloss } from "../components/word.js";
import { strokeAnimator } from "../writer.js";

const SECTIONS = [
  { id: "dict", icon: "📖" },
  { id: "grammar", icon: "🧱" },
  { id: "pinyin", icon: "🔤" },
  { id: "tones", icon: "〰️" },
  { id: "radicals", icon: "部" },
  { id: "classifiers", icon: "个" },
];

/** Chọn chuỗi theo ngôn ngữ giao diện: x_vi / x_en, hoặc vi / en. */
function L(o, base) {
  if (!o) return "";
  const a = lang() === "en" ? ["en", "vi"] : ["vi", "en"];
  for (const s of a) {
    const v = base ? o[`${base}_${s}`] : o[s];
    if (v) return v;
  }
  return (base && o[base]) || "";
}
/** Hai ngôn ngữ theo cài đặt gloss (nghĩa của mục tra cứu). */
function glossPair(o, base) {
  const g = A.settings().gloss;
  const vi = base ? o[`${base}_vi`] : o.vi;
  const en = base ? o[`${base}_en`] : o.en;
  const out = [];
  if (vi && g !== "en") out.push(h("div.g-vi", { lang: "vi" }, vi));
  if (en && (g !== "vi" || !vi)) out.push(h(`div.g-en${out.length ? ".sub" : ""}`, { lang: "en" }, en));
  return out;
}
const aiTag = (o) => (o?.rv === "ai" ? h("span.rv.rv-ai", { title: t("rv.aiTitle") }, t("rv.ai")) : null);
const listOf = (data, ...keys) => {
  if (Array.isArray(data)) return data;
  for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
  return [];
};
const zhBtn = (text, cls = "") => h(`button.zh-chip${cls}`, { type: "button", lang: "zh-CN", onclick: (e) => (e.stopPropagation(), A.speak(text)) }, text);

function examples(list = []) {
  if (!list.length) return null;
  return h(
    "div.examples",
    list.map((ex) =>
      typeof ex === "string"
        ? h("div.ex", { onclick: () => A.speak(ex) }, h("div.ex-zh", { lang: "zh-CN" }, ex, " ", speakerBtn(ex, ".mini")))
        : h(
            "div.ex",
            { onclick: () => A.speak(ex.zh || ex.h) },
            h("div.ex-zh", { lang: "zh-CN" }, ex.zh || ex.h || "", " ", speakerBtn(ex.zh || ex.h, ".mini")),
            ex.py ? h("div.ex-py", ex.py, ex.say && ex.say !== ex.py ? h("span.muted", ` → ${ex.say}`) : null) : null,
            exGloss(ex),
          ),
    ),
  );
}

function tabs(active) {
  return h(
    "nav.segmented.scroll.look-tabs",
    { "aria-label": t("nav.lookup") },
    SECTIONS.map((s) => h(`button${s.id === active ? ".on" : ""}`, { type: "button", "aria-current": s.id === active ? "page" : null, onclick: () => go(`#/ref/${s.id}`) }, t(`look.${s.id}`))),
  );
}

async function refOrEmpty(root, name) {
  try {
    const data = await A.loadRef(name);
    if (data) return data;
  } catch (e) {
    console.warn(e);
  }
  add(root, h("div.empty", h("div.empty-icon", "🗂️"), h("h2", t("look.noData")), h("p.muted", t("look.noDataSub", { name: `data/ref/${name}.json` }))));
  return null;
}

export async function viewLookup(root, section, arg) {
  await A.index();
  if (!section) return hub(root);
  const view = { dict, grammar, pinyin, tones, radicals, classifiers }[section];
  if (!view) return go("#/ref");
  clear(root).append(h("header.page-head", h("a.back-link", { href: "#/ref" }, `← ${t("nav.lookup")}`), h("h1", t(`look.${section}`))), tabs(section));
  const body = h("div.look-body");
  add(root, body);
  await view(body, arg);
}

function hub(root) {
  const total = A.levelsSync().reduce((s, l) => s + (l.count || 0), 0);
  clear(root).append(
    h("header.page-head", h("h1", t("look.title")), h("p.muted", t("look.sub"))),
    h(
      "div.drill-grid.look-grid",
      SECTIONS.map((s) =>
        h(
          "button.drill",
          { type: "button", onclick: () => go(`#/ref/${s.id}`) },
          h("span.di", { lang: "zh-CN" }, s.icon),
          h("b", t(`look.${s.id}`)),
          h("small", s.id === "dict" ? t("look.dictCount", { n: fmtNumber(total) }) : t(`look.${s.id}Sub`)),
        ),
      ),
    ),
  );
}

// =============== TỪ ĐIỂN ===============

async function dict(body, arg) {
  let level = Number(sessionStorage.getItem("hsk2-dict-lv") ?? A.level());
  let filter = "all";
  let limit = 60;
  let loadedAll = Boolean(A.allLoaded());
  let otherFrom = -1; // có từ khóa + đang lọc một cấp: found[otherFrom…] là kết quả ở các cấp khác (lỗi KCS M2)
  const input = h("input.search", { type: "search", placeholder: t("dict.placeholder"), "aria-label": t("dict.placeholder"), autocomplete: "off", autocapitalize: "off", spellcheck: "false", value: arg ? decodeURIComponent(arg) : "" });
  const recentBox = h("div.recent-row");
  const list = h("div.word-list");
  const countEl = h("div.muted.small", { role: "status", "aria-live": "polite" });
  const levelSel = h(
    "div.segmented.scroll",
    { role: "group", "aria-label": t("dict.level") },
    [{ lv: 0, label: t("dict.all") }, ...A.levelsSync()].map((l) => h(`button${l.lv === level ? ".on" : ""}`, { type: "button", "data-lv": l.lv }, l.label)),
  );
  levelSel.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    level = Number(b.dataset.lv);
    limit = 60;
    sessionStorage.setItem("hsk2-dict-lv", level);
    levelSel.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    render();
  });
  const filterSel = h(
    "select.select",
    { "aria-label": t("dict.strength"), onchange: (e) => ((filter = e.target.value), render()) },
    ["all", "bookmarked", "new", "learning", "known", "mastered"].map((v) =>
      h("option", { value: v }, v === "all" ? t("dict.anyStrength") : v === "bookmarked" ? `⭐ ${t("dict.bookmarked")}` : t(`st.${v}`)),
    ),
  );
  function renderRecent() {
    clear(recentBox);
    const hist = A.searchHistory();
    if (!hist.length) return;
    add(
      recentBox,
      h("span.muted.small", `${t("dict.recent")}:`),
      hist.map((q) => h("button.chip.recent-chip", { type: "button", onclick: () => ((input.value = q), (limit = 60), render()) }, q)),
      h("button.link.small", { type: "button", onclick: () => (A.clearSearchHistory(), renderRecent()) }, t("dict.clear")),
    );
  }
  function find() {
    const q = input.value.trim();
    let found;
    const keep = (list) => (filter === "bookmarked" ? list.filter((w) => A.isBookmarked(w.id)) : filter === "all" ? list : list.filter((w) => A.strengthOf(w.id) === filter));
    otherFrom = -1;
    if (q) {
      found = keep(A.search(q, { levels: level ? [level] : undefined, limit: 500 }));
      // Người đang ở HSK 3 gõ 学校 / "school" (từ HSK 1): xếp kết quả cấp đang lọc trước, rồi nối kết quả các cấp khác
      if (level) {
        const others = keep(A.search(q, { limit: 500 }).filter((w) => Number(w.lv) !== level));
        if (others.length) {
          otherFrom = found.length;
          found = [...found, ...others];
        }
      }
      return found;
    }
    if (level) found = A.wordsOf(level);
    else found = A.allLoaded() || A.wordsOf(A.level());
    return keep(found);
  }
  function render() {
    const found = find();
    const q = input.value.trim();
    countEl.textContent = `${fmtNumber(found.length)}${q && found.length >= 500 ? "+" : ""} ${t("c.words")}${loadedAll ? "" : ` · ${t("dict.loadingAll")}`}`;
    clear(list);
    if (!found.length) add(list, h("p.muted", loadedAll ? t("dict.none") : t("c.loading")));
    found.slice(0, limit).forEach((w, k) => {
      if (k === otherFrom) add(list, h("p.notice", otherFrom === 0 ? t("dict.otherLevels", { lv: A.levelLabel(level) }) : t("dict.alsoOther")));
      add(
        list,
        wordRow(w, () => {
          if (q) (A.addSearchHistory(q), renderRecent());
          sheet(wordCard(w, { inDict: true }));
        }),
      );
    });
    if (found.length > limit) {
      const moreBtn = h("button.btn.wide", { type: "button", onclick: () => ((limit += 120), render()) }, t("dict.more", { n: fmtNumber(found.length - limit) }));
      add(list, moreBtn);
    }
  }
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    limit = 60;
    timer = setTimeout(render, 140);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) (A.addSearchHistory(input.value.trim()), renderRecent());
  });
  renderRecent();
  add(body, input, recentBox, h("div.filters", levelSel, filterSel), countEl, list, h("p.src", t("dict.credit")));
  await A.loadLevel(level || A.level());
  render();
  if (!loadedAll) {
    A.loadAll()
      .then(() => {
        loadedAll = true;
        if (body.isConnected) render();
      })
      .catch((e) => (countEl.textContent = e.message));
  }
}

// =============== NGỮ PHÁP ===============

async function grammar(body, arg) {
  // Chỉ các cấp có file data/ref/grammar-l<N>.json (A.GRAMMAR_LEVELS); #/ref/grammar/7 → cấp cao nhất đang có
  const GL = A.GRAMMAR_LEVELS;
  const want = Number(arg) || A.level();
  const lv = GL.includes(want) ? want : Math.max(...GL.filter((x) => x <= want), Math.min(...GL));
  const sel = h(
    "div.segmented.scroll",
    { role: "group", "aria-label": t("dict.level") },
    A.levelsSync().filter((l) => GL.includes(l.lv)).map((l) => h(`button${l.lv === lv ? ".on" : ""}`, { type: "button", onclick: () => go(`#/ref/grammar/${l.lv}`) }, l.label)),
  );
  add(body, sel);
  const data = await refOrEmpty(body, `grammar-l${lv}`);
  if (!data) return;
  const items = listOf(data, "items", "points", "grammar");
  const input = h("input.search", { type: "search", placeholder: t("gr.placeholder"), "aria-label": t("gr.placeholder") });
  const list = h("div.ref-list");
  const render = () => {
    const q = input.value.trim().toLowerCase();
    clear(list);
    items
      .filter((g) => !q || JSON.stringify([g.title_vi, g.title_en, g.pattern]).toLowerCase().includes(q))
      .forEach((g, k) =>
        add(list, 
          h(
            "details.ref-item",
            { open: k === 0 && !q ? true : null },
            h("summary", h("span.ref-n", String(k + 1)), h("span.ref-title", h("b", L(g, "title")), patternBlocks(g.pattern))),
            h("div.ref-body", glossPair(g, "explain"), examples(g.examples), aiTag(g)),
          ),
        ),
      );
    if (!list.children.length) add(list, h("p.muted", t("dict.none")));
  };
  input.addEventListener("input", render);
  add(body, input, h("p.muted.small", t("gr.count", { n: items.length, lv: A.levelLabel(lv) })), list);
  render();
}

function patternBlocks(pat) {
  if (!pat) return null;
  const parts = String(pat).split(/\s*\+\s*/);
  if (parts.length <= 1) return h("span.pattern", { lang: "zh-CN" }, pat);
  return h(
    "div.pattern-blocks",
    parts.map((p, i) => {
      const hasHan = /\p{Script=Han}/u.test(p);
      return [i > 0 ? h("span.pat-plus", "+") : null, h(`span.pat-blk${hasHan ? ".kw" : ""}`, { lang: hasHan ? "zh-CN" : null }, p)];
    }),
  );
}

const MARKS = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", ü: "ǖǘǚǜ" };
/** Đặt dấu thanh lên âm tiết pinyin không dấu (quy tắc: a/e trước, "ou" → o, còn lại nguyên âm cuối). */
function mark(syl, tone) {
  if (tone < 1 || tone > 4) return syl;
  const s = syl.replace(/v/g, "ü");
  let idx = s.search(/[ae]/);
  if (idx < 0) idx = s.indexOf("ou");
  if (idx < 0) for (let k = s.length - 1; k >= 0; k -= 1) if ("iouü".includes(s[k])) { idx = k; break; }
  if (idx < 0) return s;
  return s.slice(0, idx) + MARKS[s[idx]][tone - 1] + s.slice(idx + 1);
}

let byReading = null;
/** "ma3" → chữ Hán lấy từ từ vựng đã nạp (để đọc đúng thanh bằng giọng máy). */
function readingMap() {
  const words = A.allLoaded() || A.wordsOf(A.level());
  if (byReading && byReading.size0 === words.length) return byReading;
  byReading = new Map();
  byReading.size0 = words.length;
  for (const w of words) {
    const chars = [...w.h];
    const syls = String(w.pn || "").toLowerCase().split(/\s+/);
    if (chars.length !== syls.length) continue;
    chars.forEach((c, k) => {
      const key = syls[k].replace("u:", "ü").replace("v", "ü");
      if (A.isHan(c) && /[1-5]$/.test(key) && !byReading.has(key)) byReading.set(key, c);
    });
  }
  return byReading;
}

async function pinyin(body) {
  const data = await refOrEmpty(body, "pinyin");
  if (!data) return;
  A.loadAll().catch(() => {});
  const ini = (data.initials || []).map((x) => (typeof x === "string" ? { i: x } : x));
  const fin = (data.finals || []).map((x) => (typeof x === "string" ? { f: x } : x));
  const table = data.table || {};
  const sample = data.sample || {};
  const info = h("div.py-info.card", { role: "status", "aria-live": "polite" }, h("p.muted", t("py.tapHint")));

  const showSyllable = (syl) => {
    const sm = sample[syl];
    const map = readingMap();
    const say = (tone) => {
      const ch = map.get(`${syl}${tone}`) || (sm && sm.py === mark(syl, tone) ? sm.zh : null);
      return ch;
    };
    clear(info).append(
      h("div.py-big", syl),
      h(
        "div.tone-row",
        [1, 2, 3, 4].map((tone) => {
          const ch = say(tone);
          return h(
            `button.tone-btn${ch ? "" : ".off"}`,
            { type: "button", disabled: !ch, title: ch ? t("c.listen") : t("py.noChar"), onclick: () => A.speak(ch) },
            h("span.py", mark(syl, tone)),
            h("b", { lang: "zh-CN" }, ch || "–"),
          );
        }),
      ),
      sm ? h("p.muted.small", `${t("py.sample")}: `, h("b", { lang: "zh-CN" }, sm.zh), ` ${sm.py || ""}`) : null,
    );
    const first = [1, 2, 3, 4].map(say).find(Boolean) || sm?.zh;
    if (first) A.speak(first);
  };
  const tip = (o) => {
    clear(info).append(h("div.py-big", o.i ?? o.f ?? ""), o.ipa ? h("div.muted.small", `IPA [${o.ipa}]`) : null, h("p", L(o, "tip") || "—"));
  };

  const grid = h("table.py-table");
  add(grid, 
    h("thead", h("tr", h("th", ""), ini.map((x) => h("th", { scope: "col" }, h("button.py-head", { type: "button", onclick: () => tip(x) }, x.i || "∅"))))),
    h(
      "tbody",
      fin.map((f) =>
        h(
          "tr",
          h("th", { scope: "row" }, h("button.py-head", { type: "button", onclick: () => tip(f) }, f.f)),
          ini.map((x) => {
            const syl = table[`${x.i}|${f.f}`];
            return h("td", syl ? h("button.py-cell", { type: "button", onclick: () => showSyllable(syl) }, syl) : "");
          }),
        ),
      ),
    ),
  );
  const notes = lang() === "en" && data.notes_en ? data.notes_en : data.notes_vi;
  add(body, 
    info,
    h("div.py-scroll", { tabindex: "0", role: "region", "aria-label": t("look.pinyin") }, grid),
    notes ? h("section.card", h("h2", t("py.notes")), h("ul.notes", [].concat(notes).map((n) => h("li", n))), aiTag(data)) : null,
  );
}

// =============== THANH ĐIỆU ===============

const PITCH_SVG = {
  1: { d: "M 10 14 L 90 14", c: "var(--tone-1)" },
  2: { d: "M 10 42 Q 50 30 90 14", c: "var(--tone-2)" },
  3: { d: "M 10 50 Q 38 66 52 60 Q 70 48 90 26", c: "var(--tone-3)" },
  4: { d: "M 10 14 Q 48 36 90 62", c: "var(--tone-4)" },
  5: { d: "M 45 38 A 5 5 0 1 0 55 38 A 5 5 0 1 0 45 38", c: "var(--tone-5)" },
};
function tonePitchDiagram(n) {
  const num = Number(n);
  const spec = PITCH_SVG[num === 0 ? 5 : num];
  if (!spec) return null;
  return h("span.pitch-svg", {
    "aria-hidden": "true",
    html: `<svg width="100" height="72" viewBox="0 0 100 72"><line x1="8" y1="14" x2="92" y2="14" stroke="var(--line)" stroke-dasharray="3 3"/><line x1="8" y1="38" x2="92" y2="38" stroke="var(--line)" stroke-dasharray="3 3"/><line x1="8" y1="62" x2="92" y2="62" stroke="var(--line)" stroke-dasharray="3 3"/><path d="${spec.d}" fill="none" stroke="${spec.c}" stroke-width="3.6" stroke-linecap="round"/></svg>`,
  });
}

async function tones(body) {
  const data = await refOrEmpty(body, "tones");
  if (!data) return;
  const groups = Array.isArray(data) ? [["", data]] : Object.entries(data).filter(([, v]) => Array.isArray(v) && v.length && typeof v[0] === "object");
  groups.forEach(([key, items]) => {
    const title = { tones: t("tone.tones"), rules: t("tone.sandhi"), sandhi: t("tone.sandhi"), pairs: t("tone.pairs") }[key] || key;
    add(body, 
      h(
        "section.card",
        title ? h("h2", title) : null,
        items.map((it) => {
          const name = L(it, "name") || L(it, "title") || it.rule || it.id || "";
          const one = it.example && typeof it.example === "object" ? it.example : null;
          const zh = it.char || it.zh || one?.zh || it.example;
          const toneNum = it.t ?? it.n ?? it.tone;
          return h(
            "div.ref-block",
            h(
              "div.ref-head",
              it.mark || it.symbol ? h("span.tone-mark", { style: toneNum ? { background: `var(--tone-${toneNum === 0 ? 5 : toneNum})` } : null }, it.mark || it.symbol) : toneNum != null ? h("span.tone-mark", { style: { background: `var(--tone-${toneNum === 0 ? 5 : toneNum})` } }, String(toneNum)) : null,
              h("b", name),
              it.contour || it.pitch ? h("span.chip.soft", String(it.contour || it.pitch)) : null,
              (it.py || one?.py) && typeof (it.py || one?.py) === "string" ? h("span.py", it.py || one.py) : null,
              typeof zh === "string" ? zhBtn(zh) : null,
              key === "tones" && toneNum != null ? tonePitchDiagram(toneNum) : null,
            ),
            ["desc", "rule", "explain", ""].map((b) => glossPair(it, b)).find((x) => x.length) || null,
            one ? h("div.muted.small", glossPair(one)) : null,
            it.vn_compare && lang() !== "en" ? h("p.small", `🇻🇳 ${it.vn_compare}`) : null,
            L(it, "tip") ? h("p.muted.small", L(it, "tip")) : null,
            examples(it.examples || it.ex || []),
          );
        }),
        aiTag(Array.isArray(data) ? items[0] : data.rv ? data : items[0]),
      ),
    );
  });
  const notes = lang() === "en" && data.notes_en ? data.notes_en : data.notes_vi;
  if (notes) add(body, h("section.card", h("h2", t("py.notes")), h("ul.notes", [].concat(notes).map((n) => h("li", n)))));
}

// =============== BỘ THỦ ===============

async function radicals(body) {
  const data = await refOrEmpty(body, "radicals");
  if (!data) return;
  const items = listOf(data, "radicals", "items");
  const input = h("input.search", { type: "search", placeholder: t("rad.placeholder"), "aria-label": t("rad.placeholder") });
  const strokesList = [...new Set(items.map((r) => Number(r.strokes)).filter(Boolean))].sort((a, b) => a - b);
  let strokeFilter = 0;
  const strokeBar = h(
    "div.segmented.scroll",
    [0, ...strokesList].map((n) =>
      h(`button${n === 0 ? ".on" : ""}`, {
        type: "button",
        onclick: (e) => {
          strokeFilter = n;
          strokeBar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget));
          render();
        },
      }, n === 0 ? t("rad.allStrokes") : String(n)),
    ),
  );
  const grid = h("div.rad-grid");
  const open = (r) => {
    const box = h("div.strokes");
    const a = strokeAnimator(r.char, 130);
    add(box, a.el);
    a.play();
    sheet(
      h(
        "article.word-card",
        h("div.wc-top", h("span.chip", `${t("rad.no")} ${r.n ?? ""}`), r.strokes ? h("span.chip.soft", t("rad.strokes", { n: r.strokes })) : null),
        h("div.wc-py", r.py || ""),
        h("div.wc-hz", { lang: "zh-CN", onclick: () => A.speak(r.char) }, r.char),
        (r.variants || []).length ? h("div.muted.small", `${t("rad.variants")}: `, h("span", { lang: "zh-CN" }, [].concat(r.variants).join(" "))) : null,
        box,
        h("div.gloss.wc-gloss", glossPair(r), aiTag(r)),
        (r.examples || []).length ? h("div", h("div.eyebrow", t("w.examples")), h("div.chip-row", r.examples.map((e) => zhBtn(typeof e === "string" ? e : e.zh || e.h || "")))) : null,
      ),
    );
  };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    clear(grid);
    items
      .filter((r) => (!strokeFilter || Number(r.strokes) === strokeFilter) && (!q || [r.char, ...[].concat(r.variants || []), r.py, r.vi, r.en, String(r.n), String(r.strokes)].join(" ").toLowerCase().includes(q) || fold(`${r.py} ${r.vi}`).includes(fold(q))))
      .forEach((r) => add(grid, h("button.rad", { type: "button", onclick: () => open(r) }, h("b", { lang: "zh-CN" }, r.char), h("small.py", r.py || ""), h("small", lang() === "en" ? r.en || r.vi : r.vi || r.en))));
    if (!grid.children.length) add(grid, h("p.muted", t("dict.none")));
  };
  input.addEventListener("input", render);
  add(body, input, strokeBar, h("p.muted.small", t("rad.count", { n: items.length })), grid);
  render();
}

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

// =============== LƯỢNG TỪ ===============

async function classifiers(body) {
  const data = await refOrEmpty(body, "classifiers");
  if (!data) return;
  const items = listOf(data, "classifiers", "items");
  const input = h("input.search", { type: "search", placeholder: t("cl.placeholder"), "aria-label": t("cl.placeholder") });
  const list = h("div.ref-list");
  const render = () => {
    const q = fold(input.value.trim());
    clear(list);
    items
      .filter((c) => !q || fold([c.char, c.py, c.vi, c.en, c.usage_vi, c.usage_en, [].concat(c.nouns || []).map((n) => (typeof n === "string" ? n : n.zh || n.h)).join(" ")].join(" ")).includes(q))
      .forEach((c) =>
        add(list, 
          h(
            "div.card.cl-card",
            h("div.ref-head", zhBtn(c.char, ".big"), h("span.py", c.py || ""), h("div.gloss", glossPair(c))),
            L(c, "usage") ? h("p.small", L(c, "usage")) : null,
            (c.nouns || []).length
              ? h(
                  "div.chip-row",
                  c.nouns.map((n) => {
                    const zh = typeof n === "string" ? n : n.zh || n.h || "";
                    const phrase = /[一两二三这那几每]/.test(zh[0] || "") ? zh : `一${c.char}${zh}`;
                    return h("button.zh-chip", { type: "button", lang: "zh-CN", title: phrase, onclick: () => A.speak(phrase) }, zh);
                  }),
                )
              : null,
            examples(c.examples || (c.example ? [].concat(c.example) : [])),
            aiTag(c),
          ),
        ),
      );
    if (!list.children.length) add(list, h("p.muted", t("dict.none")));
  };
  input.addEventListener("input", render);
  add(body, input, h("p.muted.small", t("cl.hint")), list);
  render();
}
