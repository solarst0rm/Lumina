"""Generate structured exercises and Markdown previews from a summary."""

from __future__ import annotations

import json
import re
from pathlib import Path

from openai import OpenAI

from core.config import (
    API_KEY,
    BASE_URL,
    DEFAULT_EXERCISE_FILENAME,
    DEFAULT_EXERCISE_JSON_FILENAME,
    MODEL_NAME,
)
from utils.render_utils import render_markdown_to_html


client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"]
QUESTION_COUNT_PER_LEVEL = 10
OPTION_KEYS = ["A", "B", "C", "D"]


def read_summary(md_path: str | Path) -> str:
    """Read and normalize the generated summary."""
    md_file = Path(md_path)
    if not md_file.exists():
        raise FileNotFoundError(f"Summary file not found: {md_path}")

    md_text = md_file.read_text(encoding="utf-8")
    md_text = re.sub(r"^#{1,4}\s*", "", md_text, flags=re.MULTILINE)
    md_text = re.sub(r"\n{2,}", "\n", md_text).strip()
    return md_text


def _strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _extract_json_blob(text: str) -> str:
    cleaned = _strip_code_fence(text)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model output did not contain a valid JSON object")
    return cleaned[start : end + 1]


def _normalize_option(option: dict) -> dict:
    return {
        "key": str(option.get("key", "")).strip().upper(),
        "text": str(option.get("text", "")).strip(),
    }


def _normalize_answer(answer: str) -> str:
    match = re.search(r"[ABCD]", str(answer or "").upper())
    return match.group(0) if match else ""


def _normalize_question(question: dict, difficulty: str, index: int) -> dict:
    prompt = str(question.get("question", "")).strip()
    options = [_normalize_option(item) for item in question.get("options", [])]
    answer = _normalize_answer(str(question.get("answer", "")))
    explanation = str(question.get("explanation", "")).strip()

    if not prompt:
        raise ValueError(f"{difficulty} question {index} is missing the question text")
    if len(options) != 4:
        raise ValueError(f"{difficulty} question {index} must contain exactly 4 options")
    if any(not item["text"] for item in options):
        raise ValueError(f"{difficulty} question {index} contains an empty option")

    options = [
        {"key": canonical_key, "text": item["text"]}
        for canonical_key, item in zip(OPTION_KEYS, options)
    ]

    if answer not in OPTION_KEYS:
        raise ValueError(f"{difficulty} question {index} has an invalid answer")
    if not explanation:
        raise ValueError(f"{difficulty} question {index} is missing the explanation")

    return {
        "id": f"{difficulty}-{index}",
        "difficulty": difficulty,
        "question": prompt,
        "options": options,
        "answer": answer,
        "explanation": explanation,
    }


def validate_exercise_payload(payload: dict) -> dict:
    """Validate and normalize the model output."""
    difficulties = payload.get("difficulties")
    if not isinstance(difficulties, dict):
        raise ValueError("Exercise payload is missing difficulties")

    normalized = {
        "title": str(payload.get("title") or "Exercise Quiz").strip(),
        "difficulties": {},
    }

    for difficulty in DIFFICULTY_ORDER:
        questions = difficulties.get(difficulty)
        if not isinstance(questions, list):
            raise ValueError(f"Missing difficulty bucket: {difficulty}")
        if len(questions) < QUESTION_COUNT_PER_LEVEL:
            raise ValueError(f"{difficulty} must contain at least {QUESTION_COUNT_PER_LEVEL} questions")

        normalized["difficulties"][difficulty] = [
            _normalize_question(question, difficulty, index)
            for index, question in enumerate(questions[:QUESTION_COUNT_PER_LEVEL], start=1)
        ]

    return normalized


def structured_exercises_to_markdown(payload: dict) -> str:
    """Convert structured exercise data back to Markdown."""
    lines = [f"# {payload.get('title', 'Exercise Quiz')}", ""]

    for difficulty in DIFFICULTY_ORDER:
        lines.append(f"## {difficulty}")
        lines.append("")

        for index, question in enumerate(payload["difficulties"][difficulty], start=1):
            lines.append(f"### Question {index}")
            lines.append("")
            lines.append("#### Prompt")
            lines.append(question["question"])
            lines.append("")
            lines.append("#### Options")
            for option in question["options"]:
                lines.append(f"- {option['key']}. {option['text']}")
            lines.append("")
            lines.append("#### Answer")
            answer_option = next(item for item in question["options"] if item["key"] == question["answer"])
            lines.append(f"{question['answer']}. {answer_option['text']}")
            lines.append("")
            lines.append("#### Explanation")
            lines.append(question["explanation"])
            lines.append("")

    return "\n".join(lines).strip() + "\n"


