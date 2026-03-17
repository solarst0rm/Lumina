"""Core document processing helpers."""

from __future__ import annotations

import base64
import os
import re
import shutil
import tempfile
from pathlib import Path

import fitz
from docx import Document
from openai import OpenAI
from PIL import Image, ImageDraw
from pptx import Presentation

from core.config import (
    API_KEY,
    BASE_URL,
    DEFAULT_EXERCISE_FILENAME,
    DEFAULT_SUMMARY_FILENAME,
    DEFAULT_USER_PROMPT,
    FINAL_PROMPT_TEMPLATE,
    MAX_IMAGE_SIDE,
    MODEL_NAME,
    SECURITY_SENSITIVE_KEYWORDS,
)
from utils.exercise_generator import generate_valid_exercises
from utils.render_utils import render_markdown_to_html


client = OpenAI(base_url=BASE_URL, api_key=API_KEY)


def resize_image(path: str) -> None:
    """Resize image in place so the longest side stays within the limit."""
    img = Image.open(path)
    width, height = img.size
    scale = MAX_IMAGE_SIDE / max(width, height)
    if scale < 1:
        resized = img.resize((int(width * scale), int(height * scale)))
        resized.save(path)


def image_to_base64(path: str) -> str:
    """Encode an image file as base64."""
    with open(path, "rb") as file_handle:
        return base64.b64encode(file_handle.read()).decode("utf-8")


def clean_plain_text(text: str) -> str:
    """Remove noisy markup while keeping normal paragraphs intact."""
    cleaned = text or ""
    cleaned = re.sub(r"[\\`|]", "", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def save_markdown(content: str, filename: str | Path) -> None:
    """Save Markdown content to disk."""
    Path(filename).write_text(content, encoding="utf-8")


def _looks_security_sensitive(text: str) -> bool:
    normalized = (text or "").lower()
    return any(keyword in normalized for keyword in SECURITY_SENSITIVE_KEYWORDS)


def _format_model_error(exc: Exception, stage: str) -> str:
    raw_message = str(exc)
    lowered = raw_message.lower()
    if "output data may contain inappropriate content" in lowered:
        return (
            f"The model blocked the {stage} result because the document looks like sensitive "
            "security or attack-related material. Please switch to a high-level educational "
            "summary only, or reduce operational exploit detail in the request."
        )
    return raw_message


def _render_text_lines_to_image(lines: list[str], output_path: str) -> None:
    image = Image.new("RGB", (960, 720), "white")
    draw = ImageDraw.Draw(image)
    y_offset = 20
    for line in lines:
        if y_offset > 680:
            break
        draw.text((20, y_offset), line[:80], fill="black")
        y_offset += 22
    image.save(output_path)
    resize_image(output_path)


def file_to_images(filepath: str) -> tuple[list[str], list[str]]:
    """Convert supported files to a list of images."""
    image_paths: list[str] = []
    temp_images: list[str] = []
    filepath_lower = filepath.lower()
    temp_dir = tempfile.mkdtemp(prefix="doc_pages_")

    try:
        if filepath_lower.endswith((".jpg", ".jpeg", ".png")):
            resize_image(filepath)
            image_paths.append(filepath)

        elif filepath_lower.endswith(".pdf"):
            document = fitz.open(filepath)
            for index in range(len(document)):
                page = document[index]
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
                img_path = os.path.join(temp_dir, f"page_{index}.jpg")
                pixmap.save(img_path)
                resize_image(img_path)
                image_paths.append(img_path)
                temp_images.append(img_path)
            document.close()

        elif filepath_lower.endswith(".pptx"):
            presentation = Presentation(filepath)
            for index, slide in enumerate(presentation.slides):
                slide_lines = [f"Slide {index + 1}"]
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text:
                        slide_lines.append(shape.text.strip())
                img_path = os.path.join(temp_dir, f"slide_{index}.jpg")
                _render_text_lines_to_image(slide_lines, img_path)
                image_paths.append(img_path)
                temp_images.append(img_path)

        elif filepath_lower.endswith(".docx"):
            document = Document(filepath)
            all_lines: list[str] = []
            for paragraph in document.paragraphs:
                paragraph_text = paragraph.text.strip()
                if paragraph_text:
                    all_lines.append(paragraph_text)
            for table in document.tables:
                for row in table.rows:
                    row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text:
                        all_lines.append(row_text)

            if not all_lines:
                all_lines.append("The document contains no extractable text.")

            lines_per_page = 30
            for page_index in range(0, len(all_lines), lines_per_page):
                img_path = os.path.join(temp_dir, f"docx_{page_index}.jpg")
                _render_text_lines_to_image(all_lines[page_index : page_index + lines_per_page], img_path)
                image_paths.append(img_path)
                temp_images.append(img_path)

        else:
            raise ValueError("Unsupported file format")

        return image_paths, temp_images
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def extract_reference_text(filepath: str) -> str:
    """Extract plain text for topic detection and prompt context."""
    filepath_lower = filepath.lower()
    chunks: list[str] = []

    try:
        if filepath_lower.endswith(".pdf"):
            document = fitz.open(filepath)
            for index in range(len(document)):
                text = document[index].get_text("text").strip()
                if text:
                    chunks.append(text)
            document.close()

        elif filepath_lower.endswith(".pptx"):
            presentation = Presentation(filepath)
            for slide in presentation.slides:
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text:
                        chunks.append(shape.text.strip())

        elif filepath_lower.endswith(".docx"):
            document = Document(filepath)
            for paragraph in document.paragraphs:
                if paragraph.text.strip():
                    chunks.append(paragraph.text.strip())
            for table in document.tables:
                for row in table.rows:
                    row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text:
                        chunks.append(row_text)
    except Exception:
        return ""

    return "\n".join(chunks)[:12000]


def call_model(image_paths: list[str], user_prompt: str, reference_text: str = "", safe_mode: bool = False) -> str:
    """Call the multimodal model to generate a summary."""
    if not API_KEY:
        raise RuntimeError("Environment variable xxx_KEY is not configured")

    final_prompt = FINAL_PROMPT_TEMPLATE.format(user_prompt=user_prompt)
    if safe_mode:
        final_prompt += (
            "\n\nAdditional safety mode:\n"
            "- This material may be an academic cybersecurity lab.\n"
            "- Only produce a non-operational teaching summary.\n"
            "- Do not provide exploit steps, shellcode, payloads, commands, code, or attack instructions.\n"
            "- Prefer concepts, terminology, goals, and defense-related understanding.\n"
        )
    if reference_text:
        final_prompt += f"\n\nDocument text excerpt for context:\n{reference_text[:4000]}"
    content = [{"type": "text", "text": final_prompt}]
    for path in image_paths:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_to_base64(path)}"},
            }
        )

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an educational assistant. For cybersecurity or exploit-related material, "
                    "stay high-level, academic, and non-operational."
                ),
            },
            {"role": "user", "content": content},
        ],
    )
    return response.choices[0].message.content or ""


