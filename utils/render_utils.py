"""Utilities for rendering Markdown previews."""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

import markdown
from markdown.postprocessors import Postprocessor
from markdown.preprocessors import Preprocessor
from markdown.extensions import Extension
from jinja2 import Environment, FileSystemLoader


def _preview_url_for(endpoint: str, **values: str) -> str:
    """Provide the subset of Flask's url_for used by standalone preview rendering."""
    if endpoint != "static":
        raise ValueError(f"Unsupported preview endpoint: {endpoint}")

    filename = str(values.get("filename", "")).lstrip("/")
    return f"/static/{filename}"


def clean_markdown_content(md_text: str, is_exercise: bool = False) -> str:
    """Normalize Markdown before rendering."""
    text = (md_text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"^#+\s*(Table of Contents|Contents)\s*$.*?(?=^#|\Z)", "", text, flags=re.MULTILINE | re.DOTALL)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if not is_exercise:
        return text

    normalized_lines: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.lower().startswith("question "):
            normalized_lines.append(f"## {stripped}")
        elif stripped.lower() in {"prompt", "answer", "explanation"}:
            normalized_lines.append(f"### {stripped}")
        else:
            normalized_lines.append(line)
    return "\n".join(normalized_lines)


class MathJaxPreservePreprocessor(Preprocessor):
    """Protect MathJax-style math delimiters from Markdown processing."""

    # Preserve common TeX delimiters: \(...\), \[...\], $$...$$, and $...$.
    MATH_PATTERN = re.compile(
        r"\\\((.+?)\\\)|\\\[(.+?)\\\]|\$\$(.+?)\$\$|(?<!\\)\$(.+?)\$(?!\$)",
        re.DOTALL,
    )

    def run(self, lines: list[str]) -> list[str]:
        text = "\n".join(lines)
        self.stored = {}

        def replace(match: re.Match[str]) -> str:
            index = len(self.stored)
            key = f"@@MATH{index}@@"
            self.stored[key] = match.group(0)
            return key

        text = self.MATH_PATTERN.sub(replace, text)
        return text.split("\n")


class MathJaxPreservePostprocessor(Postprocessor):
    """Restore protected math delimiters after Markdown conversion."""

    def __init__(self, md, preprocessor: MathJaxPreservePreprocessor):
        super().__init__(md)
        self.preprocessor = preprocessor

    def run(self, text: str) -> str:
        stored = getattr(self.preprocessor, "stored", {})
        for key, math in stored.items():
            text = text.replace(key, math)
        return text


class MathJaxPreserveExtension(Extension):
    def extendMarkdown(self, md: markdown.Markdown) -> None:
        preprocessor = MathJaxPreservePreprocessor(md)
        md.preprocessors.register(preprocessor, "mathjax_preserve", 25)
        md.postprocessors.register(
            MathJaxPreservePostprocessor(md, preprocessor),
            "mathjax_restore",
            25,
        )


def markdown_to_html_fragments(md_text: str, is_exercise: bool = False) -> tuple[str, str]:
    """Render Markdown text into HTML and TOC fragments."""
    cleaned_text = clean_markdown_content(md_text, is_exercise)
    if not cleaned_text:
        return "", ""

    md = markdown.Markdown(
        extensions=["toc", "fenced_code", "tables", "nl2br", MathJaxPreserveExtension()],
        extension_configs={"toc": {"toc_depth": "1-3", "permalink": False}},
    )
    content_html = md.convert(cleaned_text)
    toc_html = getattr(md, "toc", "")
    return content_html, toc_html


def build_html_template(content_html: str, toc_html: str, is_exercise: bool = False) -> str:
    """Build a complete HTML preview using the shared template."""
    title = "练习题预览" if is_exercise else "总结预览"
    template_dir = Path(__file__).resolve().parent.parent / "templates"
    env = Environment(loader=FileSystemLoader(str(template_dir)))
    env.globals["url_for"] = _preview_url_for
    template = env.get_template("preview.html")
    return template.render(title=title, content_html=content_html, toc_html=toc_html)


def render_content_to_html(md_path: str | Path, is_exercise: bool = False) -> str:
    """Render a Markdown file into a full HTML string."""
    md_file = Path(md_path)
    if not md_file.exists():
        raise FileNotFoundError(f"未找到文件：{md_path}")

    md_text = md_file.read_text(encoding="utf-8")
    content_html, toc_html = markdown_to_html_fragments(md_text, is_exercise)
    return build_html_template(content_html, toc_html, is_exercise)


def render_markdown_to_html(md_path: str | Path, is_exercise: bool = False) -> str:
    """Render a Markdown file and save a temporary HTML preview."""
    html_content = render_content_to_html(md_path, is_exercise)
    tmp_dir = Path(tempfile.mkdtemp(prefix="preview_"))
    html_filename = "exercise_preview.html" if is_exercise else "summary_preview.html"
    tmp_html_path = tmp_dir / html_filename
    tmp_html_path.write_text(html_content, encoding="utf-8")
    print(f"已生成预览文件：{tmp_html_path}")
    return str(tmp_html_path)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("用法：python render_utils.py <markdown_path> [--exercise]")
        raise SystemExit(1)

    render_markdown_to_html(sys.argv[1], len(sys.argv) > 2 and sys.argv[2] == "--exercise")
