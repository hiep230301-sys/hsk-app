// Đọc (mp3 nếu có audioUrl, không thì Web Speech) và nhận dạng giọng nói.
// Được dùng window.speechSynthesis / SpeechRecognition / Audio; KHÔNG đụng DOM. Import được trong Node (mọi hàm thành no-op).
import { getState } from "./store.js";

export const SPEEDS = { slow: 0.6, normal: 0.85, fast: 1.1 };

const win = typeof window !== "undefined" ? window : null;
const synth = () => (win && "speechSynthesis" in win ? win.speechSynthesis : null);
let voicesCache = [];
let currentAudio = null;

function refreshVoices() {
  voicesCache = synth()?.getVoices() || [];
  return voicesCache;
}
if (synth()) {
  refreshVoices();
  synth().addEventListener?.("voiceschanged", refreshVoices);
}

export function canSpeak() {
  return Boolean(synth());
}

/** Các giọng tiếng Trung thiết bị có (SpeechSynthesisVoice[]). */
export function chineseVoices() {
  return (voicesCache.length ? voicesCache : refreshVoices()).filter((v) => /^(zh|cmn)/i.test(v.lang));
}

function pickVoice(wanted) {
  const list = chineseVoices();
  return (
    list.find((v) => v.voiceURI === wanted) ||
    list.find((v) => /zh[-_]CN/i.test(v.lang) && /natural|online|xiaoxiao|yunxi|google/i.test(v.name)) ||
    list.find((v) => /zh[-_]CN/i.test(v.lang)) ||
    list[0] ||
    null
  );
}

function settingRate() {
  return SPEEDS[getState().settings?.speed] ?? SPEEDS.normal;
}

function playAudio(url, rate) {
  return new Promise((resolve, reject) => {
    if (typeof Audio === "undefined") return reject(new Error("no-audio"));
    const audio = new Audio(url);
    currentAudio = audio;
    audio.playbackRate = Math.max(0.5, Math.min(1.5, rate / SPEEDS.normal));
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("audio-error"));
    const p = audio.play();
    if (p?.catch) p.catch(reject);
  });
}

function speakTts(text, rate, lang, voice) {
  return new Promise((resolve) => {
    const s = synth();
    if (!s || typeof SpeechSynthesisUtterance === "undefined") return resolve();
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    if (lang.startsWith("zh")) {
      const v = pickVoice(voice ?? getState().settings?.voice);
      if (v) u.voice = v;
    }
    u.rate = rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    s.speak(u);
    setTimeout(resolve, 600 + (text.length * 450) / Math.max(0.5, rate)); // một số trình duyệt không gọi onend
  });
}

/**
 * Đọc văn bản. Có audioUrl thì phát mp3, lỗi thì quay về giọng máy. Promise kết thúc khi đọc xong (không bao giờ reject).
 * opts: { rate?: số (mặc định theo settings.speed), lang?: "zh-CN", audioUrl?: string, voice?: voiceURI }
 */
export async function speak(text, { rate, lang = "zh-CN", audioUrl, voice } = {}) {
  if (!text && !audioUrl) return;
  const r = Number(rate) > 0 ? Number(rate) : settingRate();
  stopSpeaking();
  if (audioUrl) {
    try {
      await playAudio(audioUrl, r);
      return;
    } catch {
      /* không phát được mp3 -> dùng giọng máy */
    }
  }
  if (text) await speakTts(String(text), r, lang, voice);
}

export function stopSpeaking() {
  synth()?.cancel();
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      /* bỏ qua */
    }
    currentAudio = null;
  }
}

// ---------------- Nhận dạng giọng nói ----------------

const Recognition = win ? win.SpeechRecognition || win.webkitSpeechRecognition : null;

export function canRecognize() {
  return Boolean(Recognition);
}

const LISTEN_ERRORS = {
  unsupported: ["Trình duyệt này chưa hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome hoặc Edge.", "Speech recognition is not supported here. Use Chrome or Edge."],
  "not-allowed": ["Chưa được cấp quyền micro. Hãy cho phép micro rồi thử lại.", "Microphone permission denied. Allow the microphone and retry."],
  "no-speech": ["Không nghe thấy tiếng. Hãy nói to, rõ hơn.", "No speech heard. Speak louder and more clearly."],
  network: ["Nhận dạng giọng nói cần mạng Internet.", "Speech recognition needs an Internet connection."],
};
function listenError(code) {
  const key = code === "service-not-allowed" ? "not-allowed" : code;
  const [vi, en] = LISTEN_ERRORS[key] || [`Lỗi nhận dạng: ${code}`, `Recognition error: ${code}`];
  return Object.assign(new Error(vi), { code: key, messageEn: en });
}

/**
 * Nghe người học nói. Trả về Promise<{ alternatives: string[], audioUrl?: string }>
 * (audioUrl = bản ghi âm giọng người học nếu ghi được). Lỗi: Error có .code và .messageEn.
 * opts: { timeoutMs = 7000, lang = "zh-CN", record = true }
 */
export function listen({ timeoutMs = 7000, lang = "zh-CN", record = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!Recognition) return reject(listenError("unsupported"));
    stopSpeaking();
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    let recorder = null;
    let stream = null;
    const chunks = [];
    let done = false;
    let timer = null;

    const finish = (result, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const stopTracks = () => stream?.getTracks().forEach((t) => t.stop());
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          stopTracks();
          const url = chunks.length ? URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })) : undefined;
          error ? reject(Object.assign(error, { audioUrl: url })) : resolve({ ...result, audioUrl: url });
        };
        recorder.stop();
      } else {
        stopTracks();
        error ? reject(error) : resolve(result);
      }
    };

    rec.onresult = (ev) => {
      const alts = [];
      for (const res of ev.results) for (let k = 0; k < res.length; k += 1) alts.push(res[k].transcript.trim());
      finish({ alternatives: alts.filter(Boolean) });
    };
    rec.onerror = (ev) => finish(null, listenError(ev.error));
    rec.onend = () => finish({ alternatives: [] });
    timer = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* bỏ qua */
      }
    }, timeoutMs);

    const start = () => {
      try {
        rec.start();
      } catch (e) {
        finish(null, e);
      }
    };
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    if (record && media?.getUserMedia && win.MediaRecorder) {
      media
        .getUserMedia({ audio: true })
        .then((s) => {
          stream = s;
          recorder = new win.MediaRecorder(s);
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          recorder.start();
          start();
        })
        .catch(start);
    } else start();
  });
}
