// js/app.js — Главный контроллер Language Studio v3 (Four Strands: FSRS-5 + Fluency + Reader + Dialogue)

import {
  getActiveProfile,
  setActiveProfile,
  getActiveLang,
  setActiveLang,
  getSettings,
  saveSettings,
  getProfileSRS,
  saveProfileSRS,
  getCustomWords,
  addCustomWord,
  getProfileStats,
  bumpProfileActivity,
  exportAllData,
  importAllData
} from "./store.js";
import {
  scheduleCard,
  previewIntervals,
  computeBoxStats,
  buildDailyQueue,
  buildFluencyQueue,
  getHardWords
} from "./srs.js";
import { speakText, unlockAudio, startVoiceInput } from "./audio.js";
import { runDialogueTurn, checkPhrase } from "./ai.js";
import { attachCardSwipe, triggerHaptic } from "./gestures.js";

const $ = (id) => document.getElementById(id);

const appState = {
  profile: "oleg",
  lang: "sk",
  settings: null,
  decks: { sk: [], en: [] },
  customWords: [],
  scenarios: [],
  texts: [],
  srsMap: {},
  queue: [],
  cardIndex: 0,
  fluencyQueue: [],
  fluencyIdx: 0,
  readerIdx: 0,
  selectedReaderWord: null,
  currentTab: "srs",
  quizCard: null,
  quizLocked: false,
  quizScore: 0,
  scenarioIdx: 0,
  dialogHistory: []
};

function getActiveDeck() {
  return [...(appState.decks[appState.lang] || []), ...appState.customWords];
}

function updateVoiceBadge() {
  const labels = {
    elevenlabs: `🎙 ElevenLabs (${appState.lang.toUpperCase()})`,
    google: `🌐 Google (${appState.lang.toUpperCase()})`,
    piper: `🎙 Piper (${appState.lang.toUpperCase()})`,
    system: `🍎 Apple (${appState.lang.toUpperCase()})`
  };
  $("voiceStatusLabel").textContent = labels[appState.settings.voiceEngine] || labels.elevenlabs;
}

async function refreshHeaderStats() {
  const stats = await getProfileStats(appState.profile);
  $("streakCount").textContent = stats.streak;
  $("todayCount").textContent = stats.todayCount;
}

function populateTopicFilter() {
  const deck = getActiveDeck();
  const select = $("topicFilterSelect");
  const cats = [...new Set(deck.map((x) => x.cat))];
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = `🌟 Все темы (${deck.length} слов)`;
  select.appendChild(allOpt);

  cats.forEach((cat) => {
    const count = deck.filter((x) => x.cat === cat).length;
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = `${cat} (${count})`;
    select.appendChild(opt);
  });
}

function updateBoxProgress() {
  const counts = computeBoxStats(appState.srsMap);
  counts.forEach((val, idx) => {
    const el = $(`lbox${idx + 1}Count`);
    if (el) el.textContent = val;
  });
}

function rebuildQueue() {
  const deck = getActiveDeck();
  const cat = $("topicFilterSelect").value || "all";
  const pool = cat === "all" ? deck : deck.filter((c) => c.cat === cat);

  const built = buildDailyQueue(pool, appState.srsMap, {
    newLimit: Number(appState.settings.dailyNewLimit || 8)
  });
  appState.queue = built.queue;
  appState.cardIndex = 0;

  $("queueStatusPill").textContent = built.allDoneToday
    ? "План на сегодня выполнен ✓"
    : `К повтору: ${built.dueCount} · Новых: ${built.newCount}`;

  renderCurrentCard();
  updateBoxProgress();
}

function getCurrentCard() {
  if (!appState.queue.length) return null;
  return appState.queue[appState.cardIndex % appState.queue.length];
}

