// js/audio.js — Модуль озвучки (ElevenLabs -> Piper -> Google -> Web Speech) + Cache API + iOS Safari unlock

const AUDIO_CACHE_NAME = "slovak-tts-v2";
const ELEVEN_TIMEOUT_MS = 4500;
const PIPER_TIMEOUT_MS = 1200;
const GOOGLE_MAX_CHARS = 180;

let audioCtx = null;
let audioUnlocked = false;
let currentSource = null;
let currentHtmlAudio = null;
let currentObjectUrl = null;
let currentAbortController = null;
let speechSeq = 0;

let cachedVoices = [];

function refreshVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const list = window.speechSynthesis.getVoices();
  if (list && list.length) cachedVoices = list;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (!audioCtx) return;

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  // Одноразовый «тихий импульс» гарантированно разблокирует аудиосессию в iOS Safari
  if (!audioUnlocked) {
    try {
      const silentBuffer = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = silentBuffer;
      src.connect(audioCtx.destination);
      src.start(0);
      audioUnlocked = true;
    } catch {
      // Повторим при следующем касании
    }
  }
}

// Глобальная разблокировка при первом касании экрана или нажатии клавиши (iOS Safari / PWA)
if (typeof window !== "undefined") {
  const onFirstGesture = () => unlockAudio();
  window.addEventListener("pointerdown", onFirstGesture, { once: true, passive: true });
  window.addEventListener("touchstart", onFirstGesture, { once: true, passive: true });
  window.addEventListener("keydown", onFirstGesture, { once: true, passive: true });
}

function revokeCurrentObjectUrl() {
  if (currentObjectUrl) {
    try {
      URL.revokeObjectURL(currentObjectUrl);
    } catch {}
    currentObjectUrl = null;
  }
}

