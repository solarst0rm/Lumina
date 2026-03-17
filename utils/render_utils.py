"""Markdown 渲染工具：生成适配盲生的 HTML 预览。"""

from __future__ import annotations

import os
import re
import tempfile
import time
import webbrowser
from pathlib import Path

import markdown
from jinja2 import Environment, FileSystemLoader


def clean_markdown_content(md_text: str, is_exercise: bool = False) -> str:
    """清理 Markdown 内容，便于稳定渲染。"""
    md_text = md_text or ""

    # 移除模型额外生成的目录段落，避免和前端目录重复。
    md_text = re.sub(r"^#+\s*目录[\s\S]*?(?=^#)", "", md_text, flags=re.MULTILINE)
    md_text = re.sub(r"\n{3,}", "\n\n", md_text).strip()

    if not is_exercise:
        return md_text

    normalized_lines: list[str] = []
    for line in md_text.split("\n"):
        if re.match(r"^#+\s*第\d+题", line):
            normalized_lines.append(re.sub(r"^#+\s*(第\d+题)", r"## \1", line))
        elif re.match(r"^#+\s*(题干|答案|解析)", line):
            normalized_lines.append(re.sub(r"^#+\s*(题干|答案|解析)", r"### \1", line))
        else:
            normalized_lines.append(line)

    return "\n".join(normalized_lines)


def markdown_to_html_fragments(md_text: str, is_exercise: bool = False) -> tuple[str, str]:
    """将 Markdown 文本渲染为正文 HTML 和目录 HTML。"""
    cleaned_text = clean_markdown_content(md_text, is_exercise)
    if not cleaned_text:
        return "", ""

    extensions = ["toc", "fenced_code", "tables", "nl2br"]
    extension_configs = {
        "toc": {"toc_depth": "1-3", "permalink": False},
        "nl2br": {},
    }
    md = markdown.Markdown(extensions=extensions, extension_configs=extension_configs)
    content_html = md.convert(cleaned_text)
    toc_html = getattr(md, "toc", "")
    return content_html, toc_html


def build_html_template(content_html: str, toc_html: str, is_exercise: bool = False) -> str:
    """构建完整 HTML 预览页。"""
    title = "例题练习" if is_exercise else "文档总结"

    current_dir = Path(__file__).parent.parent
    template_dir = current_dir / "templates"
    env = Environment(loader=FileSystemLoader(str(template_dir)))
    template = env.get_template("preview.html")

    return template.render(title=title, content_html=content_html, toc_html=toc_html)


def render_content_to_html(md_path: str | Path, is_exercise: bool = False) -> str:
    """将 Markdown 文件渲染为完整 HTML 字符串。"""
    md_file = Path(md_path)
    if not md_file.exists():
        raise FileNotFoundError(f"文件不存在：{md_path}")

    md_text = md_file.read_text(encoding="utf-8")
    content_html, toc_html = markdown_to_html_fragments(md_text, is_exercise)
    return build_html_template(content_html, toc_html, is_exercise)


def render_markdown_to_html(md_path: str | Path, is_exercise: bool = False) -> str:
    """将 Markdown 文件渲染为 HTML 并在本地尝试打开预览。"""
    html_content = render_content_to_html(md_path, is_exercise)
    title = "例题练习" if is_exercise else "文档总结"

    tmp_dir = tempfile.mkdtemp()
    html_filename = "exercise_preview.html" if is_exercise else "summary_preview.html"
    tmp_html_path = Path(tmp_dir) / html_filename
    tmp_html_path.write_text(html_content, encoding="utf-8")

    if os.environ.get("xxx_KEY") is None:
        time.sleep(0.5)
        try:
            webbrowser.open(f"file://{tmp_html_path.resolve()}", new=2)
            print(f"已打开{title}预览页：{tmp_html_path}")
        except Exception:
            print(f"已生成{title}预览页：{tmp_html_path}")
    else:
        print(f"{title}渲染完成")

    return str(tmp_html_path)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("用法：python render_utils.py <markdown文件路径> [--exercise]")
        raise SystemExit(1)

    render_markdown_to_html(sys.argv[1], len(sys.argv) > 2 and sys.argv[2] == "--exercise")
