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

DIFFICULTY_ORDER = ["简单", "进阶", "困难"]
QUESTION_COUNT_PER_LEVEL = 10
OPTION_KEYS = ["A", "B", "C", "D"]


def read_summary(md_path: str | Path) -> str:
    """Read and lightly normalize the generated summary."""
    md_file = Path(md_path)
    if not md_file.exists():
        raise FileNotFoundError(f"总结文件不存在：{md_path}")

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
        raise ValueError("模型返回内容中没有找到有效的 JSON 对象")
    return cleaned[start : end + 1]


def _normalize_option(option: dict) -> dict:
    key = str(option.get("key", "")).strip().upper()
    text = str(option.get("text", "")).strip()
    return {"key": key, "text": text}


def _normalize_answer(answer: str) -> str:
    candidate = str(answer or "").strip().upper()
    candidate = (
        candidate.replace("Ａ", "A")
        .replace("Ｂ", "B")
        .replace("Ｃ", "C")
        .replace("Ｄ", "D")
    )
    match = re.search(r"[ABCD]", candidate)
    return match.group(0) if match else candidate


def _normalize_question(question: dict, difficulty: str, index: int) -> dict:
    prompt = str(question.get("question", "")).strip()
    options = [_normalize_option(item) for item in question.get("options", [])]
    answer = _normalize_answer(str(question.get("answer", "")))
    explanation = str(question.get("explanation", "")).strip()

    if not prompt:
        raise ValueError(f"{difficulty}第{index}题缺少题干")
    if len(options) != 4:
        raise ValueError(f"{difficulty}第{index}题必须包含 4 个选项")
    if any(not item["text"] for item in options):
        raise ValueError(f"{difficulty}第{index}题存在空选项")

    # 模型偶尔会把选项键生成成重复值或全角字符，这里按顺序归一到 A/B/C/D。
    options = [
        {"key": canonical_key, "text": item["text"]}
        for canonical_key, item in zip(OPTION_KEYS, options)
    ]
    option_keys = [item["key"] for item in options]
    if option_keys != OPTION_KEYS:
        raise ValueError(f"{difficulty}第{index}题选项键必须严格为 A、B、C、D")
    if answer not in option_keys:
        raise ValueError(f"{difficulty}第{index}题正确答案必须是 A、B、C、D 之一")
    if not explanation:
        raise ValueError(f"{difficulty}第{index}题缺少解析")

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
        raise ValueError("题库 JSON 缺少 difficulties 字段")

    normalized = {
        "title": str(payload.get("title") or "练习闯关题库").strip(),
        "difficulties": {},
    }

    for difficulty in DIFFICULTY_ORDER:
        questions = difficulties.get(difficulty)
        if not isinstance(questions, list):
            raise ValueError(f"缺少难度分组：{difficulty}")
        if len(questions) < QUESTION_COUNT_PER_LEVEL:
            raise ValueError(
                f"{difficulty}题数量应至少为 {QUESTION_COUNT_PER_LEVEL} 道，实际为 {len(questions)} 道"
            )
        questions = questions[:QUESTION_COUNT_PER_LEVEL]

        normalized["difficulties"][difficulty] = [
            _normalize_question(question, difficulty, index)
            for index, question in enumerate(questions, start=1)
        ]

    return normalized


def structured_exercises_to_markdown(payload: dict) -> str:
    """Convert structured exercise data back to Markdown for download/braille."""
    lines = ["# 练习题", ""]

    for difficulty in DIFFICULTY_ORDER:
        lines.append(f"## {difficulty}")
        lines.append("")

        for index, question in enumerate(payload["difficulties"][difficulty], start=1):
            lines.append(f"### 第{index}题（{difficulty}）")
            lines.append("")
            lines.append("#### 题干")
            lines.append(question["question"])
            lines.append("")
            lines.append("#### 选项")
            for option in question["options"]:
                lines.append(f"- {option['key']}. {option['text']}")
            lines.append("")
            lines.append("#### 答案")
            answer_option = next(
                item for item in question["options"] if item["key"] == question["answer"]
            )
            lines.append(f"{question['answer']}. {answer_option['text']}")
            lines.append("")
            lines.append("#### 解析")
            lines.append(question["explanation"])
            lines.append("")

    return "\n".join(lines).strip() + "\n"


def load_exercise_payload(json_path: str | Path = DEFAULT_EXERCISE_JSON_FILENAME) -> dict:
    file_path = Path(json_path)
    if not file_path.exists():
        raise FileNotFoundError(f"结构化题库不存在：{json_path}")
    return json.loads(file_path.read_text(encoding="utf-8"))