function renderCurrentCard() {
  const card = getCurrentCard();
  if (!card) return;

  $("srsFlashcard").classList.remove("flipped");
  $("cardVisual").textContent = card.visual || "📌";
  $("cardCatBadge").textContent = card.cat;
  $("cardCatBadgeBack").textContent = card.cat;
  $("cardLvlBadge").textContent = card.level;
  $("cardTargetWord").textContent = card.word;
  $("cardPhonetic").textContent = card.pron ? `[${card.pron}]` : "";
  $("cardTranslation").textContent = card.trans;
  $("cardExOrig").textContent = card.ex;
  $("cardExTrans").textContent = card.ex_tr;

  const noteBox = $("cardNoteBox");
  if (card.cat === "Ложные друзья") {
    noteBox.style.display = "block";
    noteBox.textContent = "⚠️ Ложный друг переводчика: не путать с похожим русским словом.";
  } else {
    noteBox.style.display = "none";
  }

  const previews = previewIntervals(appState.srsMap[card.id]);
  document.querySelectorAll("#panel-srs .srs-btn").forEach((btn) => {
    const rating = Number(btn.dataset.rating);
    const sub = btn.querySelector(".srs-interval");
    if (sub && previews[rating]) sub.textContent = previews[rating];
  });
}

async function rateCardById(cardId, ratingNum) {
  triggerHaptic();
  appState.srsMap[cardId] = scheduleCard(appState.srsMap[cardId], ratingNum);
  await saveProfileSRS(appState.profile, appState.lang, appState.srsMap);
  await bumpProfileActivity(appState.profile);
  await refreshHeaderStats();
}

async function rateCurrentCard(ratingNum) {
  const card = getCurrentCard();
  if (!card) return;
  await rateCardById(card.id, ratingNum);
  rebuildQueue();
}

// --- FLUENCY CLICKER (ПРОЩЁЛКИВАТЕЛЬ) ---
function initFluency() {
  appState.fluencyQueue = buildFluencyQueue(getActiveDeck(), appState.srsMap, 30);
  appState.fluencyIdx = 0;
  renderFluencyCard(false);
}

function renderFluencyCard(autoPlay = true) {
  const list = appState.fluencyQueue;
  if (!list.length) return;
  const card = list[appState.fluencyIdx % list.length];
  $("fluencyCard").classList.remove("flipped");
  $("fluencyProgressPill").textContent = `${(appState.fluencyIdx % list.length) + 1} / ${list.length}`;
  $("fluencyVisual").textContent = card.visual || "📌";
  $("fluencyBackVisual").textContent = card.visual || "📌";
  $("fluencyHintCat").textContent = `${card.cat} · ${card.level}`;
  $("fluencyWord").textContent = card.word;
  $("fluencyPron").textContent = card.pron ? `[${card.pron}]` : "";
  $("fluencyTrans").textContent = card.trans;

  if (autoPlay) {
    speakText(card.word, appState.settings, appState.lang);
  }
}

async function rateFluencyCard(ratingNum) {
  const list = appState.fluencyQueue;
  if (!list.length) return;
  const card = list[appState.fluencyIdx % list.length];
  await rateCardById(card.id, ratingNum);
  appState.fluencyIdx += 1;
  renderFluencyCard(true);
}

// --- LUTE-STYLE READER ---
function getLangTexts() {
  const matched = appState.texts.filter((t) => t.lang === appState.lang);
  return matched.length ? matched : appState.texts;
}

