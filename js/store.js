// js/store.js — IndexedDB + localStorage fallback, per-profile & per-language isolation, JSON backup

const DB_NAME = "slovak_studio_v3";
const DB_VERSION = 1;
const STORE_NAME = "kv";

// Встроенные ключи по умолчанию (защищены Base64 для работы "из коробки" без ручной настройки)
const DEFAULT_ELEVEN_KEY = atob("c2tfNjI4ZTg3YTczOGQ1YjM4MzRjOGIyMjM3Yjc2ZjBlNTljMzc5ZTQ1MmE5NDFlMTMy");
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam (ElevenLabs Multilingual v2)
const DEFAULT_AI_KEY = atob("c2stYXBpLTkyNThiYjcxYjE4M2EwMDVjMTczMGY5ZDUxZWI5ZGI4ZjM1YWI5OGE1ODYzYjA1N2VlZmNlY2QwNzVkNjlhMTY=");
const DEFAULT_AI_URL = "https://api.aidostup.site/v1";
const DEFAULT_AI_MODEL = "gemini-3.8-flash";

const DEFAULT_SETTINGS = {
  voiceEngine: "elevenlabs",
  voiceSpeed: 0.92,
  piperUrl: "http://localhost:5000/tts",
  elevenKey: DEFAULT_ELEVEN_KEY,
  elevenVoiceId: DEFAULT_VOICE_ID,
  aiBaseUrl: DEFAULT_AI_URL,
  aiModel: DEFAULT_AI_MODEL,
  aiKey: DEFAULT_AI_KEY,
  dailyNewLimit: 8
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function kvGet(key, fallback = null) {
  const db = await openDb();
  if (!db) {
    try {
      const raw = localStorage.getItem("ssv3_" + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result !== undefined ? req.result : fallback);
    req.onerror = () => resolve(fallback);
  });
}

async function kvSet(key, value) {
  const db = await openDb();
  if (!db) {
    localStorage.setItem("ssv3_" + key, JSON.stringify(value));
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getActiveProfile() {
  return (await kvGet("active_profile", "oleg")) || "oleg";
}

export async function setActiveProfile(profile) {
  await kvSet("active_profile", profile);
}

export async function getActiveLang() {
  return (await kvGet("active_lang", "sk")) || "sk";
}

export async function setActiveLang(lang) {
  await kvSet("active_lang", lang);
}

export async function getSavedTheme() {
  return (await kvGet("app_theme", "cupertino")) || "cupertino";
}

export async function saveTheme(theme) {
  await kvSet("app_theme", theme);
}

export async function getSettings() {
  const saved = await kvGet("settings", {});
  const s = { ...DEFAULT_SETTINGS, ...(saved || {}) };

  // Автоматическое исправление Mixed Content при работе по HTTPS (GitHub Pages)
  if (typeof location !== "undefined" && location.protocol === "https:") {
    if (!s.aiBaseUrl || s.aiBaseUrl.startsWith("http:")) {
      s.aiBaseUrl = DEFAULT_AI_URL;
    }
  }

  if (!s.elevenKey) s.elevenKey = DEFAULT_ELEVEN_KEY;
  if (!s.elevenVoiceId) s.elevenVoiceId = DEFAULT_VOICE_ID;
  if (!s.aiKey) s.aiKey = DEFAULT_AI_KEY;
  if (!s.aiBaseUrl) s.aiBaseUrl = DEFAULT_AI_URL;
  if (!s.aiModel || s.aiModel === "gemma3:12b") s.aiModel = DEFAULT_AI_MODEL;
  if (!s.voiceEngine || s.voiceEngine === "system") s.voiceEngine = "elevenlabs";
  return s;
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  await kvSet("settings", merged);
  return merged;
}

export async function getProfileSRS(profile, lang = "sk") {
  return (await kvGet(`srs_${profile}_${lang}`, {})) || {};
}

export async function saveProfileSRS(profile, lang, srsMap) {
  await kvSet(`srs_${profile}_${lang}`, srsMap);
}

export async function getCustomWords(profile, lang = "sk") {
  return (await kvGet(`custom_words_${profile}_${lang}`, [])) || [];
}

export async function addCustomWord(profile, lang, wordObj) {
  const list = await getCustomWords(profile, lang);
  if (!list.some((w) => w.word.toLowerCase() === wordObj.word.toLowerCase())) {
    list.push(wordObj);
    await kvSet(`custom_words_${profile}_${lang}`, list);
  }
  return list;
}

export async function getProfileStats(profile) {
  const today = new Date().toISOString().slice(0, 10);
  const stats = (await kvGet(`stats_${profile}`, null)) || {
    streak: 1,
    lastActiveDay: today,
    dailyCounts: {}
  };
  return {
    ...stats,
    todayCount: Number((stats.dailyCounts && stats.dailyCounts[today]) || 0)
  };
}

export async function bumpProfileActivity(profile) {
  const today = new Date().toISOString().slice(0, 10);
  const stats = await getProfileStats(profile);
  const dailyCounts = { ...(stats.dailyCounts || {}) };

  let streak = stats.streak || 1;
  if (stats.lastActiveDay && stats.lastActiveDay !== today) {
    const diff = Math.round((new Date(today) - new Date(stats.lastActiveDay)) / 86400000);
    streak = diff === 1 ? streak + 1 : 1;
  }

  dailyCounts[today] = (dailyCounts[today] || 0) + 1;
  const updated = { streak, lastActiveDay: today, dailyCounts };
  await kvSet(`stats_${profile}`, updated);
  return { ...updated, todayCount: dailyCounts[today] };
}

export async function exportAllData() {
  const [activeProfile, activeLang, settings, oSk, oEn, kSk, kEn, oStats, kStats] = await Promise.all([
    getActiveProfile(),
    getActiveLang(),
    getSettings(),
    getProfileSRS("oleg", "sk"),
    getProfileSRS("oleg", "en"),
    getProfileSRS("ksenia", "sk"),
    getProfileSRS("ksenia", "en"),
    getProfileStats("oleg"),
    getProfileStats("ksenia")
  ]);

  const safeSettings = { ...settings, elevenKey: "", aiKey: "" };
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    activeProfile,
    activeLang,
    settings: safeSettings,
    profiles: {
      oleg: { srs: { sk: oSk, en: oEn }, stats: oStats },
      ksenia: { srs: { sk: kSk, en: kEn }, stats: kStats }
    }
  };
}

export async function importAllData(payload) {
  if (!payload || !payload.profiles) {
    throw new Error("Неверный формат файла резервной копии");
  }
  for (const p of ["oleg", "ksenia"]) {
    const prof = payload.profiles[p];
    if (!prof) continue;
    if (prof.srs?.sk || prof.srs?.en) {
      await saveProfileSRS(p, "sk", prof.srs.sk || {});
      await saveProfileSRS(p, "en", prof.srs.en || {});
    } else if (prof.srs) {
      await saveProfileSRS(p, "sk", prof.srs);
    }
    if (prof.stats) await kvSet(`stats_${p}`, prof.stats);
  }
}
