// js/srs.js — FSRS-5 (DSR: Difficulty, Stability, Retrievability) + Anti-Interference Queue + Fluency Mode

export const DAY_MS = 86_400_000;

// Default FSRS-5 weights (from open-spaced-repetition/ts-fsrs)
const W = [
  0.40255, 1.18385, 3.173, 15.69105,
  7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395,
  0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const DESIRED_RETENTION = 0.9;

export function createCardState() {
  return {
    s: 0,          // Stability (days until R drops to 90%)
    d: 5.0,        // Difficulty (1..10)
    reps: 0,
    lapses: 0,
    interval: 0,
    due: 0,
    lastReview: 0
  };
}

function clampD(d) {
  return Math.min(10, Math.max(1, d));
}

export function retrievability(elapsedDays, stability) {
  if (!stability || stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

function nextInterval(stability) {
  const ivl = (stability / FACTOR) * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1);
  return Math.min(365, Math.max(1, Math.round(ivl)));
}

function initDifficulty(rating) {
  return clampD(W[4] - Math.exp(W[5] * (rating - 1)) + 1);
}

function initStability(rating) {
  return Math.max(0.1, W[rating - 1]);
}

// rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
export function scheduleCard(prevState, rating, now = Date.now()) {
  const prev = { ...createCardState(), ...(prevState || {}) };

  // First review of a new card
  if (!prev.reps && !prev.s) {
    const s = initStability(rating);
    const d = initDifficulty(rating);
    if (rating === 1) {
      return {
        s: Number(s.toFixed(2)),
        d: Number(d.toFixed(2)),
        reps: 0,
        lapses: prev.lapses + 1,
        interval: 0,
        due: now + 10 * 60_000,
        lastReview: now
      };
    }
    const interval = rating === 2 ? 0.5 : nextInterval(s);
    return {
      s: Number(s.toFixed(2)),
      d: Number(d.toFixed(2)),
      reps: 1,
      lapses: prev.lapses,
      interval,
      due: now + Math.round(interval * DAY_MS),
      lastReview: now
    };
  }

  const elapsed = Math.max(0, (now - (prev.lastReview || now)) / DAY_MS);
  const r = retrievability(elapsed, prev.s);

  // Update Difficulty with mean reversion
  const nextD = clampD(W[7] * initDifficulty(4) + (1 - W[7]) * (prev.d - W[6] * (rating - 3)));

  if (rating === 1) {
    // Lapse: stability drops according to FSRS forgetting formula
    const sForget =
      W[11] *
      Math.pow(nextD, -W[12]) *
      (Math.pow(prev.s + 1, W[13]) - 1) *
      Math.exp(W[14] * (1 - r));
    const s = Math.max(0.1, Math.min(prev.s, sForget));
    return {
      s: Number(s.toFixed(2)),
      d: Number(nextD.toFixed(2)),
      reps: prev.reps,
      lapses: prev.lapses + 1,
      interval: 0,
      due: now + 10 * 60_000,
      lastReview: now
    };
  }

  // Recall success: stability grows according to FSRS recall formula
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const sRecall =
    prev.s *
    (1 +
      Math.exp(W[8]) *
        (11 - nextD) *
        Math.pow(prev.s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus);

  const s = Math.max(prev.s + 0.1, sRecall);
  const interval = nextInterval(s);

  return {
    s: Number(s.toFixed(2)),
    d: Number(nextD.toFixed(2)),
    reps: prev.reps + 1,
    lapses: prev.lapses,
    interval,
    due: now + interval * DAY_MS,
    lastReview: now
  };
}

export function formatIntervalLabel(intervalDays, rating) {
  if (rating === 1 || intervalDays === 0) return "10 мин";
  if (intervalDays < 1) return "12 ч";
  if (intervalDays === 1) return "1 день";
  if (intervalDays < 5) return `${intervalDays} дня`;
  return `${intervalDays} дн.`;
}

export function previewIntervals(prevState, now = Date.now()) {
  return {
    1: formatIntervalLabel(scheduleCard(prevState, 1, now).interval, 1),
    2: formatIntervalLabel(scheduleCard(prevState, 2, now).interval, 2),
    3: formatIntervalLabel(scheduleCard(prevState, 3, now).interval, 3),
    4: formatIntervalLabel(scheduleCard(prevState, 4, now).interval, 4)
  };
}

export function intervalToBox(st) {
  if (!st || !st.reps) return 1;
  if (st.interval < 3) return 2;
  if (st.interval < 7) return 3;
  if (st.interval < 21) return 4;
  return 5;
}

export function computeBoxStats(srsMap) {
  const counts = [0, 0, 0, 0, 0];
  Object.values(srsMap || {}).forEach((st) => {
    const idx = Math.max(1, Math.min(5, intervalToBox(st))) - 1;
    counts[idx] += 1;
  });
  return counts;
}

// Anti-interference interleaving (Paul Nation): avoid consecutive cards from the same topic/category
function interleaveByCategory(cards) {
  const buckets = new Map();
  for (const c of cards) {
    const key = c.cat || "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  const result = [];
  let added = true;
  while (added) {
    added = false;
    for (const list of buckets.values()) {
      if (list.length) {
        result.push(list.shift());
        added = true;
      }
    }
  }
  return result;
}

export function buildDailyQueue(pool, srsMap, { newLimit = 8, now = Date.now() } = {}) {
  const due = [];
  const fresh = [];
  const upcoming = [];

  for (const card of pool) {
    const st = srsMap[card.id];
    if (!st) {
      if (fresh.length < newLimit) fresh.push(card);
    } else if ((st.due || 0) <= now) {
      due.push({ card, due: st.due || 0 });
    } else {
      upcoming.push({ card, due: st.due });
    }
  }

  due.sort((a, b) => a.due - b.due);
  const dueOrdered = interleaveByCategory(due.map((x) => x.card));
  const freshOrdered = interleaveByCategory(fresh);
  const active = [...dueOrdered, ...freshOrdered];

  return {
    queue: active.length ? active : upcoming.sort((a, b) => a.due - b.due).map((x) => x.card),
    dueCount: due.length,
    newCount: fresh.length,
    allDoneToday: active.length === 0
  };
}

// Fluency Strand (Прощёлкиватель): prioritize words with visual cues + already seen or high-frequency A1/A2
export function buildFluencyQueue(deck, srsMap, limit = 30) {
  const seen = [];
  const visualNew = [];
  for (const card of deck) {
    if (srsMap[card.id]) seen.push(card);
    else if (card.visual || card.level === "A1") visualNew.push(card);
  }
  const combined = [...seen, ...visualNew];
  const pool = combined.length ? combined : [...deck];
  return interleaveByCategory(pool).slice(0, limit);
}

export function getHardWords(deck, srsMap, limit = 5) {
  const scored = [];
  for (const card of deck) {
    const st = srsMap[card.id];
    if (st && (st.lapses > 0 || (st.d && st.d > 6.5))) {
      scored.push({ word: card.word, score: (st.lapses || 0) * 3 + (st.d || 5) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.word);
}
