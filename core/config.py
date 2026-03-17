"""Project configuration."""

from __future__ import annotations

import os


API_KEY = os.environ.get("xxx_KEY", "").strip()
if not API_KEY:
    print("Warning: environment variable xxx_KEY is not set; AI features will be unavailable.")

BASE_URL = os.environ.get("BASE_URL", "https://api-inference.modelscope.cn/v1").rstrip("/")
MODEL_NAME = os.environ.get("MODEL_NAME", "Qwen/Qwen3-VL-8B-Instruct")

UPLOAD_FOLDER = "uploads"
DEFAULT_SUMMARY_FILENAME = "summary.md"
DEFAULT_EXERCISE_FILENAME = "exercise.md"
DEFAULT_EXERCISE_JSON_FILENAME = "exercise.json"

MAX_CONTENT_LENGTH = 16 * 1024 * 1024
ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "pptx", "docx"}
MAX_IMAGE_SIDE = 768
PROCESS_TIMEOUT = 300

DEFAULT_USER_PROMPT = (
    "Please summarize the uploaded material in simplified Chinese, keep the structure clear, "
    "highlight key points, and make it easy to read with a screen reader."
)

FINAL_PROMPT_TEMPLATE = """{user_prompt}

You will receive one or more images extracted from a document.
Please produce a complete summary in simplified Chinese.

Requirements:
- Output Markdown only.
- Do not generate a table of contents.
- Keep the structure clear with headings.
- Explain formulas and symbols in plain natural language.
- Describe tables and figures in words.
- Focus on the document as a whole instead of page-by-page notes.
"""
