// js/audio.js — AudioContext unlock для iOS Safari + Cache API + ElevenLabs / Google / Piper / System TTS (SK & EN)

const AUDIO_CACHE_NAME = "slovak-tts-v2";
let audioCtx = null;
let currentSource = null;
let currentHtmlAudio = null;

export function unlockAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

export function stopAllSpeech() {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {}
    currentSource = null;
  }
  if (currentHtmlAudio) {
    try {
      currentHtmlAudio.pause();
      currentHtmlAudio.currentTime = 0;
    } catch {}
    currentHtmlAudio = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakSystem(text, lang = "sk", rate = 0.92) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const targetLang = lang === "en" ? "en-US" : "sk-SK";
  u.lang = targetLang;
  u.rate = rate;
  const voices = window.speechSynthesis.getVoices();
  const matched = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  if (matched) u.voice = matched;
  window.speechSynthesis.speak(u);
}

function speakGoogle(text, lang = "sk", rate = 0.92) {
  return new Promise((resolve, reject) => {
    try {
      const tl = lang === "en" ? "en" : "sk";
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${tl}&client=tw-ob`;
      const a = new Audio(url);
      a.playbackRate = rate;
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
        playPromise.then(resolve).catch((err) => {
          if (currentHtmlAudio === a) currentHtmlAudio = null;
          reject(err);
        });
      }
    } catch (err) {
      if (currentHtmlAudio) currentHtmlAudio = null;
      reject(err);
    }
  });
}

async function playAudioBuffer(arrayBuffer, rate) {
  unlockAudio();
  if (!audioCtx) throw new Error("AudioContext недоступен");
  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
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

async function fetchAndCacheAudio(cacheKeyStr, fetcher) {
  const cache = "caches" in window ? await caches.open(AUDIO_CACHE_NAME) : null;
  const cacheReq = new Request(`https://tts.slovak-studio.local/${encodeURIComponent(cacheKeyStr)}`);

  if (cache) {
    const cached = await cache.match(cacheReq);
    if (cached) return cached.arrayBuffer();
  }

  const res = await fetcher();
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
  const clone = res.clone();
  if (cache) cache.put(cacheReq, clone).catch(() => {});
  return res.arrayBuffer();
}

export async function speakText(rawText, settings, lang = "sk") {
  unlockAudio();
  stopAllSpeech();
  const clean = (rawText || "").replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim();
  if (!clean) return;

  const rate = Number(settings.voiceSpeed || 0.92);
  const engine = settings.voiceEngine || "elevenlabs";

  // 1. Piper TTS (локальный Mac)
  if (engine === "piper" && settings.piperUrl) {
    try {
      const buf = await fetchAndCacheAudio(`piper:${lang}:${clean}`, () =>
        fetch(settings.piperUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean, lang })
        })
      );
      await playAudioBuffer(buf, rate);
      return;
    } catch (err) {
      console.warn("Piper TTS error, fallback to Google:", err);
    }
  }

  // 2. ElevenLabs (живой студийный голос Adam)
  if (engine === "elevenlabs") {
    const elevenKey = settings.elevenKey;
    const voiceId = (settings.elevenVoiceId || "pNInz6obpgDQGcFmaJgB").trim();
    if (elevenKey && voiceId) {
      try {
        const buf = await fetchAndCacheAudio(`el:${lang}:${voiceId}:${clean}`, () =>
          fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: "POST",
            headers: {
              "xi-api-key": elevenKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              text: clean,
              model_id: "eleven_multilingual_v2",
              voice_settings: { stability: 0.5, similarity_boost: 0.8 }
            })
          })
        );
        await playAudioBuffer(buf, rate);
        return;
      } catch (err) {
        console.warn("ElevenLabs TTS fallback to Google TTS:", err);
      }
    }
  }

  // 3. Google Translate TTS (высокое качество, родной словацкий и английский без лимитов)
  if (engine === "google" || engine === "elevenlabs" || engine === "piper") {
    try {
      await speakGoogle(clean, lang, rate);
      return;
    } catch (err) {
      console.warn("Google TTS fallback failed, falling back to system:", err);
    }
  }

  // 4. Системная озвучка (последний резерв при полном офлайне)
  speakSystem(clean, lang, rate);
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