def save_exercises(
    markdown_content: str,
    payload: dict,
    markdown_path: str | Path = DEFAULT_EXERCISE_FILENAME,
    json_path: str | Path = DEFAULT_EXERCISE_JSON_FILENAME,
) -> None:
    Path(markdown_path).write_text(markdown_content, encoding="utf-8")
    Path(json_path).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"练习题已保存：{markdown_path}")
    print(f"结构化题库已保存：{json_path}")
    render_markdown_to_html(markdown_path, is_exercise=True)


def _build_exercise_prompt(summary_text: str, difficulty: str) -> str:
    difficulty_requirements = {
        "简单": "考查核心概念和直接理解。",
        "进阶": "考查比较、应用和推理。",
        "困难": "考查综合分析、易错点辨析和迁移。",
    }
    return f"""
请严格基于下面的文档总结，只生成“{difficulty}”难度的单选题。

必须遵守以下要求：
1. 只能使用总结中已经出现的信息，禁止编造。
2. 只生成 {QUESTION_COUNT_PER_LEVEL} 道“{difficulty}”难度题，不要生成其他难度。
3. 该难度要求：{difficulty_requirements[difficulty]}
4. 每道题都必须是单选题，包含 4 个选项，选项键固定为 A、B、C、D。
5. 所有内容都要适配视障学生阅读，禁止使用公式、特殊数学符号、LaTeX。
6. 解析要清楚说明为什么正确，错误选项为什么不对，便于答错后语音播报。
7. 只输出 JSON，不要输出 Markdown，不要输出解释性前言。

JSON 结构必须严格如下：
{{
  "difficulty": "{difficulty}",
  "questions": [
    {{
      "question": "题干",
      "options": [
        {{"key": "A", "text": "选项一"}},
        {{"key": "B", "text": "选项二"}},
        {{"key": "C", "text": "选项三"}},
        {{"key": "D", "text": "选项四"}}
      ],
      "answer": "A",
      "explanation": "解析"
    }}
  ]
}}

文档总结：
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
        max_tokens=16000,
    )
    return response.choices[0].message.content or ""


def _parse_json_object(raw_content: str) -> dict:
    json_blob = _extract_json_blob(raw_content)
    return json.loads(json_blob)


def _repair_json_object(raw_content: str) -> dict:
    repaired = _request_json_object(
        system_prompt=(
            "你是 JSON 修复助手。你只能输出一个合法的 JSON 对象。"
            "不要补充解释，不要增加无关字段，只修复语法和必要的转义。"
        ),
        user_prompt=(
            "下面是一段本应为 JSON 对象的内容，但存在格式错误。"
            "请在尽量不改动语义的前提下，把它修复成合法 JSON：\n\n"
            f"{raw_content}"
        ),
    )
    return _parse_json_object(repaired)


def _request_exercise_json(summary_text: str, difficulty: str) -> dict:
    raw_content = _request_json_object(
        system_prompt=(
            "你是严谨的教学设计老师，擅长把文档总结转成高质量、"
            "可交互的单选题题库。你必须只输出合法 JSON。"
        ),
        user_prompt=_build_exercise_prompt(summary_text, difficulty),
    )

    try:
        return _parse_json_object(raw_content)
    except Exception:
        return _repair_json_object(raw_content)


def generate_exercise_payload(summary_text: str) -> dict:
    """Ask the model for structured multiple-choice exercises."""
    difficulties: dict[str, list[dict]] = {}
    for difficulty in DIFFICULTY_ORDER:
        partial_payload = _request_exercise_json(summary_text, difficulty)
        questions = partial_payload.get("questions")
        if not isinstance(questions, list):
            raise ValueError(f"{difficulty}难度返回缺少 questions 列表")
        difficulties[difficulty] = questions

    return {
        "title": "练习闯关题库",
        "difficulties": difficulties,
    }


def generate_valid_exercises(
    md_path: str | Path = "summary.md",
    max_retry: int = 2,
) -> tuple[dict, str]:
    """Generate, validate, and save exercises."""
    summary_text = read_summary(md_path)
    if not summary_text:
        raise ValueError("总结文件内容为空，无法生成练习题")

    for retry_index in range(1, max_retry + 1):
        try:
            print(f"正在生成练习题（第{retry_index}次）...")
            payload = validate_exercise_payload(generate_exercise_payload(summary_text))
            markdown_content = structured_exercises_to_markdown(payload)
            save_exercises(markdown_content, payload)
            return payload, markdown_content
        except Exception as exc:
            print(f"第{retry_index}次生成失败：{exc}")
            if retry_index >= max_retry:
                raise ValueError(f"生成练习题失败：{exc}") from exc

    raise ValueError("生成练习题失败")


def main(md_path: str = "summary.md") -> None:
    generate_valid_exercises(md_path)


if __name__ == "__main__":
    import sys

    main(sys.argv[1] if len(sys.argv) > 1 else "summary.md")