export function stopAllSpeech() {
  speechSeq += 1;

  if (currentAbortController) {
    try {
      currentAbortController.abort();
    } catch {}
    currentAbortController = null;
  }

  if (currentSource) {
    try {
      currentSource.onended = null;
      currentSource.stop();
    } catch {}
    currentSource = null;
  }

  if (currentHtmlAudio) {
    try {
      currentHtmlAudio.onended = null;
      currentHtmlAudio.onerror = null;
      currentHtmlAudio.pause();
      currentHtmlAudio.currentTime = 0;
    } catch {}
    currentHtmlAudio = null;
  }

  revokeCurrentObjectUrl();

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function pickBestSystemVoice(lang) {
  refreshVoices();
  const voices = cachedVoices.length
    ? cachedVoices
    : (window.speechSynthesis?.getVoices?.() || []);
  if (!voices.length) return null;

  const exactLocale = lang === "en" ? "en-us" : "sk-sk";
  const prefix = lang === "en" ? "en" : "sk";

  const scoreVoice = (v) => {
    const vLang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = (v.name || "").toLowerCase();
    let score = 0;
    if (vLang === exactLocale) score += 100;
    else if (vLang.startsWith(prefix + "-") || vLang === prefix) score += 50;
    else return -1;

    if (v.localService) score += 20;
    if (name.includes("premium") || name.includes("enhanced") || name.includes("siri")) score += 15;
    return score;
  };

  let best = null;
  let bestScore = -1;
  for (const v of voices) {
    const s = scoreVoice(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

function speakSystem(text, lang = "sk", rate = 0.92) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "en" ? "en-US" : "sk-SK";
  u.rate = rate;

  const matched = pickBestSystemVoice(lang);
  if (matched) u.voice = matched;

  window.speechSynthesis.speak(u);
}

function speakGoogle(text, lang = "sk", rate = 0.92, reqId) {
  return new Promise((resolve, reject) => {
    if (text.length > GOOGLE_MAX_CHARS) {
      reject(new Error("Текст слишком длинный для Google TTS"));
      return;
    }

    try {
      const tl = lang === "en" ? "en" : "sk";
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${tl}&client=tw-ob`;
      const a = new Audio(url);
      a.playbackRate = rate;
      if ("preservesPitch" in a) a.preservesPitch = true;
      if ("webkitPreservesPitch" in a) a.webkitPreservesPitch = true;

      currentHtmlAudio = a;
      a.onended = () => {
        if (currentHtmlAudio === a) currentHtmlAudio = null;
        resolve();
      };
      a.onerror = (e) => {
        if (currentHtmlAudio === a) currentHtmlAudio = null;
        reject(e);
      };

      const playPromise = a.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (currentHtmlAudio === a) currentHtmlAudio = null;
          if (reqId !== speechSeq) {
            resolve();
            return;
          }
          reject(err);
        });
      }
    } catch (err) {
      if (currentHtmlAudio) currentHtmlAudio = null;
      reject(err);
    }
  });
}

function playViaHtmlAudio(arrayBuffer, mimeType, rate, reqId) {
  return new Promise((resolve, reject) => {
    if (reqId !== speechSeq) {
      resolve();
      return;
    }
    const blob = new Blob([arrayBuffer], { type: mimeType || "audio/mpeg" });
    const objUrl = URL.createObjectURL(blob);
    revokeCurrentObjectUrl();
    currentObjectUrl = objUrl;

    const a = new Audio(objUrl);
    a.playbackRate = rate;
    if ("preservesPitch" in a) a.preservesPitch = true;
    if ("webkitPreservesPitch" in a) a.webkitPreservesPitch = true;
    currentHtmlAudio = a;

    const cleanup = () => {
      if (currentHtmlAudio === a) currentHtmlAudio = null;
      if (currentObjectUrl === objUrl) revokeCurrentObjectUrl();
    };

    a.onended = () => {
      cleanup();
      resolve();
    };
    a.onerror = (e) => {
      cleanup();
      reject(e);
    };

    const p = a.play();
    if (p !== undefined) {
      p.catch((err) => {
        cleanup();
        reject(err);
      });
    }
  });
}

async function playViaWebAudio(arrayBuffer, rate, reqId) {
  unlockAudio();
  if (!audioCtx) throw new Error("AudioContext недоступен");
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  if (reqId !== speechSeq) return;

  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  if (reqId !== speechSeq) return;

  const source = audioCtx.createBufferSource();
  source.buffer = decoded;
  source.playbackRate.value = rate;
  source.connect(audioCtx.destination);
  source.start(0);
  currentSource = source;
  source.onended = () => {
    if (currentSource === source) currentSource = null;
  };
}

async function playAudioBuffer(arrayBuffer, mimeType, rate, reqId) {
  if (reqId !== speechSeq) return;

  // Сначала пробуем HTMLAudioElement (сохраняет естественный тембр при замедлении)
  try {
    await playViaHtmlAudio(arrayBuffer, mimeType, rate, reqId);
    return;
  } catch {
    if (reqId !== speechSeq) return;
  }

  // Резерв для iOS Safari после асинхронной цепочки: разблокированный AudioContext
  await playViaWebAudio(arrayBuffer, rate, reqId);
}

function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  });
}

function normalizeCacheText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isValidAudioResponse(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return !ct || ct.startsWith("audio/") || ct.includes("octet-stream");
}

async function fetchAndCacheAudio(cacheKeyStr, fetcher) {
  const cache = "caches" in window ? await caches.open(AUDIO_CACHE_NAME) : null;
  const cacheReq = new Request(`https://tts.slovak-studio.local/${encodeURIComponent(cacheKeyStr)}`);

  if (cache) {
    const cached = await cache.match(cacheReq);
    if (cached) {
      const buf = await cached.arrayBuffer();
      if (buf.byteLength > 256) {
        return {
          buffer: buf,
          mimeType: cached.headers.get("content-type") || "audio/mpeg",
          fromCache: true,
          invalidate: () => cache.delete(cacheReq).catch(() => {})
        };
      }
      // Удаляем повреждённую пустую запись из кэша
      cache.delete(cacheReq).catch(() => {});
    }
  }

  const res = await fetcher();
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
  if (!isValidAudioResponse(res)) {
    throw new Error(`Неверный Content-Type ответа TTS: ${res.headers.get("content-type")}`);
  }

  const mimeType = res.headers.get("content-type") || "audio/mpeg";
  const buf = await res.arrayBuffer();
  if (buf.byteLength <= 256) {
    throw new Error("Пустой аудиофайл от TTS");
  }

  if (cache) {
    const cacheResp = new Response(buf.slice(0), {
      headers: { "Content-Type": mimeType }
    });
    cache.put(cacheReq, cacheResp).catch(() => {});
  }

  return {
    buffer: buf,
    mimeType,
    fromCache: false,
    invalidate: () => (cache ? cache.delete(cacheReq).catch(() => {}) : Promise.resolve())
  };
}

function canReachPiper(piperUrl) {
  if (!piperUrl) return false;
  try {
    const parsed = new URL(piperUrl);
    if (typeof location !== "undefined" && location.protocol === "https:") {
      const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol === "http:" && !isLocal) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function tryElevenLabs(clean, lang, settings, signal) {
  const elevenKey = (settings.elevenKey || "").trim();
  const voiceId = (settings.elevenVoiceId || "pNInz6obpgDQGcFmaJgB").trim();
  if (!elevenKey || !voiceId) throw new Error("Не задан ключ или voiceId ElevenLabs");

  const normKey = normalizeCacheText(clean);
  return fetchAndCacheAudio(`el:${lang}:${voiceId}:${normKey}`, () =>
    fetchWithTimeout(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text: clean,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.8 }
        })
      },
      ELEVEN_TIMEOUT_MS,
      signal
    )
  );
}

async function tryPiper(clean, lang, settings, signal) {
  const piperUrl = (settings.piperUrl || "").trim();
  if (!canReachPiper(piperUrl)) throw new Error("Piper TTS недоступен");

  const normKey = normalizeCacheText(clean);
  return fetchAndCacheAudio(`piper:${lang}:${normKey}`, () =>
    fetchWithTimeout(
      piperUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, lang })
      },
      PIPER_TIMEOUT_MS,
      signal
    )
  );
}

function getEngineChain(engine) {
  switch (engine) {
    case "piper":
      return ["piper", "google", "system"];
    case "google":
      return ["google", "system"];
    case "system":
      return ["system"];
    case "elevenlabs":
    default:
      // Основная цепочка: ElevenLabs -> локальный Piper -> Google (короткие) -> Web Speech API
      return ["elevenlabs", "piper", "google", "system"];
  }
}

export async function speakText(rawText, settings = {}, lang = "sk") {
  unlockAudio();
  stopAllSpeech();

  const clean = (rawText || "").replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim();
  if (!clean) return;

  const reqId = speechSeq;
  const abortController = new AbortController();
  currentAbortController = abortController;

  const rate = Number(settings.voiceSpeed || 0.92);
  const engine = settings.voiceEngine || "elevenlabs";
  const chain = getEngineChain(engine);

  for (const step of chain) {
    if (reqId !== speechSeq) return;

    if (step === "elevenlabs" || step === "piper") {
      try {
        const audio = step === "elevenlabs"
          ? await tryElevenLabs(clean, lang, settings, abortController.signal)
          : await tryPiper(clean, lang, settings, abortController.signal);

        if (reqId !== speechSeq) return;

        try {
          await playAudioBuffer(audio.buffer, audio.mimeType, rate, reqId);
          return;
        } catch (playErr) {
          // Если запись из кэша не смогла декодироваться — удаляем её
          if (audio.fromCache) await audio.invalidate();
          throw playErr;
        }
      } catch (err) {
        if (reqId !== speechSeq) return;
        console.warn(`[TTS:${step}] fallback -> next:`, err?.message || err);
      }
      continue;
    }

    if (step === "google") {
      try {
        await speakGoogle(clean, lang, rate, reqId);
        return;
      } catch (err) {
        if (reqId !== speechSeq) return;
        console.warn("[TTS:google] fallback -> system:", err?.message || err);
      }
      continue;
    }

    if (step === "system") {
      speakSystem(clean, lang, rate);
      return;
    }
  }
}

let activeRecognition = null;

export function isVoiceInputActive() {
  return activeRecognition !== null;
}

export function toggleVoiceInput({ lang = "sk", onStart, onResult, onEnd, onError }) {
  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch {}
    activeRecognition = null;
    onEnd?.();
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onError?.("Голосовой ввод не поддерживается этим браузером. Нажмите на значок микрофона на клавиатуре iPhone/Mac для нативной диктовки.");
    return;
  }

  try {
    const rec = new SR();
    rec.lang = lang === "en" ? "en-US" : "sk-SK";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => {
      activeRecognition = rec;
      onStart?.();
    };

    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || "";
      if (transcript) onResult?.(transcript);
    };

    rec.onerror = (e) => {
      // Игнорируем штатные прерывания и тишину без показа предупреждений
      if (e.error === "aborted" || e.error === "no-speech") {
        return;
      }
      if (e.error === "not-allowed") {
        onError?.("Доступ к микрофону заблокирован. Разрешите микрофон в настройках браузера или используйте диктовку с клавиатуры.");
        return;
      }
      onError?.(`Микрофон: ${e.error}`);
    };

    rec.onend = () => {
      activeRecognition = null;
      onEnd?.();
    };

    rec.start();
  } catch (err) {
    activeRecognition = null;
    onEnd?.();
    if (err.name !== "InvalidStateError") {
      onError?.(err.message);
    }
  }
}

export function startVoiceInput(opts) {
  return toggleVoiceInput(opts);
}
