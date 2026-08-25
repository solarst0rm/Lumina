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
DIFFICULTY_LABELS = {
    "Easy": "简单",
    "Medium": "中等",
    "Hard": "困难",
}
DIFFICULTY_ALIASES = {
    "Easy": ["easy", "简单", "基础", "初级"],
    "Medium": ["medium", "中等", "中级", "进阶"],
    "Hard": ["hard", "困难", "高级", "挑战"],
}
QUESTION_COUNT_PER_LEVEL = 5
OPTION_KEYS = ["A", "B", "C", "D"]
OPTION_PATTERN = re.compile(r"^\s*(?:选项\s*)?([ABCD])[\.、:：)\-]?\s*(.*)$", re.I)
ANSWER_PATTERN = re.compile(r"[ABCD]", re.I)


def read_summary(md_path: str | Path) -> str:
    """Read and normalize the generated summary."""
    md_file = Path(md_path)
    if not md_file.exists():
        raise FileNotFoundError(f"找不到总结文件：{md_path}")

    md_text = md_file.read_text(encoding="utf-8")
    md_text = re.sub(r"^#{1,4}\s*", "", md_text, flags=re.MULTILINE)
    md_text = re.sub(r"\n{2,}", "\n", md_text).strip()
    return md_text


def _strip_code_fence(text: str) -> str:
    cleaned = str(text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _extract_json_blob(text: str) -> str:
    cleaned = _strip_code_fence(text)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("模型返回中没有找到有效的 JSON 对象")
    return cleaned[start : end + 1]


def _coerce_payload(payload: dict | str) -> dict:
    if isinstance(payload, str):
        try:
            payload = json.loads(_extract_json_blob(payload))
        except Exception as exc:
            raise ValueError("练习题数据不是有效的 JSON 对象") from exc

    if not isinstance(payload, dict):
        raise ValueError("练习题数据结构不正确")

    return payload


def _clean_option_text(text: str) -> str:
    return re.sub(
        r"^\s*(?:选项\s*)?[ABCD][\.、:：)\-]\s*",
        "",
        str(text or "").strip(),
        flags=re.I,
    ).strip()


def _normalize_option(option: dict | str) -> dict:
    key = ""
    text = ""

    if isinstance(option, dict):
        key = str(
            option.get("key")
            or option.get("label")
            or option.get("option_key")
            or option.get("name")
            or ""
        ).strip().upper()
        text = str(
            option.get("text")
            or option.get("content")
            or option.get("value")
            or option.get("label_text")
            or option.get("option_text")
            or ""
        ).strip()
    else:
        raw = str(option or "").strip()
        match = OPTION_PATTERN.match(raw)
        if match:
            key = match.group(1).upper()
            text = match.group(2).strip()
        else:
            text = raw

    return {
        "key": key,
        "text": _clean_option_text(text),
    }


def _normalize_answer(answer: str) -> str:
    match = ANSWER_PATTERN.search(str(answer or "").upper())
    return match.group(0) if match else ""


def _parse_question_from_text(raw_question: str) -> dict:
    lines = [line.strip() for line in str(raw_question or "").splitlines() if line.strip()]
    if not lines:
        return {"question": "", "options": [], "answer": "", "explanation": ""}

    prompt = ""
    options: list[dict] = []
    answer = ""
    explanation_lines: list[str] = []
    in_explanation = False

    for line in lines:
        option_match = OPTION_PATTERN.match(line)
        if option_match:
            options.append(
                {
                    "key": option_match.group(1).upper(),
                    "text": option_match.group(2).strip(),
                }
            )
            continue

        answer_match = re.match(r"^(?:答案|正确答案)\s*[:：]?\s*(.+)$", line, flags=re.I)
        if answer_match:
            answer = answer_match.group(1).strip()
            in_explanation = False
            continue

        explanation_match = re.match(r"^(?:解析|解释|说明)\s*[:：]?\s*(.*)$", line, flags=re.I)
        if explanation_match:
            in_explanation = True
            explanation_text = explanation_match.group(1).strip()
            if explanation_text:
                explanation_lines.append(explanation_text)
            continue

        if not prompt:
            prompt = line
            continue

        if in_explanation:
            explanation_lines.append(line)

    return {
        "question": prompt,
        "options": options,
        "answer": answer,
        "explanation": "\n".join(part for part in explanation_lines if part).strip(),
    }


def _collect_options(question: dict) -> list[dict]:
    options: list[dict] = []
    raw_options = question.get("options") or question.get("choices")

    if isinstance(raw_options, list):
        options.extend(_normalize_option(item) for item in raw_options[:4])
    elif isinstance(raw_options, dict):
        for key in OPTION_KEYS:
            candidate = (
                raw_options.get(key)
                or raw_options.get(key.lower())
                or raw_options.get(f"option_{key.lower()}")
                or raw_options.get(f"option{key}")
            )
            if candidate is not None:
                options.append({"key": key, "text": _clean_option_text(candidate)})

    if len(options) < 4:
        for key in OPTION_KEYS:
            candidate = (
                question.get(key)
                or question.get(key.lower())
                or question.get(f"option_{key.lower()}")
                or question.get(f"option{key}")
            )
            if candidate is not None:
                options.append({"key": key, "text": _clean_option_text(candidate)})

    normalized_options: list[dict] = []
    seen_slots: set[str] = set()
    for index, option in enumerate(options):
        normalized = _normalize_option(option)
        slot = normalized["key"] or (OPTION_KEYS[index] if index < len(OPTION_KEYS) else "")
        if not slot or slot in seen_slots:
            continue
        seen_slots.add(slot)
        normalized["key"] = slot
        normalized_options.append(normalized)
        if len(normalized_options) >= 4:
            break

    return normalized_options


def _resolve_answer(answer: str, options: list[dict]) -> str:
    normalized = _normalize_answer(answer)
    if normalized in OPTION_KEYS:
        return normalized

    answer_text = _clean_option_text(str(answer or "")).lower()
    if answer_text:
        for option in options:
            option_text = _clean_option_text(option.get("text", "")).lower()
            if option_text and option_text == answer_text:
                return option["key"]

    return ""


def _get_explanation(question: dict) -> str:
    return str(
        question.get("explanation")
        or question.get("analysis")
        or question.get("reason")
        or question.get("解析")
        or question.get("说明")
        or ""
    ).strip()


def _normalize_question(question: dict | str, difficulty: str, index: int) -> dict:
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    if not isinstance(question, dict):
        question = _parse_question_from_text(str(question or ""))

    prompt = str(
        question.get("question")
        or question.get("stem")
        or question.get("title")
        or question.get("prompt")
        or ""
    ).strip()
    options = _collect_options(question)
    answer = _resolve_answer(
        str(
            question.get("answer")
            or question.get("correct_answer")
            or question.get("correctOption")
            or question.get("正确答案")
            or ""
        ),
        options,
    )
    explanation = _get_explanation(question)

    if not prompt:
        raise ValueError(f"{difficulty_label}第 {index} 题缺少题干")
    if len(options) != 4:
        raise ValueError(f"{difficulty_label}第 {index} 题选项数量不是 4 个")
    if any(not item["text"] for item in options):
        raise ValueError(f"{difficulty_label}第 {index} 题存在空选项")

    options = [
        {"key": canonical_key, "text": option["text"]}
        for canonical_key, option in zip(OPTION_KEYS, options)
    ]

    if answer not in OPTION_KEYS:
        raise ValueError(f"{difficulty_label}第 {index} 题答案不是 A/B/C/D")
    if not explanation:
        raise ValueError(f"{difficulty_label}第 {index} 题缺少解析")

    return {
        "id": f"{difficulty}-{index}",
        "difficulty": difficulty,
        "question": prompt,
        "options": options,
        "answer": answer,
        "explanation": explanation,
    }


def validate_exercise_payload(payload: dict | str) -> dict:
    """Validate and normalize the model output."""
    payload = _coerce_payload(payload)
    difficulties = payload.get("difficulties") or payload.get("levels") or payload.get("sections")
    if not isinstance(difficulties, dict):
        raise ValueError("练习题结果缺少 difficulties 字段")

    normalized = {
        "title": str(payload.get("title") or "练习题").strip(),
        "difficulties": {},
    }

    for difficulty in DIFFICULTY_ORDER:
        questions = difficulties.get(difficulty)
        if not isinstance(questions, list):
            for alias in DIFFICULTY_ALIASES.get(difficulty, []):
                questions = difficulties.get(alias)
                if isinstance(questions, list):
                    break

        if not isinstance(questions, list):
            raise ValueError(f"缺少 {DIFFICULTY_LABELS.get(difficulty, difficulty)} 难度的题目列表")
        if len(questions) < QUESTION_COUNT_PER_LEVEL:
            raise ValueError(
                f"{DIFFICULTY_LABELS.get(difficulty, difficulty)} 难度题目不足 {QUESTION_COUNT_PER_LEVEL} 道"
            )

        normalized["difficulties"][difficulty] = [
            _normalize_question(question, difficulty, index)
            for index, question in enumerate(questions[:QUESTION_COUNT_PER_LEVEL], start=1)
        ]

    return normalized


def _rotate_options(question: dict, shift: int) -> None:
    if not shift:
        return

    original_options = list(question["options"])
    rotated_texts = [None] * len(original_options)
    for old_index, option in enumerate(original_options):
        new_index = (old_index + shift) % len(original_options)
        rotated_texts[new_index] = option["text"]

    question["options"] = [
        {"key": OPTION_KEYS[index], "text": rotated_texts[index]}
        for index in range(len(OPTION_KEYS))
    ]


def rebalance_answer_distribution(payload: dict) -> dict:
    """Reorder options so correct answers stay closer to an even A/B/C/D distribution."""
    answer_counts = {key: 0 for key in OPTION_KEYS}
    ordered_questions: list[dict] = []

    for difficulty in DIFFICULTY_ORDER:
        ordered_questions.extend(payload["difficulties"].get(difficulty, []))

    for question in ordered_questions:
        current_key = question["answer"]
        if current_key not in OPTION_KEYS:
            continue

        target_key = min(OPTION_KEYS, key=lambda key: (answer_counts[key], OPTION_KEYS.index(key)))
        shift = (OPTION_KEYS.index(target_key) - OPTION_KEYS.index(current_key)) % len(OPTION_KEYS)
        _rotate_options(question, shift)
        question["answer"] = target_key
        answer_counts[target_key] += 1

    return payload


def structured_exercises_to_markdown(payload: dict) -> str:
    """Convert structured exercise data back to Markdown."""
    lines = [f"# {payload.get('title', '练习题')}", ""]

    for difficulty in DIFFICULTY_ORDER:
        lines.append(f"## {DIFFICULTY_LABELS.get(difficulty, difficulty)}")
        lines.append("")

        for index, question in enumerate(payload["difficulties"][difficulty], start=1):
            lines.append(f"### 第 {index} 题")
            lines.append("")
            lines.append("#### 题目")
            lines.append(question["question"])
            lines.append("")
            lines.append("#### 选项")
            for option in question["options"]:
                lines.append(f"- {option['key']}. {option['text']}")
            lines.append("")
            lines.append("#### 答案")
            answer_option = next(item for item in question["options"] if item["key"] == question["answer"])
            lines.append(f"{question['answer']}. {answer_option['text']}")
            lines.append("")
            lines.append("#### 解析")
            lines.append(question["explanation"])
            lines.append("")

    return "\n".join(lines).strip() + "\n"


def load_exercise_payload(json_path: str | Path = DEFAULT_EXERCISE_JSON_FILENAME) -> dict:
    file_path = Path(json_path)
    if not file_path.exists():
        raise FileNotFoundError(f"找不到练习题 JSON 文件：{json_path}")
    return json.loads(file_path.read_text(encoding="utf-8"))


def save_exercises(
    markdown_content: str,
    payload: dict,
    markdown_path: str | Path = DEFAULT_EXERCISE_FILENAME,
    json_path: str | Path = DEFAULT_EXERCISE_JSON_FILENAME,
) -> None:
    markdown_file = Path(markdown_path)
    json_file = Path(json_path)
    markdown_file.parent.mkdir(parents=True, exist_ok=True)
    json_file.parent.mkdir(parents=True, exist_ok=True)
    markdown_file.write_text(markdown_content, encoding="utf-8")
    json_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"练习题 Markdown 已保存到：{markdown_path}")
    print(f"练习题 JSON 已保存到：{json_path}")
    render_markdown_to_html(markdown_path, is_exercise=True)


