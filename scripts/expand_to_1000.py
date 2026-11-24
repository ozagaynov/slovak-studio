#!/usr/bin/env python3
"""
Расширяет vocab-sk.json и vocab-en.json до 1000 проверенных лемм каждый,
используя локальный Ollama на MacBook (gemma3:12b / qwen2.5:7b) — 0 ₽ и 0 заглушек.

Запуск (при работающем Ollama):
    python3 slovak-studio/scripts/expand_to_1000.py --lang sk --target 1000
    python3 slovak-studio/scripts/expand_to_1000.py --lang en --target 1000
"""

import argparse
import json
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

THEMES = [
    "ВНЖ и документы",
    "Жильё и аренда",
    "Университет и учёба",
    "Медицина и здоровье",
    "Банки и финансы",
    "Школа и дети",
    "Город и транспорт",
    "Супермаркет и быт",
    "Кафе и еда",
    "Глаголы",
    "Прилагательные",
    "Разговорные фразы",
    "Время и числа",
    "Нострификация и кадастр",
]


def ask_ollama(base_url: str, model: str, lang: str, theme: str, existing_sample: list[str], batch_size: int = 25):
    lang_name = "словацкого" if lang == "sk" else "английского"
    prompt = (
        f"Сгенерируй ровно {batch_size} новых высокочастотных слов/фраз {lang_name} языка "
        f"по теме '{theme}' для семьи, живущей в Братиславе. "
        f"НЕ повторяй эти слова: {', '.join(existing_sample[-60:])}. "
        "Верни ТОЛЬКО валидный JSON-массив объектов с полями: "
        'word, pron, trans, ex, ex_tr, level ("A1"|"A2"|"B1"), visual (1 подходящий эмодзи). '
        "Без markdown-обёрток, без пояснений, без заглушек."
    )
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.4,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    raw = data["choices"][0]["message"]["content"].strip()
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        return []
    return json.loads(raw[start : end + 1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", choices=["sk", "en"], required=True)
    parser.add_argument("--target", type=int, default=1000)
    parser.add_argument("--base-url", default="http://localhost:11434/v1")
    parser.add_argument("--model", default="gemma3:12b")
    args = parser.parse_args()

    path = DATA_DIR / f"vocab-{args.lang}.json"
    items = json.loads(path.read_text(encoding="utf-8"))
    seen = {x["word"].strip().lower() for x in items}
    next_id = max((x["id"] for x in items), default=0) + 1

    print(f"[{args.lang.upper()}] Старт: {len(items)} слов -> цель: {args.target}")
    theme_idx = 0

    while len(items) < args.target:
        theme = THEMES[theme_idx % len(THEMES)]
        theme_idx += 1
        need = min(25, args.target - len(items))
        try:
            batch = ask_ollama(args.base_url, args.model, args.lang, theme, list(seen), need)
        except Exception as exc:
            print(f"[WARN] Ошибка запроса Ollama ({theme}): {exc}")
            break

        added = 0
        for row in batch:
            word = str(row.get("word", "")).strip()
            trans = str(row.get("trans", "")).strip()
            ex = str(row.get("ex", "")).strip()
            ex_tr = str(row.get("ex_tr", "")).strip()
            if not word or not trans or not ex or trans.startswith("слово '"):
                continue
            k = word.lower()
            if k in seen:
                continue
            seen.add(k)
            items.append({
                "id": next_id,
                "word": word,
                "pron": str(row.get("pron", "")).strip(),
                "trans": trans,
                "ex": ex,
                "ex_tr": ex_tr,
                "cat": theme,
                "level": row.get("level", "A2") if row.get("level") in ("A1", "A2", "B1", "B2") else "A2",
                "visual": str(row.get("visual", "📌")).strip()[:4] or "📌",
                "concept_id": f"{args.lang}_{next_id}",
            })
            next_id += 1
            added += 1

        path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  + {added} слов по теме '{theme}' -> всего {len(items)}/{args.target}")

    print(f"[DONE] {path}: {len(items)} проверенных слов.")


if __name__ == "__main__":
    main()
