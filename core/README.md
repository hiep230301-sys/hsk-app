# core/ — lõi app HSK 1–9

JS thuần (ES module), **không đụng DOM**, không cần build. Giao diện (`ui/`) chỉ gọi các hàm dưới đây rồi tự vẽ.
Hợp đồng gốc: `docs/PLAN.md` mục 4 (dữ liệu) và mục 5 (API). Test: `node --test tests/` (60 test, fixture 35 từ ở `tests/fixtures/`).

Cấp (`lv`) luôn là 1..7; 7 = băng HSK 7–9 (truyền 8, 9 được quy về 7).

## Bảng hàm

### content.js — dữ liệu
| Hàm | Trả về | Ghi chú |
|---|---|---|
| `loadIndex()` | `Promise<Index>` | đọc `data/vocab/index.json`, có nhớ đệm |
| `loadLevel(lv)` | `Promise<Word[]>` | gộp mọi file của cấp, sắp theo `id` |
| `loadAll()` | `Promise<Word[]>` | nạp cả 7 cấp (10.969 từ, khoảng 0,2 s) |
| `getWord(id)` | `Word \| null` | chỉ thấy từ của cấp đã nạp |
| `search(q, { levels?, limit? })` | `Word[]` | khớp chữ Hán (giản / phồn), pinyin không dấu (`nihao`, `ni3hao3`), nghĩa Việt (có / không dấu), nghĩa Anh; xếp theo độ khớp. `q` rỗng → cả danh sách. Không truyền `limit` → không giới hạn |
| `segment(sentence)` | `string[]` | khớp dài nhất; dấu câu là mảnh riêng, bỏ khoảng trắng |
| `charPinyin(ch)` | `string[]` | cách đọc có dấu của một chữ, cách đọc chính đứng đầu |
| `loadRef(name)` | `Promise<any>` | `data/ref/<name>.json`: `pinyin`, `tones`, `radicals`, `grammar-l1`…, `classifiers` |
| `setFetcher(fn)` | — | thay `fetch` (Node / test). `fn(url)` trả JSON đã parse hoặc đối tượng kiểu `Response` |
| Thêm | | `setBase(url)`, `resetContent()`, `getIndex()`, `levelWords(lv)`, `levelCount(lv)`, `loadedLevels()`, `allWords()`, `findByHanzi(h)`, `isHan(ch)`, `isPunct(s)`, `normLevel(lv)` |

`search`, `segment`, `charPinyin`, `getWord` là hàm đồng bộ, chỉ làm việc trên các cấp **đã nạp**.

### srs.js — lịch ôn (hàm thuần)
| Hàm | Ghi chú |
|---|---|
| `schedule(card \| undefined, grade, now)` → `Card` | grade 0 quên · 1 khó · 2 nhớ · 3 dễ. Trả thẻ mới, không sửa thẻ cũ |
| `strength(card)` → `"new" \| "learning" \| "known" \| "mastered"` | theo `iv`: < 4 ngày · < 21 ngày · còn lại |
| Thêm | `newCard(now)`, `isDue(card, now)`, `STRENGTH_LABEL.vi / .en`, `DAY` |

`Card = { r, iv, ef, due, l, last, seen, right, wrong }` (`iv` tính bằng ngày, `due` / `last` là ms).

### store.js — trạng thái người học (localStorage, khóa `hsk-v2-state`)
| Hàm | Ghi chú |
|---|---|
| `getState()` | object trạng thái: `settings, xp, streak, bestStreak, lastActive, freezes, history, cards, units, badges, stats` |
| `set(patch)` | gộp nông; riêng `settings` gộp từng khóa và kiểm giá trị |
| `subscribe(fn)` → hàm hủy | gọi `fn(state)` sau mỗi lần lưu |
| `addXp(n, words)` → `{ streakUp, goalReached, streak, todayXp }` | |
| `checkStreak()` → chuỗi hiện tại | gọi khi mở app |
| `review(id, grade)` → `Card` | chấm thẻ bằng `srs.schedule` rồi lưu |
| `dueIds()` → `string[]` | thẻ đến hạn, hạn cũ nhất trước |
| `finishUnit(lv, u, acc)` → số sao 1..3 | `acc` 0..1 |
| `nextUnit(lv, total)` → chỉ số bài (từ 0) | |
| `checkBadges()` → huy hiệu vừa mở `[{ id, icon, name, nameEn, desc, descEn }]` | |
| `exportJson()`, `importJson(s)`, `resetAll()` | `importJson` ném lỗi nếu sai định dạng |
| Thêm | `setSettings(patch)`, `getSettings()`, `todayXp()`, `dayKey()`, `card(id)`, `strengthOf(id)`, `introduce(id, mistakes)`, `learnedIds()`, `unitResult(lv, u)`, `bumpStat(name)`, `recordTest(percent)`, `BADGES`, `SETTING_DEFAULTS`, `setStorage(s)`, `migrate(raw)` |