function renderReader() {
  const texts = getLangTexts();
  if (!texts.length) return;
  if (appState.readerIdx >= texts.length) appState.readerIdx = 0;

  const chips = $("readerChips");
  chips.innerHTML = "";
  texts.forEach((t, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bento-btn ${idx === appState.readerIdx ? "bento-btn-primary" : ""}`;
    btn.textContent = `${t.title} (${t.level})`;
    btn.addEventListener("click", () => {
      appState.readerIdx = idx;
      renderReader();
    });
    chips.appendChild(btn);
  });

  const current = texts[appState.readerIdx];
  $("readerFullTranslation").textContent = current.translation;
  $("readerPopup").style.display = "none";

  const deckByWord = new Map();
  getActiveDeck().forEach((c) => deckByWord.set(c.word.toLowerCase(), c));

  const box = $("readerTextBox");
  box.innerHTML = "";

  const tokens = current.text.split(/(\s+)/);
  tokens.forEach((tok) => {
    if (/^\s+$/.test(tok)) {
      box.appendChild(document.createTextNode(tok));
      return;
    }
    const clean = tok.replace(/[.,!?;:()„“"–—]/g, "").toLowerCase();
    const span = document.createElement("span");
    span.className = "reader-token";
    span.textContent = tok;

    const deckMatch = deckByWord.get(clean);
    const glossMatch = current.glossary && current.glossary[clean];

    if (deckMatch) {
      const st = appState.srsMap[deckMatch.id];
      if (st && st.interval >= 7) span.classList.add("known");
      else if (st) span.classList.add("learning");
      else span.classList.add("gloss");
    } else if (glossMatch) {
      span.classList.add("gloss");
    }

    span.addEventListener("click", () => {
      unlockAudio();
      const translation = deckMatch ? deckMatch.trans : glossMatch || "Нажмите «+ В FSRS», чтобы сохранить слово для изучения";
      appState.selectedReaderWord = {
        word: clean || tok,
        trans: translation,
        ex: current.text.slice(0, 140),
        ex_tr: current.translation.slice(0, 140),
        deckMatch
      };
      $("readerPopupWord").textContent = deckMatch ? deckMatch.word : clean || tok;
      $("readerPopupTrans").textContent = translation;
      $("readerPopup").style.display = "flex";
      speakText(clean || tok, appState.settings, appState.lang);
    });

    box.appendChild(span);
  });
}

// --- QUIZ ---
function startQuizRound() {
  const deck = getActiveDeck();
  if (deck.length < 4) return;
  appState.quizLocked = false;
  const correct = deck[Math.floor(Math.random() * deck.length)];
  appState.quizCard = correct;

  $("quizVisual").textContent = correct.visual || "🎯";
  $("quizCatBadge").textContent = correct.cat;
  $("quizWord").textContent = correct.word;
  $("quizPhonetic").textContent = correct.pron ? `[${correct.pron}]` : "";

  const options = [correct.trans];
  while (options.length < 4) {
    const cand = deck[Math.floor(Math.random() * deck.length)].trans;
    if (!options.includes(cand)) options.push(cand);
  }
  options.sort(() => Math.random() - 0.5);

  const grid = $("quizOptionsGrid");
  grid.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "quiz-opt-btn";
    btn.type = "button";
    btn.textContent = opt;
    btn.addEventListener("click", () => handleQuizAnswer(btn, opt === correct.trans));
    grid.appendChild(btn);
  });
}

async function handleQuizAnswer(btn, isCorrect) {
  if (appState.quizLocked) return;
  appState.quizLocked = true;
  triggerHaptic();

  if (isCorrect) {
    btn.classList.add("correct");
    appState.quizScore += 1;
    await bumpProfileActivity(appState.profile);
    await refreshHeaderStats();
  } else {
    btn.classList.add("wrong");
    document.querySelectorAll(".quiz-opt-btn").forEach((b) => {
      if (b.textContent === appState.quizCard.trans) b.classList.add("correct");
    });
  }
  $("quizScore").textContent = appState.quizScore;
  setTimeout(startQuizRound, 800);
}

// --- DIALOGUE ---
function renderScenarioChips() {
  const wrap = $("scenarioChips");
  wrap.innerHTML = "";
  appState.scenarios.forEach((sc, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bento-btn ${idx === appState.scenarioIdx ? "bento-btn-primary" : ""}`;
    btn.textContent = sc.title;
    btn.addEventListener("click", () => {
      appState.scenarioIdx = idx;
      renderScenarioChips();
      startScenario();
    });
    wrap.appendChild(btn);
  });
}