def _safe_mode_rules() -> str:
    return """
- 只生成教学性、高层次、非操作性的题目和解析。
- 不要输出 exploit、payload、shellcode、攻击步骤、攻击命令或可直接执行的操作细节。
- 如果原文属于安全攻防课程，也只围绕概念理解、原理辨析和风险认知出题。
""".strip()


def _build_exercise_prompt(summary_text: str, safe_mode: bool = False) -> str:
    extra_rules = _safe_mode_rules() if safe_mode else ""
    return f"""
你是一个严谨的练习题生成器。请只输出 JSON 对象，不要附加任何解释。

要求：
- 生成 Easy、Medium、Hard 三个难度
- 每个难度生成 {QUESTION_COUNT_PER_LEVEL} 道单选题
- 每题必须包含：
  - question
  - options：长度必须是 4，每个元素都要有 key 和 text
  - answer：只能是 A/B/C/D
  - explanation：不能为空
- 题目和解析必须基于材料内容，不要编造无关知识
- 不要输出 Markdown 或多余文字
{extra_rules}

JSON 格式：
{{
  "title": "练习题",
  "difficulties": {{
    "Easy": [
      {{
        "question": "题干",
        "options": [
          {{"key": "A", "text": "选项A"}},
          {{"key": "B", "text": "选项B"}},
          {{"key": "C", "text": "选项C"}},
          {{"key": "D", "text": "选项D"}}
        ],
        "answer": "A",
        "explanation": "解析"
      }}
    ],
    "Medium": [],
    "Hard": []
  }}
}}

材料：
{summary_text}
""".strip()