`state.settings = { uiLang:"vi"|"en", gloss:"vi"|"en"|"both", pinyin:"always"|"hint"|"off", speed:"slow"|"normal"|"fast", voice, sound, theme:"auto"|"light"|"dark", dailyGoal, level }`.
Dữ liệu bản v0 (khóa cũ `level, dailyGoal, speed, voice, showPinyin, sound`) tự chuyển vào `settings`; thẻ / bài mã cũ `hsk1-0001` cất ở `state.legacyV1`, không xóa.

### lesson.js — chia bài, sinh câu hỏi, chấm
| Hàm | Ghi chú |
|---|---|
| `UNIT_SIZE` = 8, `unitsOf(lv)`, `unitWords(lv, u)` | `u` từ 0 |
| `lessonPlan(words, pool, opts?)` | bài học mới: làm quen → ghép cặp → củng cố → sắp xếp, nói, viết |
| `reviewPlan(words, pool, strengthOf, opts?)` | `strengthOf(id)`; nhớ càng chắc dạng càng khó |
| `drillPlan(type, words, pool)` | một dạng bài |
| `placementPlan()` | 15 câu trắc nghiệm trải cấp 1→7, mỗi câu có `meta.lv`. Phải `loadAll()` trước |
| `placementResult(answers)` → cấp 1..7 | `answers`: `[{ lv, correct }]` hoặc `[{ question, correct }]` / `[{ q, correct }]` |
| `testPlan(lv, n = 20, opts?)` | đề thi thử, chỉ dạng tự chấm được |
| `check(question, response)` → `{ correct, note?, noteEn?, … }` | xem bảng dưới |
| Thêm | `makeQuestion(type, word, { pool?, group? })`, `canDo(type, word)`, `retryQuestion(q, word, pool)`, `distractors(...)`, `sentenceTiles(zh)`, `placementDetail(answers)`, `TYPES`, `TYPE_LABEL[type].vi / .en` |

`opts` tắt dạng bài theo thiết bị, vd `{ speak: false, listen: false, write: false }`.
`pool` = danh sách từ để lấy phương án nhiễu (thường là cả cấp); nhiễu ưu tiên cùng cấp, cùng từ loại, cùng độ dài.

**Hình dạng Question theo type** (object thuần, `JSON.stringify` được):

| type | prompt | options | answer | response đưa vào `check` |
|---|---|---|---|---|
| `meaning` | `zh, py, audio` | `{ key, label, vi, en }` | key đúng | key (hoặc `{ key }`, hoặc chỉ số) |
| `hanzi` | `vi, en` | `{ key, label, zh, py }` | key đúng | như trên |
| `listen` | `audio` | `{ key, label, zh, py }` | key đúng | như trên |
| `tone` | `zh, vi, en, audio` | `{ key, label }` (pinyin) | key đúng | như trên |
| `fill` | `sentence, blanks:[{ start, length }], vi, en` | `{ key, label, zh, py }` | key đúng | như trên. `meta.parts` = câu cắt quanh chỗ trống, `meta.py` |
| `typing` | `zh, vi, en, audio` | — | pinyin có dấu | chuỗi gõ: không dấu / có dấu / số thanh. Sai thanh vẫn đúng, kèm `note` + `toneError` |
| `match` | `{}` | cột trái `{ key, label, zh, py }` | `{ keyTrái: keyPhải }` | số lần ghép sai (hoặc `{ mistakes }`, hoặc `[[keyTrái, keyPhải]]`). Cột phải ở `meta.right`; đúng khi sai ≤ `meta.maxMistakes` (1) |
| `order` | `vi, en` | mảnh `{ key, label, zh }` đã xáo | chuỗi ghép đúng | mảng key (hoặc mảng nhãn, hoặc chuỗi). `meta.zh, meta.py, meta.tiles` |
| `speak` | `zh, py, vi, en, audio` | — | chữ Hán | `{ alternatives }` (core tự chấm) · `{ score }` · `{ skipped: true }`. Đạt từ `meta.passScore` (70) |
| `write` | `py, vi, en, audio` | — | mảng chữ cần viết (≤ 3) | số nét sai (hoặc `{ mistakes }`) · `{ skipped: true }`. Đạt khi ≤ `meta.maxMistakes` |