def process_uploaded_file(filepath: str, user_prompt: str) -> dict:
    """Process an uploaded file and generate summary plus exercises."""
    temp_images: list[str] = []
    temp_dir: str | None = None

    try:
        image_paths, temp_images = file_to_images(filepath)
        if temp_images:
            temp_dir = str(Path(temp_images[0]).resolve().parent)

        final_prompt = user_prompt or DEFAULT_USER_PROMPT
        reference_text = extract_reference_text(filepath)
        safe_mode = _looks_security_sensitive(f"{filepath}\n{reference_text}\n{final_prompt}")
        try:
            model_result = call_model(image_paths, final_prompt, reference_text=reference_text, safe_mode=safe_mode)
        except Exception as exc:
            raise RuntimeError(_format_model_error(exc, "summary generation")) from exc
        markdown_content = clean_plain_text(model_result)

        summary_path = Path(DEFAULT_SUMMARY_FILENAME)
        save_markdown(markdown_content, summary_path)
        render_markdown_to_html(summary_path, is_exercise=False)

        _, exercise_content = generate_valid_exercises(summary_path, safe_mode=safe_mode)

        return {
            "success": True,
            "message": "Processing completed",
            "summary": markdown_content,
            "summary_path": str(summary_path.resolve()),
            "exercise_path": str(Path(DEFAULT_EXERCISE_FILENAME).resolve()),
            "exercise": exercise_content,
        }
    except TimeoutError:
        return {"success": False, "error": "Processing timed out"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
    finally:
        for path in temp_images:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
