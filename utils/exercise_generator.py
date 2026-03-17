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
QUESTION_COUNT_PER_LEVEL = 5
OPTION_KEYS = ["A", "B", "C", "D"]


def read_summary(md_path: str | Path) -> str:
    """Read and normalize the generated summary."""
    md_file = Path(md_path)
    if not md_file.exists():
        raise FileNotFoundError(f"未找到总结文件：{md_path}")

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
        raise ValueError("模型输出中没有找到合法的 JSON 对象")
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
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    prompt = str(question.get("question", "")).strip()
    options = [_normalize_option(item) for item in question.get("options", [])]
    answer = _normalize_answer(str(question.get("answer", "")))
    explanation = str(question.get("explanation", "")).strip()

    if not prompt:
        raise ValueError(f"{difficulty_label}第 {index} 题缺少题干")
    if len(options) != 4:
        raise ValueError(f"{difficulty_label}第 {index} 题必须包含 4 个选项")
    if any(not item["text"] for item in options):
        raise ValueError(f"{difficulty_label}第 {index} 题存在空选项")

    options = [
        {"key": canonical_key, "text": item["text"]}
        for canonical_key, item in zip(OPTION_KEYS, options)
    ]

    if answer not in OPTION_KEYS:
        raise ValueError(f"{difficulty_label}第 {index} 题的答案无效")
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


def validate_exercise_payload(payload: dict) -> dict:
    """Validate and normalize the model output."""
    difficulties = payload.get("difficulties")
    if not isinstance(difficulties, dict):
        raise ValueError("练习题数据缺少难度分组")

    normalized = {
        "title": str(payload.get("title") or "练习闯关").strip(),
        "difficulties": {},
    }

    for difficulty in DIFFICULTY_ORDER:
        difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
        questions = difficulties.get(difficulty)
        if not isinstance(questions, list):
            raise ValueError(f"缺少难度分组：{difficulty_label}")
        if len(questions) < QUESTION_COUNT_PER_LEVEL:
            raise ValueError(f"{difficulty_label}至少需要 {QUESTION_COUNT_PER_LEVEL} 道题")

        normalized["difficulties"][difficulty] = [
            _normalize_question(question, difficulty, index)
            for index, question in enumerate(questions[:QUESTION_COUNT_PER_LEVEL], start=1)
        ]

    return normalized


def structured_exercises_to_markdown(payload: dict) -> str:
    """Convert structured exercise data back to Markdown."""
    lines = [f"# {payload.get('title', '练习闯关')}", ""]

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
        raise FileNotFoundError(f"未找到练习题数据文件：{json_path}")
    return json.loads(file_path.read_text(encoding="utf-8"))


def save_exercises(
    markdown_content: str,
    payload: dict,
    markdown_path: str | Path = DEFAULT_EXERCISE_FILENAME,
    json_path: str | Path = DEFAULT_EXERCISE_JSON_FILENAME,
) -> None:
    Path(markdown_path).write_text(markdown_content, encoding="utf-8")
    Path(json_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"练习题 Markdown 已保存到：{markdown_path}")
    print(f"练习题数据已保存到：{json_path}")
    render_markdown_to_html(markdown_path, is_exercise=True)


def _build_exercise_prompt(summary_text: str, safe_mode: bool = False) -> str:
    extra_rules = ""
    if safe_mode:
        extra_rules = """
- 这份材料可能涉及网络安全实验、漏洞分析或攻防课程。
- 只生成高层次、教学性、非操作性的概念题。
- 题目可以围绕概念、目标、术语、伦理、现象观察和防御意识展开。
- 不要要求利用步骤、payload、shellcode、命令、地址或可直接操作的攻击过程。
""".strip()

    return f"""
请输出一个 JSON 对象，其中包含标题，以及 Easy、Medium、Hard 三个难度分组。

要求：
- 每个难度必须刚好包含 {QUESTION_COUNT_PER_LEVEL} 道选择题。
- 题干、选项、解析全部使用简体中文。
- 每题必须有且只有 4 个选项，键名分别为 A、B、C、D。
- 每题答案必须是 A、B、C、D 之一。
- 不要输出 Markdown。
- 不要输出公式或 LaTeX。
- 题目只能基于我提供的总结内容生成。
{extra_rules}

JSON 格式如下：
{{
  "title": "练习闯关",
  "difficulties": {{
    "Easy": [
      {{
        "question": "题目内容",
        "options": [
          {{"key": "A", "text": "选项 A"}},
          {{"key": "B", "text": "选项 B"}},
          {{"key": "C", "text": "选项 C"}},
          {{"key": "D", "text": "选项 D"}}
        ],
        "answer": "A",
        "explanation": "解析内容"
      }}
    ],
    "Medium": [],
    "Hard": []
  }}
}}

总结内容：
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
        system_prompt="你只负责修复格式错误的 JSON，并返回合法的 JSON 对象。",
        user_prompt=f"请把下面内容修复成合法 JSON，并保持原意不变：\n\n{raw_content}",
    )
    return _parse_json_object(repaired)


def _format_model_error(exc: Exception) -> str:
    raw_message = str(exc)
    if "output data may contain inappropriate content" in raw_message.lower():
        return (
            "模型拦截了练习题生成，因为内容看起来像敏感的安全攻防材料。"
            "请改为只生成高层次、非操作性的概念题。"
        )
    return raw_message


def generate_exercise_payload(summary_text: str, safe_mode: bool = False) -> dict:
    """Ask the model for structured multiple-choice exercises."""
    try:
        raw_content = _request_json_object(
            system_prompt=(
                "你是一名擅长出题的中文教师，请生成适合学习复习的选择题。"
                "如果材料涉及网络安全相关内容，只能保持高层次、教学性、非操作性。"
            ),
            user_prompt=_build_exercise_prompt(summary_text, safe_mode=safe_mode),
        )
    except Exception as exc:
        raise RuntimeError(_format_model_error(exc)) from exc

    try:
        return _parse_json_object(raw_content)
    except Exception:
        return _repair_json_object(raw_content)


def generate_valid_exercises(
    md_path: str | Path = "summary.md",
    max_retry: int = 2,
    safe_mode: bool = False,
) -> tuple[dict, str]:
    """Generate, validate, and save exercises."""
    summary_text = read_summary(md_path)
    if not summary_text:
        raise ValueError("总结内容为空")

    for retry_index in range(1, max_retry + 1):
        try:
            print(f"正在生成练习题，第 {retry_index} 次尝试...")
            payload = validate_exercise_payload(generate_exercise_payload(summary_text, safe_mode=safe_mode))
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