`prompt.audio` là **chữ cần đọc** (đưa cho `speak`); file mp3 nếu có nằm ở `meta.audioUrl`. Mọi câu có `qid`, `wordIds`, `meta.lv`.
`label` của phương án nghĩa = nghĩa Việt, từ chưa có tiếng Việt thì dùng nghĩa Anh rút gọn; UI muốn song ngữ thì đọc `vi` / `en`.

### scoring.js
`scorePronunciation(target, alternatives, charPinyin)` → `{ score 0..100, chars:[{ ch, status:"ok"|"tone"|"bad" }], heard }`. Chữ đồng âm cùng thanh tính đúng; đúng âm sai thanh được nửa điểm.

### speech.js (dùng `window`, không dùng DOM; import trong Node không lỗi)
| Hàm | Ghi chú |
|---|---|
| `speak(text, { rate?, lang?, audioUrl?, voice? })` → `Promise` | có `audioUrl` thì phát mp3, lỗi thì dùng giọng máy. `rate` mặc định theo `settings.speed` |
| `stopSpeaking()` | |
| `chineseVoices()` → `SpeechSynthesisVoice[]` | |
| `canRecognize()`, `canSpeak()` | |
| `listen({ timeoutMs?, lang?, record? })` → `Promise<{ alternatives, audioUrl? }>` | lỗi: `Error` có `.code` (`unsupported`, `not-allowed`, `no-speech`, `network`) và `.messageEn` |

### pinyin.js
`stripTones`, `normalizeTyped`, `toneSequence`, `toneOfSyllable`, `hasToneMarks`, `splitSyllables`, `toneVariants`, `fixUmlaut`, `foldVi`, `isHan`, `shuffle`, `TONE_NAMES`, `TONE_NAMES_EN`.

## Ví dụ dùng

```js
import * as content from "./core/content.js";
import * as store from "./core/store.js";
import * as lesson from "./core/lesson.js";
import { speak, listen } from "./core/speech.js";

// 1. Một bài học
const lv = store.getState().settings.level;
const pool = await content.loadLevel(lv);
const u = store.nextUnit(lv, lesson.unitsOf(lv));
const words = lesson.unitWords(lv, u);
const plan = lesson.lessonPlan(words, pool, { speak: false });

let right = 0;
for (const q of plan) {
  if (q.prompt.audio) speak(q.prompt.audio, { audioUrl: q.meta.audioUrl || undefined });
  const response = await hoiNguoiHoc(q);          // UI tự vẽ theo q.type, trả key / chuỗi / số lần sai
  const { correct, note } = lesson.check(q, response);
  if (correct) right += 1;
}
store.finishUnit(lv, u, right / plan.length);       // → số sao
words.forEach((w) => store.introduce(w.id, 0));     // đưa từ vào lịch ôn
store.addXp(20, words.length);
store.checkBadges();

// 2. Ôn tập
const due = store.dueIds().map(content.getWord).filter(Boolean);
const review = lesson.reviewPlan(due, pool, store.strengthOf);
// sau mỗi câu: store.review(id, correct ? 2 : 0)

// 3. Xếp lớp
await content.loadAll();
const qs = lesson.placementPlan();
const answers = qs.map((q) => ({ question: q, correct: lesson.check(q, traLoi(q)).correct }));
store.set({ settings: { level: lesson.placementResult(answers) } });

// 4. Tra cứu
content.search("thoi gian", { limit: 20 });         // → [时间, …]
content.segment("我没有时间。");                     // → ["我","没有","时间","。"]
const tones = await content.loadRef("tones");

// 5. Luyện nói
const { alternatives } = await listen();
const r = lesson.check(speakQuestion, { alternatives }); // r.score, r.detail.chars

// 6. Trong Node / test
import { readFile } from "node:fs/promises";
content.setFetcher(async (url) => JSON.parse(await readFile(url, "utf8")));
store.setStorage({ getItem: () => null, setItem() {} });
```