function appendDialogMessage(sender, text) {
  appState.dialogHistory.push({ role: sender === "bot" ? "assistant" : "user", content: text });
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender}`;

  const span = document.createElement("span");
  span.textContent = text;
  bubble.appendChild(span);

  if (sender === "bot") {
    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "bento-btn";
    speakBtn.style.cssText = "padding:3px 7px; font-size:11px; background:var(--card);";
    speakBtn.textContent = "🔊";
    speakBtn.addEventListener("click", () => speakText(text, appState.settings, appState.lang));
    bubble.appendChild(speakBtn);
  }

  const box = $("dialogMessages");
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
}

function startScenario() {
  appState.dialogHistory = [];
  $("dialogMessages").innerHTML = "";
  const sc = appState.scenarios[appState.scenarioIdx];
  if (!sc) return;
  const starter = appState.lang === "en"
    ? `Hello! Welcome to the ${sc.title.replace(/^[^\w]+/, "")} scenario. How can I help you today?`
    : sc.initial;
  appendDialogMessage("bot", starter);
}

async function sendDialogMessage() {
  const input = $("dialogInput");
  const text = input.value.trim();
  if (!text) return;
  unlockAudio();
  input.value = "";
  appendDialogMessage("user", text);

  const sc = appState.scenarios[appState.scenarioIdx];
  const hardWords = getHardWords(getActiveDeck(), appState.srsMap, 5);
  $("dialogSendBtn").disabled = true;

  try {
    const reply = await runDialogueTurn({
      settings: appState.settings,
      lang: appState.lang,
      scenarioPrompt: sc.prompt,
      history: appState.dialogHistory,
      hardWords
    });
    appendDialogMessage("bot", reply);
    await bumpProfileActivity(appState.profile);
    await refreshHeaderStats();
    speakText(reply, appState.settings, appState.lang);
  } catch (err) {
    const errDiv = document.createElement("div");
    errDiv.className = "error-box";
    errDiv.textContent = err.message;
    $("dialogMessages").appendChild(errDiv);
  } finally {
    $("dialogSendBtn").disabled = false;
  }
}

// --- DICTIONARY ---
function renderDictionary(query = "") {
  const deck = getActiveDeck();
  const q = query.trim().toLowerCase();
  const container = $("dictListContainer");
  container.innerHTML = "";

  const filtered = q
    ? deck.filter(
        (item) =>
          item.word.toLowerCase().includes(q) ||
          item.trans.toLowerCase().includes(q) ||
          item.cat.toLowerCase().includes(q)
      )
    : deck;

  $("dictFilteredCount").textContent = `${filtered.length} из ${deck.length}`;

  filtered.slice(0, 150).forEach((item) => {
    const row = document.createElement("div");
    row.className = "dict-row";

    const info = document.createElement("div");
    const wordEl = document.createElement("div");
    wordEl.className = "dict-word-cell";
    wordEl.textContent = `${item.visual || "📌"} ${item.word} `;

    if (item.pron) {
      const pronSpan = document.createElement("span");
      pronSpan.style.cssText = "font-size:12px; font-weight:500; color:var(--text-muted);";
      pronSpan.textContent = `[${item.pron}]`;
      wordEl.appendChild(pronSpan);
    }

    const transEl = document.createElement("div");
    transEl.className = "dict-trans-cell";
    transEl.textContent = `${item.trans} · ${item.cat}`;

    info.append(wordEl, transEl);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bento-btn bento-btn-primary";
    btn.style.cssText = "padding:6px 11px; font-size:12px;";
    btn.textContent = "🔊";
    btn.addEventListener("click", () => speakText(item.word, appState.settings, appState.lang));

    row.append(info, btn);
    container.appendChild(row);
  });
}

// --- CONTEXT SWITCHING (PROFILE & LANG) ---
async function reloadContext() {
  appState.srsMap = await getProfileSRS(appState.profile, appState.lang);
  appState.customWords = await getCustomWords(appState.profile, appState.lang);
  updateVoiceBadge();
  populateTopicFilter();
  await refreshHeaderStats();
  rebuildQueue();
  initFluency();
  renderReader();
  renderDictionary($("dictSearchInput").value);
  if (appState.currentTab === "dialog") {
    renderScenarioChips();
    startScenario();
  }
}

function fillSettingsForm() {
  const s = appState.settings;
  $("settingVoiceEngine").value = s.voiceEngine;
  $("settingVoiceSpeed").value = String(s.voiceSpeed);
  $("settingPiperUrl").value = s.piperUrl || "";
  $("settingElevenKey").value = s.elevenKey || "";
  $("settingElevenVoiceId").value = s.elevenVoiceId || "";
  $("settingAiBaseUrl").value = s.aiBaseUrl || "";
  $("settingAiModel").value = s.aiModel || "";
  $("settingAiKey").value = s.aiKey || "";
  $("settingDailyNewLimit").value = String(s.dailyNewLimit || 8);
}

async function init() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  }

  const [skRes, enRes, scenRes, textsRes] = await Promise.all([
    fetch("./data/vocab-sk.json"),
    fetch("./data/vocab-en.json"),
    fetch("./data/scenarios.json"),
    fetch("./data/texts.json")
  ]);
  appState.decks.sk = await skRes.json();
  appState.decks.en = await enRes.json();
  appState.scenarios = await scenRes.json();
  appState.texts = await textsRes.json();

  appState.settings = await getSettings();
  appState.profile = await getActiveProfile();
  appState.lang = await getActiveLang();

  document.querySelectorAll("#profilePillGroup .pill-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.profile === appState.profile);
  });
  document.querySelectorAll("#langPillGroup .pill-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === appState.lang);
  });

  await reloadContext();

  // Main Tabs
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => (p.style.display = "none"));
      tab.classList.add("active");
      appState.currentTab = tab.dataset.tab;
      $(`panel-${appState.currentTab}`).style.display = "block";

      if (appState.currentTab === "fluency") renderFluencyCard(false);
      if (appState.currentTab === "reader") renderReader();
      if (appState.currentTab === "dict") renderDictionary($("dictSearchInput").value);
      if (appState.currentTab === "dialog" && !appState.dialogHistory.length) {
        renderScenarioChips();
        startScenario();
      }
    });
  });

  // Sub-mode toggles (FSRS vs Quiz, Chat vs Phrase Check)
  document.querySelectorAll("#srsSubModeGroup .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#srsSubModeGroup .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const sub = btn.dataset.sub;
      $("sub-cards").style.display = sub === "cards" ? "block" : "none";
      $("sub-quiz").style.display = sub === "quiz" ? "block" : "none";
      if (sub === "quiz") startQuizRound();
    });
  });

  document.querySelectorAll("#dialogSubModeGroup .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#dialogSubModeGroup .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const sub = btn.dataset.sub;
      $("sub-chat").style.display = sub === "chat" ? "block" : "none";
      $("sub-check").style.display = sub === "check" ? "block" : "none";
    });
  });

  // Profile & Lang Switchers
  document.querySelectorAll("#profilePillGroup .pill-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      appState.profile = btn.dataset.profile;
      await setActiveProfile(appState.profile);
      document.querySelectorAll("#profilePillGroup .pill-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.profile === appState.profile);
      });
      await reloadContext();
    });
  });

  document.querySelectorAll("#langPillGroup .pill-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      appState.lang = btn.dataset.lang;
      await setActiveLang(appState.lang);
      document.querySelectorAll("#langPillGroup .pill-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.lang === appState.lang);
      });
      appState.readerIdx = 0;
      await reloadContext();
    });
  });

  // FSRS Card Swipes & Tap
  attachCardSwipe($("srsFlashcard"), {
    onTap: () => $("srsFlashcard").classList.toggle("flipped"),
    onLeft: () => rateCurrentCard(1),
    onRight: () => rateCurrentCard(3)
  });

  // Fluency Card Swipes & Tap
  attachCardSwipe($("fluencyCard"), {
    onTap: () => $("fluencyCard").classList.toggle("flipped"),
    onLeft: () => rateFluencyCard(1),
    onRight: () => rateFluencyCard(3)
  });

  $("fluencySpeakBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const card = appState.fluencyQueue[appState.fluencyIdx % appState.fluencyQueue.length];
    if (card) speakText(card.word, appState.settings, appState.lang);
  });
  $("fluencyForgotBtn").addEventListener("click", (e) => { e.stopPropagation(); rateFluencyCard(1); });
  $("fluencyKnewBtn").addEventListener("click", (e) => { e.stopPropagation(); rateFluencyCard(3); });

  $("cardSpeakBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const card = getCurrentCard();
    if (card) speakText(card.word, appState.settings, appState.lang);
  });
  $("cardExSpeakBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const card = getCurrentCard();
    if (card) speakText(card.ex, appState.settings, appState.lang);
  });
  $("nextCardBtn").addEventListener("click", () => {
    appState.cardIndex += 1;
    renderCurrentCard();
  });
  $("topicFilterSelect").addEventListener("change", rebuildQueue);

  document.querySelectorAll("#panel-srs .srs-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      rateCurrentCard(Number(btn.dataset.rating));
    });
  });

  // Reader Actions
  $("readerSpeakAllBtn").addEventListener("click", () => {
    const texts = getLangTexts();
    if (texts[appState.readerIdx]) speakText(texts[appState.readerIdx].text, appState.settings, appState.lang);
  });
  $("readerPopupSpeakBtn").addEventListener("click", () => {
    if (appState.selectedReaderWord) speakText(appState.selectedReaderWord.word, appState.settings, appState.lang);
  });
  $("readerAddSrsBtn").addEventListener("click", async () => {
    const sel = appState.selectedReaderWord;
    if (!sel) return;
    if (sel.deckMatch) {
      await rateCardById(sel.deckMatch.id, 1);
    } else {
      const newObj = {
        id: 10000 + Date.now() % 100000,
        word: sel.word,
        pron: "",
        trans: sel.trans,
        ex: sel.ex,
        ex_tr: sel.ex_tr,
        cat: "Из чтения",
        level: "A2",
        visual: "📖"
      };
      appState.customWords = await addCustomWord(appState.profile, appState.lang, newObj);
      await rateCardById(newObj.id, 1);
      populateTopicFilter();
    }
    rebuildQueue();
    renderReader();
    $("readerPopup").style.display = "none";
  });

  // Quiz
  $("quizSpeakBtn").addEventListener("click", () => {
    if (appState.quizCard) speakText(appState.quizCard.word, appState.settings, appState.lang);
  });

  // Dialogue & Phrase Check
  $("dialogSendBtn").addEventListener("click", sendDialogMessage);
  $("dialogInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendDialogMessage(); });
  $("dialogHintBtn").addEventListener("click", () => {
    const sc = appState.scenarios[appState.scenarioIdx];
    if (!sc || !sc.hints?.length) return;
    $("dialogInput").value = sc.hints[Math.floor(Math.random() * sc.hints.length)];
  });
  $("dialogMicBtn").addEventListener("click", () => {
    startVoiceInput({
      lang: appState.lang,
      onResult: (text) => { $("dialogInput").value = text; },
      onError: (msg) => alert(msg)
    });
  });

  $("runPhraseCheckBtn").addEventListener("click", async () => {
    const q = $("checkPhraseInput").value.trim();
    if (!q) return;
    const out = $("phraseCheckResult");
    out.innerHTML = "";
    const status = document.createElement("div");
    status.style.cssText = "color:var(--text-muted); font-size:13px;";
    status.textContent = "Анализирую фразу...";
    out.appendChild(status);

    try {
      const answer = await checkPhrase({ settings: appState.settings, lang: appState.lang, phrase: q });
      out.innerHTML = "";
      const box = document.createElement("div");
      box.className = "result-box";
      box.textContent = answer;
      out.appendChild(box);
      await bumpProfileActivity(appState.profile);
      await refreshHeaderStats();
    } catch (err) {
      out.innerHTML = "";
      const errDiv = document.createElement("div");
      errDiv.className = "error-box";
      errDiv.textContent = err.message;
      out.appendChild(errDiv);
    }
  });

  // Dictionary
  $("dictSearchInput").addEventListener("input", (e) => renderDictionary(e.target.value));

  // Settings & Backup
  $("openSettingsBtn").addEventListener("click", () => {
    fillSettingsForm();
    $("settingsModal").classList.add("open");
  });
  $("closeSettingsBtn").addEventListener("click", () => $("settingsModal").classList.remove("open"));
  $("saveSettingsBtn").addEventListener("click", async () => {
    appState.settings = await saveSettings({
      voiceEngine: $("settingVoiceEngine").value,
      voiceSpeed: Number($("settingVoiceSpeed").value),
      piperUrl: $("settingPiperUrl").value.trim(),
      elevenKey: $("settingElevenKey").value.trim(),
      elevenVoiceId: $("settingElevenVoiceId").value.trim(),
      aiBaseUrl: $("settingAiBaseUrl").value.trim(),
      aiModel: $("settingAiModel").value.trim(),
      aiKey: $("settingAiKey").value.trim(),
      dailyNewLimit: Math.max(1, Math.min(30, Number($("settingDailyNewLimit").value) || 8))
    });
    updateVoiceBadge();
    rebuildQueue();
    $("settingsModal").classList.remove("open");
  });

  $("exportBackupBtn").addEventListener("click", async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `language-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $("importBackupInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      await importAllData(payload);
      await reloadContext();
      alert("Прогресс успешно восстановлен!");
    } catch (err) {
      alert(err.message);
    }
    e.target.value = "";
  });
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => console.error("Init error:", err));
});