def _build_single_difficulty_prompt(summary_text: str, difficulty: str, safe_mode: bool = False) -> str:
    extra_rules = _safe_mode_rules() if safe_mode else ""
    return f"""
你是一个严谨的练习题生成器。请只输出 JSON 对象，不要附加任何解释。

目标：
- 只生成 {difficulty} 难度
- 一共生成 {QUESTION_COUNT_PER_LEVEL} 道单选题
- 每题必须包含：
  - question
  - options：长度必须是 4，每个元素都要有 key 和 text
  - answer：只能是 A/B/C/D
  - explanation：不能为空
- 不要输出 Markdown 或多余文字
{extra_rules}

JSON 格式：
{{
  "difficulty": "{difficulty}",
  "questions": [
    {{
      "question": "题干",
      "options": [
        {{"key": "A", "text": "选项A"}},
        {{"key": "B", "text": "选项B"}},
        {{"key": "C", "text": "选项C"}},
        {{"key": "D", "text": "选项D"}}
      ],
      "answer": "A",
      "explanation": "解析"
    }}
  ]
}}

材料：
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
        system_prompt="你是一个 JSON 修复助手。请把输入修复为合法的 JSON 对象，只输出 JSON。",
        user_prompt=f"请把下面内容修复为合法 JSON：\n\n{raw_content}",
    )
    return _parse_json_object(repaired)


def _extract_questions_from_partial_payload(payload: dict | str, difficulty: str) -> list[dict]:
    payload = _coerce_payload(payload)

    questions = payload.get("questions")
    if isinstance(questions, list):
        return questions

    difficulties = payload.get("difficulties")
    if isinstance(difficulties, dict):
        questions = difficulties.get(difficulty)
        if isinstance(questions, list):
            return questions

    raise ValueError(f"{difficulty} 难度题目缺少 questions 列表")


def _format_model_error(exc: Exception) -> str:
    raw_message = str(exc)
    if "output data may contain inappropriate content" in raw_message.lower():
        return (
            "模型返回内容被平台安全策略拦截了。"
            "如果是安全攻防类课件，系统会尽量改成教学性、非操作性的总结和题目。"
        )
    return raw_message


def generate_exercise_payload(summary_text: str, safe_mode: bool = False) -> dict:
    """Ask the model for structured multiple-choice exercises."""
    try:
        raw_content = _request_json_object(
            system_prompt="你是一个严格输出 JSON 的练习题生成器。",
            user_prompt=_build_exercise_prompt(summary_text, safe_mode=safe_mode),
        )
    except Exception as exc:
        raise RuntimeError(_format_model_error(exc)) from exc

    try:
        return _parse_json_object(raw_content)
    except Exception:
        return _repair_json_object(raw_content)


def generate_exercise_payload_by_difficulty(summary_text: str, safe_mode: bool = False) -> dict:
    difficulties: dict[str, list[dict]] = {}

    for difficulty in DIFFICULTY_ORDER:
        try:
            raw_content = _request_json_object(
                system_prompt="你是一个严格输出 JSON 的练习题生成器。",
                user_prompt=_build_single_difficulty_prompt(summary_text, difficulty, safe_mode=safe_mode),
            )
            partial_payload = _parse_json_object(raw_content)
        except Exception:
            partial_payload = _repair_json_object(raw_content)

        difficulties[difficulty] = _extract_questions_from_partial_payload(partial_payload, difficulty)

    return {
        "title": "练习题",
        "difficulties": difficulties,
    }


def generate_valid_exercises(
    md_path: str | Path = "summary.md",
    max_retry: int = 2,
    safe_mode: bool = False,
) -> tuple[dict, str]:
    """Generate, validate, and save exercises."""
    summary_text = read_summary(md_path)
    if not summary_text:
        raise ValueError("总结内容为空，无法生成练习题")

    for retry_index in range(1, max_retry + 1):
        try:
            print(f"正在生成练习题，第 {retry_index} 次尝试...")
            try:
                payload = validate_exercise_payload(generate_exercise_payload(summary_text, safe_mode=safe_mode))
            except Exception as primary_exc:
                print(f"第 {retry_index} 次整体生成失败，尝试分难度兜底：{primary_exc}")
                payload = validate_exercise_payload(
                    generate_exercise_payload_by_difficulty(summary_text, safe_mode=safe_mode)
                )

            payload = rebalance_answer_distribution(payload)
            markdown_content = structured_exercises_to_markdown(payload)
            save_exercises(markdown_content, payload)
            return payload, markdown_content
        except Exception as exc:
            print(f"第 {retry_index} 次生成练习题失败：{exc}")
            if retry_index >= max_retry:
                raise ValueError(f"生成练习题失败：{exc}") from exc

    raise ValueError("生成练习题失败")


def main(md_path: str = "summary.md") -> None:
    generate_valid_exercises(md_path)


if __name__ == "__main__":
    import sys

    main(sys.argv[1] if len(sys.argv) > 1 else "summary.md")