def load_exercise_payload(json_path: str | Path = DEFAULT_EXERCISE_JSON_FILENAME) -> dict:
    file_path = Path(json_path)
    if not file_path.exists():
        raise FileNotFoundError(f"Exercise payload not found: {json_path}")
    return json.loads(file_path.read_text(encoding="utf-8"))


def save_exercises(
    markdown_content: str,
    payload: dict,
    markdown_path: str | Path = DEFAULT_EXERCISE_FILENAME,
    json_path: str | Path = DEFAULT_EXERCISE_JSON_FILENAME,
) -> None:
    Path(markdown_path).write_text(markdown_content, encoding="utf-8")
    Path(json_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exercise markdown saved to {markdown_path}")
    print(f"Exercise payload saved to {json_path}")
    render_markdown_to_html(markdown_path, is_exercise=True)


def _build_exercise_prompt(summary_text: str) -> str:
    return f"""
Create a JSON object with a title and three difficulty groups: Easy, Medium, Hard.

Rules:
- Each difficulty must contain exactly {QUESTION_COUNT_PER_LEVEL} multiple-choice questions.
- Use simplified Chinese for question text, options, and explanations.
- Each question must have exactly 4 options with keys A, B, C, D.
- Each answer must be one of A, B, C, D.
- Do not use Markdown.
- Do not use formulas or LaTeX.
- Questions must be based only on the provided summary.

JSON shape:
{{
  "title": "Exercise Quiz",
  "difficulties": {{
    "Easy": [
      {{
        "question": "question text",
        "options": [
          {{"key": "A", "text": "option A"}},
          {{"key": "B", "text": "option B"}},
          {{"key": "C", "text": "option C"}},
          {{"key": "D", "text": "option D"}}
        ],
        "answer": "A",
        "explanation": "explanation text"
      }}
    ],
    "Medium": [],
    "Hard": []
  }}
}}

Summary:
{summary_text}
""".strip()


def _request_json_object(system_prompt: str, user_prompt: str) -> str:
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        top_p=0.9,
        max_tokens=12000,
    )
    return response.choices[0].message.content or ""


def _parse_json_object(raw_content: str) -> dict:
    return json.loads(_extract_json_blob(raw_content))


def _repair_json_object(raw_content: str) -> dict:
    repaired = _request_json_object(
        system_prompt="You only repair malformed JSON and return a valid JSON object.",
        user_prompt=f"Repair this into valid JSON without changing the meaning:\n\n{raw_content}",
    )
    return _parse_json_object(repaired)


def generate_exercise_payload(summary_text: str) -> dict:
    """Ask the model for structured multiple-choice exercises."""
    raw_content = _request_json_object(
        system_prompt="You are an expert teacher who creates accessible multiple-choice exercises.",
        user_prompt=_build_exercise_prompt(summary_text),
    )

    try:
        return _parse_json_object(raw_content)
    except Exception:
        return _repair_json_object(raw_content)


def generate_valid_exercises(
    md_path: str | Path = "summary.md",
    max_retry: int = 2,
) -> tuple[dict, str]:
    """Generate, validate, and save exercises."""
    summary_text = read_summary(md_path)
    if not summary_text:
        raise ValueError("Summary file is empty")

    for retry_index in range(1, max_retry + 1):
        try:
            print(f"Generating exercises, attempt {retry_index}...")
            payload = validate_exercise_payload(generate_exercise_payload(summary_text))
            markdown_content = structured_exercises_to_markdown(payload)
            save_exercises(markdown_content, payload)
            return payload, markdown_content
        except Exception as exc:
            print(f"Exercise generation attempt {retry_index} failed: {exc}")
            if retry_index >= max_retry:
                raise ValueError(f"Failed to generate exercises: {exc}") from exc

    raise ValueError("Failed to generate exercises")


def main(md_path: str = "summary.md") -> None:
    generate_valid_exercises(md_path)


if __name__ == "__main__":
    import sys

    main(sys.argv[1] if len(sys.argv) > 1 else "summary.md")
