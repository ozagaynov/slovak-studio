// js/ai.js — Единый OpenAI-совместимый клиент (локальный Ollama/Tailscale или Cloud BYOK, SK & EN)

export async function chatCompletion({ baseUrl, apiKey, model, messages, maxTokens = 220 }) {
  const cleanBase = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) {
    throw new Error("Не указан URL ИИ-сервера. Откройте Настройки (⚙️) и укажите адрес Ollama или облачного API.");
  }

  const endpoint = cleanBase.endsWith("/chat/completions")
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  const headers = { "Content-Type": "application/json" };
  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: (model || "gemma3:12b").trim(),
      messages,
      max_tokens: maxTokens,
      temperature: 0.6
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ошибка ИИ (HTTP ${res.status}): ${errText.slice(0, 160) || "проверьте URL и ключ в Настройках"}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("ИИ вернул пустой ответ.");
  }
  return content;
}

export async function runDialogueTurn({ settings, lang = "sk", scenarioPrompt, history, hardWords = [] }) {
  const targetLangName = lang === "en" ? "английском" : "словацком";
  const hardWordsHint = hardWords.length
    ? ` Постарайся естественно вплести в реплику одно из трудных слов ученика: ${hardWords.join(", ")}.`
    : "";

  const systemMsg = {
    role: "system",
    content: `${scenarioPrompt} Отвечай коротко (1–2 естественные фразы на ${targetLangName} языке). Если ученик сделал ошибку, в скобках на новой строке кратко подскажи правильный вариант по-русски.${hardWordsHint}`
  };

  return chatCompletion({
    baseUrl: settings.aiBaseUrl,
    apiKey: settings.aiKey,
    model: settings.aiModel,
    messages: [systemMsg, ...history.slice(-10)],
    maxTokens: 180
  });
}

export async function checkPhrase({ settings, lang = "sk", phrase }) {
  const targetLangName = lang === "en" ? "английского" : "словацкого";
  return chatCompletion({
    baseUrl: settings.aiBaseUrl,
    apiKey: settings.aiKey,
    model: settings.aiModel,
    messages: [
      {
        role: "system",
        content: `Ты преподаватель живого ${targetLangName} языка. Разбери фразу: 1) Естественный вариант на целевом языке, 2) Что исправлено и почему (грамматика/стиль), 3) Короткий бытовой совет. Пиши кратко и без воды.`
      },
      { role: "user", content: phrase }
    ],
    maxTokens: 320
  });
}
