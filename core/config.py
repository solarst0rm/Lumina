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
ALLOWED_EXTENSIONS = {
    "pdf",
    "docx",
    "pptx",
    "pptm",
    "ppsx",
    "ppsm",
    "potx",
    "potm",
    "jpg",
    "jpeg",
    "png",
    "bmp",
    "webp",
    "gif",
    "tif",
    "tiff",
}
MAX_IMAGE_SIDE = 768
PROCESS_TIMEOUT = 300
SECURITY_SENSITIVE_KEYWORDS = {
    "attacklab",
    "attack lab",
    "buffer overflow",
    "stack overflow",
    "return-oriented programming",
    "rop",
    "shellcode",
    "exploit",
    "payload",
    "gadget",
    "overflow",
    "format string",
    "ret2libc",
    "code injection",
    "ctf",
    "pwn",
}

DEFAULT_USER_PROMPT = "请用简体中文对上传资料进行结构清晰、重点明确、适合读屏的总结。"

FINAL_PROMPT_TEMPLATE = """{user_prompt}

你将收到由文档页面转成的一张或多张图片，请用简体中文输出完整总结。

要求：
- 只输出 Markdown 正文。
- 不要生成目录。
- 使用清晰的标题层级组织内容。
- 用自然语言解释公式和符号。
- 用文字描述表格和图片内容。
- 以整份文档为单位总结，不要逐页罗列。
- 如果材料涉及网络安全、攻防、漏洞、利用实验等内容，只做高层次、教学性、非操作性的总结。
- 对安全类内容，只总结学习目标、核心概念、术语、注意事项和防御视角。
- 不要输出利用步骤、payload、shellcode、命令、攻击链或可直接操作的细节。
"""
