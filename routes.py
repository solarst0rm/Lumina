"""Flask route registration."""

from __future__ import annotations

import io
import json
import os
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path

from flask import flash, jsonify, redirect, render_template, request, send_file, session, url_for
from flask_login import current_user, login_required, login_user, logout_user
from openai import OpenAI
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from core.config import (
    ALLOWED_EXTENSIONS,
    API_KEY,
    BASE_URL,
    DEFAULT_EXERCISE_FILENAME,
    DEFAULT_EXERCISE_JSON_FILENAME,
    DEFAULT_SUMMARY_FILENAME,
    MODEL_NAME,
    UPLOAD_FOLDER,
)
from core.processor import process_uploaded_file
from utils.braille_converter import BrailleConverter, generate_brf_file
from utils.exercise_generator import (
    generate_exercise_payload,
    generate_valid_exercises,
    load_exercise_payload,
    structured_exercises_to_markdown,
    validate_exercise_payload,
)
from utils.note_utils import (
    build_unique_title,
    extract_title_from_summary,
    normalize_summary_for_exercises,
)
from utils.render_utils import markdown_to_html_fragments


_braille_converter = None

TUTORIAL_SAMPLE_FILENAME = "示例文档.docx"
TUTORIAL_SAMPLE_SUMMARY = """# 第一章 人工智能概述

人工智能是计算机科学的一个分支，旨在创建能够模拟人类智能的系统。

## 第一节 定义与发展

人工智能诞生于二十世纪五十年代，经历了多个发展阶段。

# 第二章 机器学习基础

机器学习是人工智能的核心技术之一。

## 第一节 监督学习

监督学习通过标记数据训练模型，常用于分类和回归任务。
"""
TUTORIAL_SAMPLE_EXERCISE = """## 第一题（基础）

### 题干

请简述人工智能的定义。

### 答案

人工智能是计算机科学的一个分支，旨在模拟人类智能。

### 解析

一、核心目标是模拟人类智能行为。
二、应用已渗透到日常生活。
"""
TUTORIAL_SAMPLE_QUIZ = {
    "title": "教程示例题目",
    "difficulties": {
        "简单": [
            {
                "id": "tutorial-simple-1",
                "difficulty": "简单",
                "question": "请简述人工智能的定义。",
                "options": [
                    {"key": "A", "text": "人工智能是计算机科学的一个分支，旨在模拟人类智能。"},
                    {"key": "B", "text": "人工智能只是把纸质文档转成盲文。"},
                    {"key": "C", "text": "人工智能只能用于图像识别，不能处理文本。"},
                    {"key": "D", "text": "人工智能等同于语音播放功能。"},
                ],
                "answer": "A",
                "explanation": "人工智能的核心是让系统具备类似人类的感知、理解、推理或决策能力。",
            }
        ],
        "进阶": [
            {
                "id": "tutorial-medium-1",
                "difficulty": "进阶",
                "question": "根据示例文档，下面哪项最符合“监督学习”的描述？",
                "options": [
                    {"key": "A", "text": "通过标记数据训练模型，常用于分类和回归任务。"},
                    {"key": "B", "text": "完全不需要数据，也不需要训练。"},
                    {"key": "C", "text": "只能生成图片，不能分析文本。"},
                    {"key": "D", "text": "只能在线使用，不能离线运行。"},
                ],
                "answer": "A",
                "explanation": "示例文档中明确提到，监督学习依赖标记数据训练模型，并常用于分类和回归。",
            }
        ],
        "困难": [
            {
                "id": "tutorial-hard-1",
                "difficulty": "困难",
                "question": "示例文档把“人工智能”与“机器学习”之间的关系描述为哪一项？",
                "options": [
                    {"key": "A", "text": "机器学习是人工智能的核心技术之一。"},
                    {"key": "B", "text": "人工智能只是机器学习中的一个小分支。"},
                    {"key": "C", "text": "二者完全无关。"},
                    {"key": "D", "text": "二者都是盲文文件格式。"},
                ],
                "answer": "A",
                "explanation": "示例文档第二章开头明确指出，机器学习是人工智能的核心技术之一。",
            }
        ],
    },
}


def get_braille_converter():
    global _braille_converter
    if _braille_converter is None:
        _braille_converter = BrailleConverter()
    return _braille_converter


def _read_text_if_exists(path: str | Path) -> str:
    file_path = Path(path)
    if not file_path.exists():
        return ""
    return file_path.read_text(encoding="utf-8")


def _validate_upload_file(file) -> str | None:
    original_filename = (file.filename or "").strip()
    original_path = Path(original_filename)
    extension = original_path.suffix.lower().lstrip(".")
    safe_stem = secure_filename(original_path.stem) or "upload"
    filename = f"{safe_stem}.{extension}" if extension else ""

    if not original_filename:
        return "请选择要上传的文件。"
    if not extension:
        return "识别不到文件后缀，请重新选择文件后再试。"
    if extension == "ppt":
        return "暂不支持旧版 .ppt 文件，请先另存为 .pptx 后再上传。"
    if extension not in ALLOWED_EXTENSIONS:
        return (
            "暂不支持该文件格式。请上传 PDF、DOCX、PPTX/PPTM/PPSX/PPSM/POTX/POTM，"
            "或 JPG/JPEG/PNG/BMP/WEBP/GIF/TIFF 图片。"
        )

    setattr(file, "_display_filename", original_filename)
    file.filename = filename
    return None


def _extract_answer_key(answer_text: str, options: list[dict] | None = None) -> str:
    match = re.match(r"\s*([A-Za-z])(?:[\s，。：:、|]|$)", (answer_text or "").strip())
    if match:
        return match.group(1).upper()

    for option in options or []:
        key = str(option.get("key", "")).strip().upper()
        if key:
            return key

    return "A"


_SOURCE_FILENAME_PLACEHOLDERS = {
    "",
    "å½“å‰ç»ƒä¹ ",
    "å½“å‰æ–‡æ¡£",
    "æœªå‘½åæ–‡æ¡£",
}


def _normalize_source_filename(raw_value: str | None) -> str:
    normalized = (raw_value or "").strip()
    if normalized in _SOURCE_FILENAME_PLACEHOLDERS:
        return "æœªå‘½åæ–‡æ¡£"
    return normalized


def _load_mistake_options(record) -> list[dict]:
    try:
        options = json.loads(record.options_json or "[]")
    except json.JSONDecodeError:
        options = []
    return options if isinstance(options, list) else []


def _normalize_multiline_text(value: str | None, fallback: str = "") -> str:
    text = str(value or fallback or "").strip()
    if not text:
        return fallback
    return text.replace("\\r\\n", "\n").replace("\\n", "\n")


def _build_mistake_payload(record) -> dict:
    options = _load_mistake_options(record)
    return {
        "id": f"mistake-{record.id}",
        "question": record.question_text,
        "options": options,
        "answer": _extract_answer_key(record.correct_answer, options),
        "explanation": _normalize_multiline_text(record.explanation, "暂无解析"),
    }


def _jobs_dir(basedir: str) -> Path:
    jobs_dir = Path(basedir) / "jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    return jobs_dir


def _job_status_path(basedir: str, job_id: str) -> Path:
    return _jobs_dir(basedir) / f"{job_id}.json"


def _write_job_status(basedir: str, job_id: str, payload: dict) -> None:
    _job_status_path(basedir, job_id).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _read_job_status(basedir: str, job_id: str) -> dict | None:
    status_path = _job_status_path(basedir, job_id)
    if not status_path.exists():
        return None
    return json.loads(status_path.read_text(encoding="utf-8"))


def _assistant_context_file(upload_dir: str | Path) -> Path:
    return Path(upload_dir) / "current_ai_assistant_context.json"


def _trim_ai_context(text: str, limit: int) -> str:
    normalized = (text or "").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip() + "\n\n（以下内容因过长已省略）"


def _save_ai_assistant_context(upload_dir: str | Path, filename: str, document_text: str) -> None:
    payload = {
        "filename": filename or "",
        "document_text": document_text or "",
        "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
    }
    context_file = _assistant_context_file(upload_dir)
    context_file.parent.mkdir(parents=True, exist_ok=True)
    context_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _load_ai_assistant_context(upload_dir: str | Path) -> dict:
    context_file = _assistant_context_file(upload_dir)
    if not context_file.exists():
        return {"filename": "", "document_text": ""}

    try:
        payload = json.loads(context_file.read_text(encoding="utf-8"))
    except Exception:
        return {"filename": "", "document_text": ""}

    return {
        "filename": str(payload.get("filename") or ""),
        "document_text": str(payload.get("document_text") or ""),
    }


def _format_ai_context_section(title: str, text: str, empty_text: str = "无") -> str:
    content = (text or "").strip() or empty_text
    return f"【{title}】\n{content}"


def _save_and_process(file, prompt, upload_dir):
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    file.save(file_path)
    return _process_document(file_path, (prompt or "").strip())


def _process_document(file_path, user_prompt):
    if not file_path or not os.path.exists(file_path):
        return None, None, "文件不存在", None, None, ""

    try:
        result = process_uploaded_file(file_path, user_prompt or "")
        if result.get("success"):
            summary = result.get("summary", "")
            exercise = result.get("exercise", "") or _read_text_if_exists(DEFAULT_EXERCISE_FILENAME)
            document_text = result.get("document_text", "")
            summary_file = DEFAULT_SUMMARY_FILENAME if Path(DEFAULT_SUMMARY_FILENAME).exists() else None
            exercise_file = DEFAULT_EXERCISE_FILENAME if Path(DEFAULT_EXERCISE_FILENAME).exists() else None
            return summary, exercise, "完成！", summary_file, exercise_file, document_text

        return None, None, f"错误：{result.get('error', '未知错误')}", None, None, ""
    except Exception as exc:
        return None, None, f"出错：{exc}", None, None, ""


def _convert_to_braille(text, brf_path):
    if not text or not text.strip():
        return "请先生成内容", None

    try:
        result = get_braille_converter().convert_to_braille(text)
        generate_brf_file(result["brf_content"], brf_path)
        return result["unicode"], os.path.basename(brf_path)
    except Exception as exc:
        return f"转换失败：{exc}", None


def _render_summary_markdown(summary_text: str) -> tuple[str, str]:
    if not summary_text or not summary_text.strip():
        return "", ""
    return markdown_to_html_fragments(summary_text, is_exercise=False)


def register_routes(app, db, User, Note, NoteFolder, MistakeRecord):
    basedir = app.config["BASEDIR"]
    upload_dir = Path(basedir) / UPLOAD_FOLDER
    ai_client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

    def _start_processing_job(file_storage, prompt: str) -> str:
        display_filename = (
            getattr(file_storage, "_display_filename", "") or file_storage.filename or "upload.bin"
        )
        filename = secure_filename(file_storage.filename or "upload.bin") or "upload.bin"
        job_id = uuid.uuid4().hex
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / f"{job_id}_{filename}"
        file_storage.save(file_path)

        _write_job_status(
            basedir,
            job_id,
            {
                "job_id": job_id,
                "status": "processing",
                "uploaded_filename": display_filename,
                "summary": "",
                "exercise": "",
                "error": "",
                "updated_at": datetime.utcnow().isoformat(),
            },
        )

        def worker():
            try:
                result = process_uploaded_file(str(file_path), prompt or "")
                if result.get("success"):
                    summary = result.get("summary", "")
                    exercise = result.get("exercise", "") or _read_text_if_exists(DEFAULT_EXERCISE_FILENAME)
                    document_text = result.get("document_text", "")
                    _save_ai_assistant_context(upload_dir, display_filename, document_text)
                    _write_job_status(
                        basedir,
                        job_id,
                        {
                            "job_id": job_id,
                            "status": "completed",
                            "uploaded_filename": display_filename,
                            "summary": summary,
                            "exercise": exercise,
                            "error": "",
                            "updated_at": datetime.utcnow().isoformat(),
                        },
                    )
                    return

                _write_job_status(
                    basedir,
                    job_id,
                    {
                        "job_id": job_id,
                        "status": "failed",
                        "uploaded_filename": display_filename,
                        "summary": "",
                        "exercise": "",
                        "error": result.get("error", "处理失败"),
                        "updated_at": datetime.utcnow().isoformat(),
                    },
                )
            except Exception as exc:
                _write_job_status(
                    basedir,
                    job_id,
                    {
                        "job_id": job_id,
                        "status": "failed",
                        "uploaded_filename": display_filename,
                        "summary": "",
                        "exercise": "",
                        "error": str(exc),
                        "updated_at": datetime.utcnow().isoformat(),
                    },
                )

        threading.Thread(target=worker, daemon=True).start()
        return job_id

    ai_chat_system_prompt = (
        "你是学习助手中的 AI 语音伙伴，专门帮助视障学生学习。"
        "你的回答会被语音朗读，因此必须使用简洁、自然、耐心的中文。"
        "不要使用 Markdown、表格、LaTeX、公式或复杂符号。"
        "如果需要分点，请用“第一、第二、第三”这样的中文表达。"
        "优先依据提供的原始文档、AI 总结、练习题和当前页面上下文回答。"
        "如果信息不足或无法确认，请直接说明。"
    )

    def _require_exercises():
        summary_text = _read_text_if_exists(DEFAULT_SUMMARY_FILENAME)
        if not summary_text:
            return None, None, None

        exercise_markdown = _read_text_if_exists(DEFAULT_EXERCISE_FILENAME)

        try:
            payload = load_exercise_payload(DEFAULT_EXERCISE_JSON_FILENAME)
        except Exception:
            payload = None

        if exercise_markdown and payload:
            return summary_text, exercise_markdown, payload

        try:
            payload, exercise_markdown = generate_valid_exercises(DEFAULT_SUMMARY_FILENAME)
        except Exception:
            return summary_text, exercise_markdown, None

        return summary_text, exercise_markdown, payload

    def _parse_folder_id(raw_value):
        if raw_value in (None, "", "null"):
            return None
        try:
            return int(raw_value)
        except (TypeError, ValueError):
            return None

    def _folder_path_text(folder) -> str:
        if not folder:
            return "主文件夹"

        parts = []
        current = folder
        while current is not None:
            parts.append(current.name)
            current = current.parent
        return " / ".join(reversed(parts))

    def _load_user_folders():
        return (
            NoteFolder.query.filter_by(user_id=current_user.id)
            .order_by(NoteFolder.name.asc(), NoteFolder.id.asc())
            .all()
        )

    def _build_folder_tree(folders):
        folder_lookup = {folder.id: folder for folder in folders}
        children_map: dict[int | None, list] = {}
        for folder in folders:
            children_map.setdefault(folder.parent_id, []).append(folder)
        for child_list in children_map.values():
            child_list.sort(key=lambda item: (item.name or "").lower())
        return folder_lookup, children_map

    def _collect_descendant_folder_ids(folder_id, children_map):
        collected = [folder_id]
        for child in children_map.get(folder_id, []):
            collected.extend(_collect_descendant_folder_ids(child.id, children_map))
        return collected

    def _build_folder_option_items(folders):
        _, children_map = _build_folder_tree(folders)
        items = []

        def walk(parent_id=None, prefix=""):
            for folder in children_map.get(parent_id, []):
                items.append(
                    {
                        "id": folder.id,
                        "label": f"{prefix}{folder.name}" if prefix else folder.name,
                    }
                )
                walk(folder.id, prefix + "-- ")

        walk()
        return items

    def _build_folder_breadcrumbs(folder):
        crumbs = []
        current = folder
        while current is not None:
            crumbs.append(current)
            current = current.parent
        return list(reversed(crumbs))

    def _json_success(message: str, **payload):
        response = {"success": True, "message": message}
        response.update(payload)
        return jsonify(response)

    def _json_error(message: str, status: int = 400):
        return jsonify({"success": False, "error": message}), status

    def _build_unique_note_title(user_id: int, summary_text: str, fallback: str = "") -> str:
        base_title = extract_title_from_summary(summary_text, fallback)
        existing_titles = [
            title
            for (title,) in db.session.query(Note.title)
            .filter(Note.user_id == user_id)
            .all()
        ]
        return build_unique_title(base_title, existing_titles)

    def _create_note_record(summary_text, exercise_markdown, quiz_payload, source_filename, document_text, folder):
        note = Note(
            title=_build_unique_note_title(current_user.id, summary_text, source_filename or ""),
            content=summary_text or "",
            exercise_content=exercise_markdown or "",
            exercise_payload=json.dumps(quiz_payload, ensure_ascii=False, indent=2) if quiz_payload else "",
            source_filename=source_filename or "",
            document_text=document_text or "",
            folder_id=folder.id if folder else None,
            author=current_user,
        )
        db.session.add(note)
        db.session.commit()
        return note

    def _create_named_note_record(
        title,
        summary_text,
        exercise_markdown,
        quiz_payload,
        source_filename,
        document_text,
        folder,
    ):
        base_title = (title or "").strip()
        if not base_title:
            base_title = extract_title_from_summary(summary_text, source_filename or "")
        existing_titles = [
            value
            for (value,) in db.session.query(Note.title)
            .filter(Note.user_id == current_user.id)
            .all()
        ]
        note = Note(
            title=build_unique_title(base_title, existing_titles),
            content=summary_text or "",
            exercise_content=exercise_markdown or "",
            exercise_payload=json.dumps(quiz_payload, ensure_ascii=False, indent=2) if quiz_payload else "",
            source_filename=source_filename or "",
            document_text=document_text or "",
            folder_id=folder.id if folder else None,
            author=current_user,
        )
        db.session.add(note)
        db.session.commit()
        return note

    def _split_community_post_content(title: str, raw_content: str) -> tuple[str, str]:
        content = (raw_content or "").replace("\r\n", "\n").strip()
        if not content:
            return "", ""

        markers = [
            "\n## 练习题",
            "\n## 练习",
            "\n## 例题",
            "\n### 练习题",
            "\n### 练习",
            "\n### 例题",
        ]
        split_index = -1
        for marker in markers:
            candidate = content.find(marker)
            if candidate != -1 and (split_index == -1 or candidate < split_index):
                split_index = candidate

        if split_index == -1:
            return content, ""

        summary_text = content[:split_index].strip()
        exercise_markdown = content[split_index:].strip()
        if not summary_text:
            summary_text = f"# {title}\n\n{content}".strip()
        return summary_text, exercise_markdown

    def _get_user_note_or_404(note_id: int):
        note = Note.query.filter_by(id=note_id, user_id=current_user.id).first()
        if note is None:
            flash("未找到对应笔记")
            return None
        return note

    def _get_user_folder_or_404(folder_id: int):
        folder = NoteFolder.query.filter_by(id=folder_id, user_id=current_user.id).first()
        if folder is None:
            flash("未找到对应文件夹")
            return None
        return folder

    def _ensure_note_exercises(note):
        payload = None
        if note.exercise_payload:
            try:
                payload = json.loads(note.exercise_payload)
            except Exception:
                payload = None

        if payload and not note.exercise_content:
            note.exercise_content = structured_exercises_to_markdown(payload)
            db.session.commit()
            return note.exercise_content, payload

        if note.exercise_content and payload:
            return note.exercise_content, payload

        summary_source = normalize_summary_for_exercises(note.content or "")
        if not summary_source:
            raise ValueError("当前笔记缺少总结内容，暂时无法生成例题。")

        payload = validate_exercise_payload(generate_exercise_payload(summary_source))
        note.exercise_content = structured_exercises_to_markdown(payload)
        note.exercise_payload = json.dumps(payload, ensure_ascii=False, indent=2)
        db.session.commit()
        return note.exercise_content, payload

    def _render_saved_note_page(note):
        summary_html, summary_toc_html = _render_summary_markdown(note.content or "")
        folder_label = _folder_path_text(note.folder)
        exercise_ready = bool((note.exercise_content or "").strip() and (note.exercise_payload or "").strip())
        folder_query = str(note.folder_id) if note.folder else "root"

        return render_template(
            "result.html",
            page_heading=note.title,
            page_mode="note",
            summary=note.content or "",
            summary_html=summary_html,
            summary_toc_html=summary_toc_html,
            exercise=note.exercise_content or "",
            uploaded_filename=note.source_filename or note.title,
            challenge_url=url_for("note_exercise_challenge", note_id=note.id),
            download_summary_url=url_for("download_note_summary", note_id=note.id),
            back_library_url=url_for("my_notes", folder_id=folder_query),
            note_folder_label=folder_label,
            note_has_exercises=exercise_ready,
            note_exercise_braille_url=url_for("note_exercise_braille", note_id=note.id),
            show_upload_to_community=False,
            show_upload_new_file=False,
        )

    def _build_ai_chat_context(page_context):
        assistant_context = _load_ai_assistant_context(upload_dir)
        source_file = (request.args.get("source_file") or "").strip() or assistant_context.get("filename", "")
        filename = assistant_context.get("filename", "")
        document_text = _trim_ai_context(assistant_context.get("document_text", ""), 18000)
        summary_text = _trim_ai_context(_read_text_if_exists(DEFAULT_SUMMARY_FILENAME), 12000)
        exercise_text = _trim_ai_context(_read_text_if_exists(DEFAULT_EXERCISE_FILENAME), 12000)

        page_context_text = ""
        if isinstance(page_context, dict) and page_context:
            page_context_text = _trim_ai_context(
                json.dumps(page_context, ensure_ascii=False, indent=2),
                4000,
            )

        sections = [
            _format_ai_context_section("当前上传文件名", filename),
            _format_ai_context_section("当前上传文档原文", document_text),
            _format_ai_context_section("AI 总结", summary_text),
            _format_ai_context_section("AI 生成的练习题", exercise_text),
        ]
        if page_context_text:
            sections.append(_format_ai_context_section("当前页面上下文", page_context_text))

        return "\n\n以下是用户当前学习材料，请优先基于这些内容回答：\n" + "\n\n".join(sections)

    def _quote_name_list(names: list[str]) -> str:
        filtered = [f"“{name.strip()}”" for name in names if (name or "").strip()]
        return "、".join(filtered)

    def _build_my_notes_page_announcement(page_context: dict) -> str:
        folder_name = str(page_context.get("current_folder_name") or "主文件夹").strip() or "主文件夹"
        note_titles = [
            str(item.get("title") or "").strip()
            for item in (page_context.get("notes") or [])
            if isinstance(item, dict)
        ]
        child_folder_names = [
            str(item.get("name") or "").strip()
            for item in (page_context.get("child_folders") or [])
            if isinstance(item, dict)
        ]

        location_text = "当前您在主文件夹" if folder_name == "主文件夹" else f"当前您在文件夹“{folder_name}”"
        if note_titles:
            note_text = f"共{len(note_titles)}篇笔记，分别是{_quote_name_list(note_titles)}。"
        else:
            note_text = "当前没有笔记。"

        if child_folder_names:
            folder_text = f"共{len(child_folder_names)}个子文件夹，分别是{_quote_name_list(child_folder_names)}。"
        else:
            folder_text = "当前没有子文件夹。"

        return (
            f"{location_text}，{note_text}{folder_text}"
            "你可以按 Ctrl 加空格唤醒语音助手，也可以长按空格键直接语音输入。"
        )

    def _normalize_assistant_text(text: str) -> str:
        cleaned = str(text or "").strip().lower()
        return re.sub(r"[\s\"'“”‘’《》【】「」『』（）()\[\]{}，。！？!?:：;；、/\\\\]+", "", cleaned)

    def _spoken_number_to_int(text: str) -> int | None:
        raw = str(text or "").strip()
        if not raw:
            return None
        if raw.isdigit():
            return int(raw)

        digit_map = {
            "零": 0,
            "一": 1,
            "二": 2,
            "两": 2,
            "三": 3,
            "四": 4,
            "五": 5,
            "六": 6,
            "七": 7,
            "八": 8,
            "九": 9,
        }

        if raw == "十":
            return 10

        if "十" in raw:
            left, right = raw.split("十", 1)
            tens = 1 if left == "" else digit_map.get(left)
            ones = 0 if right == "" else digit_map.get(right)
            if tens is None or ones is None:
                return None
            return tens * 10 + ones

        total = 0
        for char in raw:
            value = digit_map.get(char)
            if value is None:
                return None
            total = total * 10 + value
        return total if total > 0 else None

    def _extract_spoken_index(text: str) -> int | None:
        match = re.search(r"第([0-9零一二三四五六七八九十两]+)", str(text or ""))
        if not match:
            return None
        return _spoken_number_to_int(match.group(1))

    def _resolve_assistant_target(message: str, items: list[dict], label_key: str) -> tuple[dict | None, str | None]:
        if not items:
            return None, None

        normalized_message = _normalize_assistant_text(message)
        matches: list[tuple[int, str, dict]] = []
        for item in items:
            label = str(item.get(label_key) or "").strip()
            normalized_label = _normalize_assistant_text(label)
            if normalized_label and normalized_label in normalized_message:
                matches.append((len(normalized_label), label, item))

        if matches:
            matches.sort(key=lambda value: (-value[0], value[1]))
            return matches[0][2], None

        index = _extract_spoken_index(message)
        if index is None:
            return None, None
        if index < 1 or index > len(items):
            return None, f"你提到的是第{index}个，但当前列表没有这么多项目。"
        return items[index - 1], None

    def _extract_folder_name_from_command(message: str) -> str:
        text = str(message or "").strip().strip("。！？!?，,；;：: ")
        patterns = [
            r"(?:新建|创建|新增|建立)(?:一个)?(?:子)?文件夹(?:叫做|叫|名为|名称是)?(.+)$",
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if not match:
                continue
            folder_name = match.group(1).strip().strip("“”\"' ")
            folder_name = re.sub(r"^(叫做|叫|名为|名称是)", "", folder_name).strip()
            folder_name = folder_name.rstrip("。！？!?，,；;：: ")
            return folder_name
        return ""

    def _extract_rename_target_name(message: str) -> str:
        text = str(message or "").strip().strip("。！？!?，,；;：: ")
        patterns = [
            r"(?:改名为|改为|改成|重命名为|重命名成|命名为|叫做|叫|名为)(.+)$",
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if not match:
                continue
            folder_name = match.group(1).strip().strip("“”\"' ")
            folder_name = folder_name.rstrip("。！？!?，,；;：: ")
            return folder_name
        return ""

    def _build_my_notes_assistant_response(message: str, page_context: dict) -> dict:
        text = str(message or "").strip()
        normalized = _normalize_assistant_text(text)
        notes = page_context.get("notes") or []
        child_folders = page_context.get("child_folders") or []
        current_folder_id = _parse_folder_id(page_context.get("current_folder_id"))
        parent_folder_id = _parse_folder_id(page_context.get("parent_folder_id"))
        announcement = _build_my_notes_page_announcement(page_context)

        if any(keyword in normalized for keyword in ("帮助", "怎么用", "如何用", "能做什么", "操作")):
            return {
                "reply": (
                    "我可以帮你重新播报当前列表、打开笔记、进入子文件夹、返回上一级，"
                    "也可以新建文件夹、重命名文件夹，或打开删除确认窗口。"
                    "你可以这样说：打开第一篇笔记，进入一年级，返回上一级，新建文件夹三年级，或把一年级改名为一年级上册。"
                )
            }

        if any(keyword in normalized for keyword in ("重新播报", "再播报", "再说一遍", "当前页面", "当前列表", "有哪些", "有什么", "播报当前", "朗读当前")):
            return {"reply": announcement}

        if any(keyword in normalized for keyword in ("返回主文件夹", "回主文件夹", "打开主文件夹", "进入主文件夹", "返回根目录", "回根目录", "打开根目录", "进入根目录")):
            return {
                "reply": "正在返回主文件夹。",
                "action": {"type": "navigate", "url": url_for("my_notes")},
            }

        if any(keyword in normalized for keyword in ("返回上一级", "回到上一级", "回上一级", "上一级")):
            if current_folder_id is None:
                return {"reply": "当前已经在主文件夹。"}

            if parent_folder_id is None:
                parent_name = "主文件夹"
                target_url = url_for("my_notes")
            else:
                parent_folder = NoteFolder.query.filter_by(id=parent_folder_id, user_id=current_user.id).first()
                parent_name = parent_folder.name if parent_folder else "上一级文件夹"
                target_url = url_for("my_notes", folder_id=parent_folder_id)

            return {
                "reply": f"正在返回{parent_name}。",
                "action": {"type": "navigate", "url": target_url},
            }

        if any(keyword in normalized for keyword in ("新建文件夹", "创建文件夹", "新增文件夹", "建立文件夹")):
            folder_name = _extract_folder_name_from_command(text)
            if not folder_name:
                return {
                    "reply": "我已经帮你打开新建文件夹窗口，请输入文件夹名称。",
                    "action": {"type": "open_create_folder"},
                }

            return {
                "reply": f"正在创建文件夹“{folder_name}”。",
                "action": {"type": "create_folder", "name": folder_name},
            }

        note_target, note_error = _resolve_assistant_target(text, notes, "title")
        folder_target, folder_error = _resolve_assistant_target(text, child_folders, "name")

        if any(keyword in normalized for keyword in ("重命名", "改名", "改成", "改为", "名为")):
            if folder_error:
                return {"reply": folder_error}
            if not folder_target:
                return {"reply": "请告诉我要重命名哪个子文件夹。"}

            new_folder_name = _extract_rename_target_name(text)
            if not new_folder_name:
                return {
                    "reply": f"我已打开文件夹“{folder_target['name']}”的重命名窗口，请输入新名称。",
                    "action": {"type": "open_rename_folder", "folder_id": folder_target["id"]},
                }

            return {
                "reply": f"正在把文件夹“{folder_target['name']}”重命名为“{new_folder_name}”。",
                "action": {
                    "type": "rename_folder",
                    "folder_id": folder_target["id"],
                    "name": new_folder_name,
                },
            }

        if any(keyword in normalized for keyword in ("删除", "移除")):
            wants_folder = any(keyword in normalized for keyword in ("文件夹", "子文件夹", "目录"))
            if wants_folder or (folder_target and not note_target):
                if folder_error:
                    return {"reply": folder_error}
                if not folder_target:
                    return {"reply": "请告诉我要删除哪个子文件夹。"}
                return {
                    "reply": f"我已打开删除文件夹“{folder_target['name']}”的确认窗口。",
                    "action": {"type": "confirm_delete_folder", "folder_id": folder_target["id"]},
                }

            if note_error:
                return {"reply": note_error}
            if not note_target:
                return {"reply": "请告诉我要删除哪篇笔记。"}
            return {
                "reply": f"我已打开删除笔记“{note_target['title']}”的确认窗口。",
                "action": {"type": "confirm_delete_note", "note_id": note_target["id"]},
            }

        if any(keyword in normalized for keyword in ("打开", "进入", "查看", "阅读", "切换", "跳到")):
            if any(keyword in normalized for keyword in ("文件夹", "子文件夹", "目录")):
                if folder_error:
                    return {"reply": folder_error}
                if not folder_target:
                    return {"reply": "请告诉我要进入哪个子文件夹。"}
                folder = NoteFolder.query.filter_by(id=folder_target["id"], user_id=current_user.id).first()
                if not folder:
                    return {"reply": "没有找到对应文件夹。"}
                return {
                    "reply": f"正在进入文件夹“{folder.name}”。",
                    "action": {"type": "navigate", "url": url_for("my_notes", folder_id=folder.id)},
                }

            if note_target and not folder_target:
                note = Note.query.filter_by(id=note_target["id"], user_id=current_user.id).first()
                if not note:
                    return {"reply": "没有找到对应笔记。"}
                return {
                    "reply": f"正在打开笔记“{note.title}”。",
                    "action": {"type": "navigate", "url": url_for("note_detail", note_id=note.id)},
                }

            if folder_target and not note_target:
                folder = NoteFolder.query.filter_by(id=folder_target["id"], user_id=current_user.id).first()
                if not folder:
                    return {"reply": "没有找到对应文件夹。"}
                return {
                    "reply": f"正在进入文件夹“{folder.name}”。",
                    "action": {"type": "navigate", "url": url_for("my_notes", folder_id=folder.id)},
                }

            if note_target and folder_target:
                if any(keyword in normalized for keyword in ("查看", "阅读", "详情", "笔记")):
                    note = Note.query.filter_by(id=note_target["id"], user_id=current_user.id).first()
                    if not note:
                        return {"reply": "没有找到对应笔记。"}
                    return {
                        "reply": f"正在打开笔记“{note.title}”。",
                        "action": {"type": "navigate", "url": url_for("note_detail", note_id=note.id)},
                    }
                folder = NoteFolder.query.filter_by(id=folder_target["id"], user_id=current_user.id).first()
                if not folder:
                    return {"reply": "没有找到对应文件夹。"}
                return {
                    "reply": f"正在进入文件夹“{folder.name}”。",
                    "action": {"type": "navigate", "url": url_for("my_notes", folder_id=folder.id)},
                }

            if note_error or folder_error:
                return {"reply": note_error or folder_error}

        if note_target:
            note = Note.query.filter_by(id=note_target["id"], user_id=current_user.id).first()
            if not note:
                return {"reply": "没有找到对应笔记。"}
            return {
                "reply": f"正在打开笔记“{note.title}”。",
                "action": {"type": "navigate", "url": url_for("note_detail", note_id=note.id)},
            }

        if folder_target:
            folder = NoteFolder.query.filter_by(id=folder_target["id"], user_id=current_user.id).first()
            if not folder:
                return {"reply": "没有找到对应文件夹。"}
            return {
                "reply": f"正在进入文件夹“{folder.name}”。",
                "action": {"type": "navigate", "url": url_for("my_notes", folder_id=folder.id)},
            }

        if note_error or folder_error:
            return {"reply": note_error or folder_error}

        return {
            "reply": (
                "我暂时没有听懂你的操作。你可以试试这样说："
                "打开第一篇笔记，进入一年级，返回上一级，重新播报当前页面，新建文件夹三年级，或把一年级改名为一年级上册。"
            )
        }

    def _get_safe_next_url() -> str:
        next_url = (request.values.get("next") or "").strip()
        if next_url.startswith("/") and not next_url.startswith("//"):
            return next_url
        return ""

    def _render_welcome(
        *,
        active_mode: str = "",
        focus_target: str = "",
        speech_text: str = "",
        speech_tone: str = "welcome",
        login_username: str = "",
        register_username: str = "",
        next_url: str | None = None,
    ):
        return render_template(
            "welcome.html",
            active_mode=active_mode if active_mode in {"login", "register"} else "",
            focus_target=focus_target,
            speech_text=speech_text,
            speech_tone=speech_tone,
            login_username=login_username,
            register_username=register_username,
            next_url=_get_safe_next_url() if next_url is None else next_url,
        )

    @app.route("/")
    def index():
        if not current_user.is_authenticated:
            return _render_welcome(
                speech_text="欢迎使用聆光一闪，按 1 登录，按 2 注册",
                speech_tone="welcome",
            )

        show_tutorial = bool(session.pop("show_tutorial_once", False))
        welcome_announcement = session.pop("index_welcome_announcement", "")
        return render_template(
            "index.html",
            show_tutorial=show_tutorial,
            welcome_announcement=welcome_announcement,
        )

    @app.route("/tutorial/demo/result")
    @login_required
    def tutorial_demo_result():
        summary_html, summary_toc_html = _render_summary_markdown(TUTORIAL_SAMPLE_SUMMARY)
        return render_template(
            "result.html",
            page_heading="教程示例文档",
            page_mode="current",
            summary=TUTORIAL_SAMPLE_SUMMARY,
            summary_html=summary_html,
            summary_toc_html=summary_toc_html,
            exercise=TUTORIAL_SAMPLE_EXERCISE,
            uploaded_filename=TUTORIAL_SAMPLE_FILENAME,
            challenge_url=url_for("tutorial_demo_challenge"),
            download_summary_url=url_for("tutorial_demo_download_summary"),
            show_upload_to_community=False,
            show_upload_new_file=True,
            tutorial_demo=True,
        )

    @app.route("/tutorial/demo/challenge")
    @login_required
    def tutorial_demo_challenge():
        return render_template(
            "exercise_quiz.html",
            page_heading="教程示例题目",
            quiz_data=TUTORIAL_SAMPLE_QUIZ,
            exercise_markdown=TUTORIAL_SAMPLE_EXERCISE,
            summary_text=TUTORIAL_SAMPLE_SUMMARY,
            uploaded_filename=TUTORIAL_SAMPLE_FILENAME,
            back_url=url_for("tutorial_demo_result"),
            return_url=url_for("tutorial_demo_actions"),
            tutorial_demo=True,
        )

    @app.route("/tutorial/demo/actions")
    @login_required
    def tutorial_demo_actions():
        folders = _load_user_folders()
        suggested_note_title = extract_title_from_summary(
            TUTORIAL_SAMPLE_SUMMARY,
            TUTORIAL_SAMPLE_FILENAME,
        )
        return render_template(
            "exercise_actions.html",
            page_heading="教程示例完成页",
            quiz_title=TUTORIAL_SAMPLE_QUIZ.get("title", "教程示例题目"),
            exercise_markdown=TUTORIAL_SAMPLE_EXERCISE,
            exercise_filename=DEFAULT_EXERCISE_FILENAME,
            summary_text=TUTORIAL_SAMPLE_SUMMARY,
            uploaded_filename=TUTORIAL_SAMPLE_FILENAME,
            folder_options=_build_folder_option_items(folders),
            suggested_note_title=suggested_note_title,
            tutorial_demo=True,
        )

    @app.route("/tutorial/demo/download-summary")
    @login_required
    def tutorial_demo_download_summary():
        return send_file(
            io.BytesIO(TUTORIAL_SAMPLE_SUMMARY.encode("utf-8")),
            mimetype="text/markdown; charset=utf-8",
            as_attachment=True,
            download_name="教程示例文档-总结.md",
        )

    @app.route("/learning-community")
    @app.route("/community")
    @login_required
    def learning_community():
        return render_template("learning_community.html")

    @app.route("/process", methods=["POST"])
    @login_required
    def process():
        file = request.files.get("file")
        if not file:
            flash("请选择文件")
            return redirect(url_for("index"))

        upload_error = _validate_upload_file(file)
        if upload_error:
            flash(upload_error)
            return redirect(url_for("index"))

        job_id = _start_processing_job(file, request.form.get("prompt", ""))
        return redirect(url_for("processing_page", job_id=job_id))

        summary, exercise, status, _, _, document_text = _save_and_process(
            file,
            request.form.get("prompt", ""),
            str(upload_dir),
        )
        if not summary:
            flash(status or "处理失败，请稍后重试")
            return redirect(url_for("index"))

        _save_ai_assistant_context(upload_dir, file.filename, document_text)

        summary_html, summary_toc_html = _render_summary_markdown(summary or "")

        return render_template(
            "result.html",
            page_heading="处理结果",
            page_mode="current",
            summary=summary or "",
            summary_html=summary_html,
            summary_toc_html=summary_toc_html,
            exercise=exercise or "",
            uploaded_filename=file.filename,
            challenge_url=url_for("exercise_challenge"),
            download_summary_url=url_for("download_summary"),
            show_upload_to_community=False,
            show_upload_new_file=True,
        )

    @app.route("/processing/<job_id>")
    @login_required
    def processing_page(job_id):
        job = _read_job_status(basedir, job_id)
        if not job:
            flash("处理任务不存在或已过期")
            return redirect(url_for("index"))

        return render_template(
            "processing.html",
            job_id=job_id,
            uploaded_filename=job.get("uploaded_filename", ""),
        )

    @app.route("/api/process-status/<job_id>")
    @login_required
    def process_status(job_id):
        job = _read_job_status(basedir, job_id)
        if not job:
            return jsonify({"success": False, "error": "任务不存在"}), 404
        return jsonify({"success": True, **job})

    @app.route("/process-result/<job_id>")
    @login_required
    def process_result(job_id):
        job = _read_job_status(basedir, job_id)
        if not job:
            flash("处理任务不存在或已过期")
            return redirect(url_for("index"))

        if job.get("status") == "processing":
            return redirect(url_for("processing_page", job_id=job_id))

        if job.get("status") == "failed":
            flash(job.get("error") or "处理失败")
            return redirect(url_for("index"))

        summary = job.get("summary", "")
        exercise = job.get("exercise", "")
        uploaded_filename = job.get("uploaded_filename", "")
        summary_html, summary_toc_html = _render_summary_markdown(summary)

        return render_template(
            "result.html",
            page_heading="处理结果",
            page_mode="current",
            summary=summary,
            summary_html=summary_html,
            summary_toc_html=summary_toc_html,
            exercise=exercise,
            uploaded_filename=uploaded_filename,
            challenge_url=url_for("exercise_challenge", source_file=uploaded_filename) if uploaded_filename else url_for("exercise_challenge"),
            download_summary_url=url_for("download_summary"),
            show_upload_to_community=False,
            show_upload_new_file=True,
        )

    @app.route("/result")
    @login_required
    def result_page():
        summary_text = _read_text_if_exists(DEFAULT_SUMMARY_FILENAME)
        exercise_text = _read_text_if_exists(DEFAULT_EXERCISE_FILENAME)
        assistant_context = _load_ai_assistant_context(upload_dir)
        if not summary_text:
            flash("请先生成文档总结")
            return redirect(url_for("index"))

        summary_html, summary_toc_html = _render_summary_markdown(summary_text)
        uploaded_filename = (request.args.get("source_file") or "").strip() or assistant_context.get("filename", "")

        return render_template(
            "result.html",
            page_heading="处理结果",
            page_mode="current",
            summary=summary_text,
            summary_html=summary_html,
            summary_toc_html=summary_toc_html,
            exercise=exercise_text,
            uploaded_filename=uploaded_filename,
            challenge_url=url_for("exercise_challenge", source_file=uploaded_filename) if uploaded_filename else url_for("exercise_challenge"),
            download_summary_url=url_for("download_summary"),
            show_upload_to_community=False,
            show_upload_new_file=True,
        )

    @app.route("/exercise/challenge")
    @login_required
    def exercise_challenge():
        summary_text, exercise_markdown, quiz_data = _require_exercises()
        if not exercise_markdown or not quiz_data:
            flash("请先生成总结和练习题")
            return redirect(url_for("index"))

        assistant_context = _load_ai_assistant_context(upload_dir)
        source_file = (request.args.get("source_file") or "").strip() or assistant_context.get("filename", "")
        return render_template(
            "exercise_quiz.html",
            page_heading="练习闯关",
            quiz_data=quiz_data,
            exercise_markdown=exercise_markdown,
            summary_text=summary_text or "",
            uploaded_filename=source_file,
            source_file=source_file,
            back_url=url_for("result_page", source_file=source_file) if source_file else url_for("result_page"),
            finish_url=url_for("exercise_actions", source_file=source_file) if source_file else url_for("exercise_actions"),
        )

    @app.route("/my-notes/<int:note_id>/challenge")
    @login_required
    def note_exercise_challenge(note_id: int):
        note = _get_user_note_or_404(note_id)
        if note is None:
            return redirect(url_for("my_notes"))

        try:
            exercise_markdown, quiz_data = _ensure_note_exercises(note)
        except Exception as exc:
            flash(str(exc))
            return redirect(url_for("note_detail", note_id=note.id))

        return render_template(
            "exercise_quiz.html",
            page_heading=note.title,
            quiz_data=quiz_data,
            exercise_markdown=exercise_markdown,
            summary_text=note.content or "",
            uploaded_filename=note.source_filename or note.title,
            back_url=url_for("note_detail", note_id=note.id),
            finish_url=url_for("note_detail", note_id=note.id),
        )

    @app.route("/exercise/actions")
    @login_required
    def exercise_actions():
        _, exercise_markdown, quiz_data = _require_exercises()
        if not exercise_markdown:
            flash("当前没有可操作的练习题")
            return redirect(url_for("index"))

        folders = _load_user_folders()
        assistant_context = _load_ai_assistant_context(upload_dir)
        summary_text = _read_text_if_exists(DEFAULT_SUMMARY_FILENAME)
        suggested_note_title = extract_title_from_summary(
            summary_text,
            assistant_context.get("filename", ""),
        )

        return render_template(
            "exercise_actions.html",
            quiz_title=(quiz_data or {}).get("title", "练习题"),
            exercise_markdown=exercise_markdown,
            exercise_filename=DEFAULT_EXERCISE_FILENAME,
            summary_text=summary_text,
            uploaded_filename=assistant_context.get("filename", ""),
            folder_options=_build_folder_option_items(folders),
            suggested_note_title=suggested_note_title,
        )

    @app.route("/api/exercise/regenerate", methods=["POST"])
    @login_required
    def api_regenerate_exercise():
        summary_path = Path(DEFAULT_SUMMARY_FILENAME)
        if not summary_path.exists():
            return jsonify({"success": False, "error": "请先生成总结内容"})

        try:
            payload, markdown_content = generate_valid_exercises(summary_path)
            return jsonify(
                {
                    "success": True,
                    "quiz_data": payload,
                    "exercise_markdown": markdown_content,
                }
            )
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)})

    @app.route("/api/notes/save-current", methods=["POST"])
    @login_required
    def api_save_current_note():
        data = request.get_json(silent=True) or request.form
        folder_id = _parse_folder_id(data.get("folder_id"))

        folder = None
        if folder_id is not None:
            folder = NoteFolder.query.filter_by(id=folder_id, user_id=current_user.id).first()
            if folder is None:
                return jsonify({"success": False, "error": "选择的文件夹不存在"})

        summary_text = _read_text_if_exists(DEFAULT_SUMMARY_FILENAME)
        if not summary_text:
            return jsonify({"success": False, "error": "当前没有可保存的总结内容"})

        exercise_markdown = _read_text_if_exists(DEFAULT_EXERCISE_FILENAME)
        quiz_payload = None
        try:
            quiz_payload = load_exercise_payload(DEFAULT_EXERCISE_JSON_FILENAME)
        except Exception:
            quiz_payload = None

        assistant_context = _load_ai_assistant_context(upload_dir)
        note = _create_note_record(
            summary_text=summary_text,
            exercise_markdown=exercise_markdown,
            quiz_payload=quiz_payload,
            source_filename=assistant_context.get("filename", ""),
            document_text=assistant_context.get("document_text", ""),
            folder=folder,
        )

        return jsonify(
            {
                "success": True,
                "title": note.title,
                "detail_url": url_for("note_detail", note_id=note.id),
                "message": "已添加到我的笔记",
            }
        )

    @app.route("/api/community/save-note", methods=["POST"])
    @login_required
    def api_save_community_note():
        data = request.get_json(silent=True) or request.form
        folder_id = _parse_folder_id(data.get("folder_id"))
        title = (data.get("title") or "").strip()
        raw_content = (data.get("content") or "").strip()
        source_filename = (data.get("source_filename") or title).strip()

        if not raw_content:
            return jsonify({"success": False, "error": "当前帖子没有可保存的内容"})

        folder = None
        if folder_id is not None:
            folder = NoteFolder.query.filter_by(id=folder_id, user_id=current_user.id).first()
            if folder is None:
                return jsonify({"success": False, "error": "选择的文件夹不存在"})

        summary_text, exercise_markdown = _split_community_post_content(title, raw_content)
        if not summary_text and not exercise_markdown:
            return jsonify({"success": False, "error": "当前帖子没有可保存的正文"})

        note = _create_named_note_record(
            title=title,
            summary_text=summary_text,
            exercise_markdown=exercise_markdown,
            quiz_payload=None,
            source_filename=source_filename,
            document_text=normalize_summary_for_exercises(summary_text or raw_content),
            folder=folder,
        )

        return jsonify(
            {
                "success": True,
                "title": note.title,
                "detail_url": url_for("note_detail", note_id=note.id),
                "message": "已保存到我的笔记",
            }
        )

    @app.route("/braille/summary", methods=["POST"])
    @login_required
    def braille_summary():
        braille, brf = _convert_to_braille(
            request.form.get("text", ""),
            os.path.join(basedir, "output.brf"),
        )
        return render_template("braille.html", braille=braille, brf=brf, type="summary")

    @app.route("/braille/exercise", methods=["POST"])
    @login_required
    def braille_exercise():
        braille, brf = _convert_to_braille(
            request.form.get("text", ""),
            os.path.join(basedir, "output.brf"),
        )
        return render_template("braille.html", braille=braille, brf=brf, type="exercise")

    @app.route("/my-notes/<int:note_id>/braille/exercise", methods=["POST"])
    @login_required
    def note_exercise_braille(note_id: int):
        note = _get_user_note_or_404(note_id)
        if note is None:
            return redirect(url_for("my_notes"))

        try:
            exercise_markdown, _ = _ensure_note_exercises(note)
        except Exception as exc:
            flash(str(exc))
            return redirect(url_for("note_detail", note_id=note.id))

        braille, brf = _convert_to_braille(
            exercise_markdown,
            os.path.join(basedir, "output.brf"),
        )
        return render_template("braille.html", braille=braille, brf=brf, type="exercise")

    @app.route("/download/<path:filename>")
    @login_required
    def download_file(filename):
        return send_file(os.path.join(basedir, filename), as_attachment=True)

    @app.route("/download/summary")
    @login_required
    def download_summary():
        summary_path = Path(DEFAULT_SUMMARY_FILENAME)
        if not summary_path.exists():
            flash("请先生成总结文档")
            return redirect(url_for("index"))

        return send_file(summary_path, as_attachment=True, download_name=summary_path.name)

    @app.route("/my-notes/<int:note_id>/download-summary")
    @login_required
    def download_note_summary(note_id: int):
        note = _get_user_note_or_404(note_id)
        if note is None:
            return redirect(url_for("my_notes"))

        filename = f"{note.title or '笔记总结'}.md"
        return send_file(
            io.BytesIO((note.content or "").encode("utf-8")),
            mimetype="text/markdown; charset=utf-8",
            as_attachment=True,
            download_name=filename,
        )

    @app.route("/register", methods=["GET", "POST"])
    def register():
        if current_user.is_authenticated:
            return redirect(url_for("index"))

        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""
            confirm_password = request.form.get("confirm_password") or ""

            if not username:
                message = "请输入账号"
                flash(message, "error")
                return _render_welcome(
                    active_mode="register",
                    focus_target="register-username",
                    speech_text=message,
                    speech_tone="error",
                    register_username=username,
                )

            if len(username) < 3 or len(username) > 20:
                message = "账号长度需要在 3 到 20 个字符之间"
                flash(message, "error")
                return _render_welcome(
                    active_mode="register",
                    focus_target="register-username",
                    speech_text=message,
                    speech_tone="error",
                    register_username=username,
                )

            if User.query.filter_by(username=username).first():
                message = "账号已存在，请重新输入"
                flash(message, "error")
                return _render_welcome(
                    active_mode="register",
                    focus_target="register-username",
                    speech_text=message,
                    speech_tone="error",
                    register_username=username,
                )

            if len(password) < 6:
                message = "密码至少需要 6 位"
                flash(message, "error")
                return _render_welcome(
                    active_mode="register",
                    focus_target="register-password",
                    speech_text=message,
                    speech_tone="error",
                    register_username=username,
                )

            if password != confirm_password:
                message = "两次输入的密码不一致，请重新输入"
                flash(message, "error")
                return _render_welcome(
                    active_mode="register",
                    focus_target="register-confirm-password",
                    speech_text=message,
                    speech_tone="error",
                    register_username=username,
                )

            db.session.add(
                User(
                    username=username,
                    password_hash=generate_password_hash(password),
                )
            )
            db.session.commit()
            session["pending_tutorial_username"] = username
            flash("注册成功，请登录", "success")
            return redirect(url_for("login"))

        return _render_welcome(
            active_mode="register",
            focus_target="register-username",
            speech_text="请输入账号",
            speech_tone="prompt",
        )

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if current_user.is_authenticated:
            return redirect(url_for("index"))

        next_url = _get_safe_next_url()
        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""

            if not username:
                message = "请输入账号"
                flash(message, "error")
                return _render_welcome(
                    active_mode="login",
                    focus_target="login-username",
                    speech_text=message,
                    speech_tone="error",
                    login_username=username,
                    next_url=next_url,
                )

            if not password:
                message = "请输入密码"
                flash(message, "error")
                return _render_welcome(
                    active_mode="login",
                    focus_target="login-password",
                    speech_text=message,
                    speech_tone="error",
                    login_username=username,
                    next_url=next_url,
                )

            user = User.query.filter_by(username=username).first()
            if user and check_password_hash(user.password_hash, password):
                login_user(user)
                session["index_welcome_announcement"] = "欢迎来到聆光一闪，按 F 打开新手教程，按 H 打开使用帮助，按 U 开始上传文档。"
                pending_username = session.pop("pending_tutorial_username", None)
                if pending_username == user.username and not user.has_seen_tutorial:
                    user.has_seen_tutorial = True
                    db.session.commit()
                    session["show_tutorial_once"] = True
                return redirect(next_url or url_for("index"))

            message = "用户名或密码错误"
            flash(message, "error")
            return _render_welcome(
                active_mode="login",
                focus_target="login-password",
                speech_text=message,
                speech_tone="error",
                login_username=username,
                next_url=next_url,
            )

        return _render_welcome(
            active_mode="login",
            focus_target="login-username",
            speech_text="请输入账号",
            speech_tone="prompt",
            next_url=next_url,
        )

    @app.route("/logout")
    @login_required
    def logout():
        logout_user()
        flash("您已退出登录")
        return redirect(url_for("login"))

    @app.route("/my-notes")
    @login_required
    def my_notes():
        folders = _load_user_folders()
        folder_lookup, children_map = _build_folder_tree(folders)
        folder_options = _build_folder_option_items(folders)
        all_notes = (
            Note.query.filter_by(user_id=current_user.id)
            .order_by(Note.created_at.desc(), Note.id.desc())
            .all()
        )

        requested_folder_key = (request.args.get("folder_id") or "root").strip()
        selected_folder_key = "root" if requested_folder_key in ("all", "uncategorized", "") else requested_folder_key
        selected_folder = None
        selected_folder_breadcrumbs = []

        if selected_folder_key == "root":
            visible_notes = [note for note in all_notes if note.folder_id is None]
        else:
            try:
                selected_folder_id = int(selected_folder_key)
            except ValueError:
                flash("文件夹不存在")
                return redirect(url_for("my_notes"))

            selected_folder = folder_lookup.get(selected_folder_id)
            if selected_folder is None:
                flash("文件夹不存在")
                return redirect(url_for("my_notes"))

            selected_folder_breadcrumbs = _build_folder_breadcrumbs(selected_folder)
            visible_notes = [note for note in all_notes if note.folder_id == selected_folder.id]

        current_folder_id = selected_folder.id if selected_folder else None
        current_folder_name = selected_folder.name if selected_folder else "主文件夹"
        child_folders = children_map.get(current_folder_id, [])
        note_folder_labels = {note.id: _folder_path_text(note.folder) for note in all_notes}
        expanded_folder_ids = {folder.id for folder in children_map.get(None, [])}
        for crumb in selected_folder_breadcrumbs:
            expanded_folder_ids.add(crumb.id)
        folder_descendant_ids = {
            folder.id: _collect_descendant_folder_ids(folder.id, children_map)[1:]
            for folder in folders
        }

        return render_template(
            "my_notes.html",
            notes=visible_notes,
            all_notes_count=len(all_notes),
            root_folders=children_map.get(None, []),
            children_map=children_map,
            child_folders=child_folders,
            expanded_folder_ids=expanded_folder_ids,
            selected_folder_key=selected_folder_key,
            selected_folder=selected_folder,
            selected_folder_breadcrumbs=selected_folder_breadcrumbs,
            folder_options=folder_options,
            folder_descendant_ids=folder_descendant_ids,
            note_folder_labels=note_folder_labels,
            current_folder_name=current_folder_name,
            parent_folder_id=selected_folder.parent_id if selected_folder else None,
            default_parent_folder_id=selected_folder.id if selected_folder else None,
            show_global_ai_assistant=False,
        )

    @app.route("/my-notes/<int:note_id>")
    @login_required
    def note_detail(note_id: int):
        note = _get_user_note_or_404(note_id)
        if note is None:
            return redirect(url_for("my_notes"))
        return _render_saved_note_page(note)

    @app.route("/api/notes/<int:note_id>/move", methods=["POST"])
    @login_required
    def move_note(note_id: int):
        note = _get_user_note_or_404(note_id)
        if note is None:
            return jsonify({"success": False, "error": "笔记不存在"}), 404

        data = request.get_json(silent=True) or {}
        raw_folder_id = data.get("folder_id")
        folder_id = _parse_folder_id(raw_folder_id)

        if raw_folder_id not in (None, "", "null") and folder_id is None:
            return jsonify({"success": False, "error": "目标文件夹无效"}), 400

        target_folder = None
        if folder_id is not None:
            target_folder = _get_user_folder_or_404(folder_id)
            if target_folder is None:
                return jsonify({"success": False, "error": "目标文件夹不存在"}), 404

        target_folder_id = target_folder.id if target_folder else None
        if note.folder_id == target_folder_id:
            return jsonify(
                {
                    "success": True,
                    "message": "笔记已经在该位置",
                    "folder_id": target_folder_id,
                    "folder_label": _folder_path_text(target_folder),
                }
            )

        note.folder = target_folder
        db.session.commit()

        return jsonify(
            {
                "success": True,
                "message": "笔记位置已更新",
                "folder_id": target_folder_id,
                "folder_label": _folder_path_text(target_folder),
            }
        )

    @app.route("/my-notes/<int:note_id>/delete", methods=["POST"])
    @login_required
    def delete_note(note_id: int):
        note = _get_user_note_or_404(note_id)
        if note is None:
            if request.is_json:
                return jsonify({"success": False, "error": "笔记不存在"}), 404
            return redirect(url_for("my_notes"))

        db.session.delete(note)
        db.session.commit()

        if request.is_json:
            return jsonify({"success": True, "message": "笔记已删除"})

        flash("笔记已删除")
        return redirect(url_for("my_notes"))

    @app.route("/note-folders/create", methods=["POST"])
    @login_required
    def create_note_folder():
        payload = request.get_json(silent=True) if request.is_json else request.form
        payload = payload or {}
        name = (payload.get("name") or "").strip()
        parent_id = _parse_folder_id(payload.get("parent_id"))

        if not name:
            if request.is_json:
                return _json_error("请输入文件夹名称")
            flash("请输入文件夹名称")
            return redirect(url_for("my_notes"))

        parent_folder = None
        if parent_id is not None:
            parent_folder = NoteFolder.query.filter_by(id=parent_id, user_id=current_user.id).first()
            if parent_folder is None:
                if request.is_json:
                    return _json_error("父文件夹不存在", 404)
                flash("父文件夹不存在")
                return redirect(url_for("my_notes"))

        duplicate = NoteFolder.query.filter_by(
            user_id=current_user.id,
            parent_id=parent_id,
            name=name,
        ).first()
        if duplicate:
            if request.is_json:
                return _json_error("同级目录下已存在同名文件夹", 409)
            flash("同级目录下已存在同名文件夹")
            return redirect(url_for("my_notes", folder_id=duplicate.id))

        folder = NoteFolder(
            name=name,
            parent_id=parent_folder.id if parent_folder else None,
            owner=current_user,
        )
        db.session.add(folder)
        db.session.commit()

        if request.is_json:
            return _json_success(
                "文件夹已创建",
                folder_id=folder.id,
                folder_name=folder.name,
                folder_url=url_for("my_notes", folder_id=folder.id),
            )

        flash("文件夹已创建")
        return redirect(url_for("my_notes", folder_id=folder.id))

    @app.route("/api/note-folders/<int:folder_id>/move", methods=["POST"])
    @login_required
    def move_note_folder(folder_id: int):
        folder = NoteFolder.query.filter_by(id=folder_id, user_id=current_user.id).first()
        if folder is None:
            return _json_error("文件夹不存在", 404)

        data = request.get_json(silent=True) or {}
        raw_parent_id = data.get("parent_id")
        parent_id = _parse_folder_id(raw_parent_id)

        if raw_parent_id not in (None, "", "null") and parent_id is None:
            return _json_error("目标位置无效")

        target_parent = None
        if parent_id is not None:
            target_parent = NoteFolder.query.filter_by(id=parent_id, user_id=current_user.id).first()
            if target_parent is None:
                return _json_error("目标文件夹不存在", 404)

        target_parent_id = target_parent.id if target_parent else None
        if folder.parent_id == target_parent_id:
            return _json_success(
                "文件夹已经在该位置",
                parent_id=target_parent_id,
                folder_path=_folder_path_text(folder),
            )

        folders = _load_user_folders()
        _, children_map = _build_folder_tree(folders)
        descendant_ids = set(_collect_descendant_folder_ids(folder.id, children_map))
        if target_parent_id in descendant_ids:
            return _json_error("不能把文件夹移动到它自己或其子文件夹中")

        duplicate = (
            NoteFolder.query.filter(
                NoteFolder.user_id == current_user.id,
                NoteFolder.parent_id == target_parent_id,
                NoteFolder.name == folder.name,
                NoteFolder.id != folder.id,
            ).first()
        )
        if duplicate:
            return _json_error("目标目录下已存在同名文件夹", 409)

        folder.parent = target_parent
        db.session.commit()

        return _json_success(
            "文件夹位置已更新",
            parent_id=target_parent_id,
            folder_path=_folder_path_text(folder),
            folder_url=url_for("my_notes", folder_id=folder.id),
        )

    @app.route("/api/note-folders/<int:folder_id>/rename", methods=["POST"])
    @login_required
    def rename_note_folder(folder_id: int):
        folder = NoteFolder.query.filter_by(id=folder_id, user_id=current_user.id).first()
        if folder is None:
            return _json_error("文件夹不存在", 404)

        data = request.get_json(silent=True) or {}
        new_name = (data.get("name") or "").strip()

        if not new_name:
            return _json_error("请输入新的文件夹名称")

        if folder.name == new_name:
            return _json_success(
                "文件夹名称未变化",
                folder_id=folder.id,
                folder_name=folder.name,
                folder_url=url_for("my_notes", folder_id=folder.id),
            )

        duplicate = (
            NoteFolder.query.filter(
                NoteFolder.user_id == current_user.id,
                NoteFolder.parent_id == folder.parent_id,
                NoteFolder.name == new_name,
                NoteFolder.id != folder.id,
            ).first()
        )
        if duplicate:
            return _json_error("同级目录下已存在同名文件夹", 409)

        folder.name = new_name
        db.session.commit()

        return _json_success(
            "文件夹已重命名",
            folder_id=folder.id,
            folder_name=folder.name,
            folder_path=_folder_path_text(folder),
            folder_url=url_for("my_notes", folder_id=folder.id),
        )

    @app.route("/api/note-folders/<int:folder_id>/delete", methods=["POST"])
    @login_required
    def delete_note_folder(folder_id: int):
        folder = NoteFolder.query.filter_by(id=folder_id, user_id=current_user.id).first()
        if folder is None:
            return _json_error("文件夹不存在", 404)

        parent_id = folder.parent_id
        folders = _load_user_folders()
        _, children_map = _build_folder_tree(folders)
        folder_ids = _collect_descendant_folder_ids(folder.id, children_map)

        note_query = Note.query.filter(
            Note.user_id == current_user.id,
            Note.folder_id.in_(folder_ids),
        )
        deleted_note_count = note_query.count()
        note_query.delete(synchronize_session=False)

        folder_records = (
            NoteFolder.query.filter(
                NoteFolder.user_id == current_user.id,
                NoteFolder.id.in_(folder_ids),
            ).all()
        )
        folder_lookup = {item.id: item for item in folder_records}
        for current_id in reversed(folder_ids):
            current = folder_lookup.get(current_id)
            if current is not None:
                db.session.delete(current)

        db.session.commit()

        redirect_url = url_for("my_notes", folder_id=parent_id) if parent_id else url_for("my_notes")
        return _json_success(
            "文件夹已删除",
            redirect_url=redirect_url,
            deleted_folder_count=len(folder_ids),
            deleted_note_count=deleted_note_count,
        )

    @app.route("/mistakes")
    @login_required
    def mistake_notebook():
        initial_source_file = (request.args.get("source_file") or "").strip()
        initial_mistake_id = request.args.get("mistake_id", type=int)
        mistake_records = (
            MistakeRecord.query.filter_by(user_id=current_user.id)
            .order_by(MistakeRecord.last_wrong_at.desc(), MistakeRecord.id.desc())
            .all()
        )

        mistake_groups: list[dict] = []
        group_index_by_name: dict[str, int] = {}
        for record in mistake_records:
            source_name = _normalize_source_filename(record.source_filename)
            options = _load_mistake_options(record)

            if source_name not in group_index_by_name:
                group_index_by_name[source_name] = len(mistake_groups)
                mistake_groups.append(
                    {
                        "source_file": source_name,
                        "mistakes": [],
                    }
                )

            mistake_groups[group_index_by_name[source_name]]["mistakes"].append(
                {
                    "id": record.id,
                    "difficulty": record.difficulty or "",
                    "question_text": record.question_text,
                    "options": options,
                    "correct_answer": record.correct_answer,
                    "explanation": _normalize_multiline_text(record.explanation, ""),
                    "last_selected_answer": record.last_selected_answer or "",
                    "wrong_count": record.wrong_count,
                    "first_wrong_at": record.first_wrong_at.strftime("%Y-%m-%d %H:%M") if record.first_wrong_at else "",
                    "last_wrong_at": record.last_wrong_at.strftime("%Y-%m-%d %H:%M") if record.last_wrong_at else "",
                    "redo_url": url_for("redo_mistake", mistake_id=record.id),
                }
            )

        return render_template(
            "mistake_notebook.html",
            mistake_groups=mistake_groups,
            initial_source_file=initial_source_file,
            initial_mistake_id=initial_mistake_id,
        )

    @app.route("/mistakes/<int:mistake_id>/redo")
    @login_required
    def redo_mistake(mistake_id):
        record = MistakeRecord.query.filter_by(id=mistake_id, user_id=current_user.id).first()
        if not record:
            flash("指定的错题不存在")
            return redirect(url_for("mistake_notebook"))

        source_name = _normalize_source_filename(record.source_filename)
        related_records = (
            MistakeRecord.query.filter_by(user_id=current_user.id)
            .order_by(MistakeRecord.last_wrong_at.desc(), MistakeRecord.id.desc())
            .all()
        )
        group_records = [
            item for item in related_records
            if _normalize_source_filename(item.source_filename) == source_name
        ]
        if not group_records:
            group_records = [record]

        difficulty_name = "错题重做"
        quiz_data = {
            "title": f"{source_name}错题重做",
            "difficulties": {
                difficulty_name: [_build_mistake_payload(item) for item in group_records]
            },
        }
        initial_question_index = next(
            (
                index for index, item in enumerate(group_records)
                if int(item.id) == int(record.id)
            ),
            0,
        )

        back_url = url_for(
            "mistake_notebook",
            source_file=source_name,
            mistake_id=record.id,
        )
        exercise_markdown = (
            f"## 错题重做\n\n"
            f"来自《{source_name}》的错题共 {len(group_records)} 道，这次会从第 {initial_question_index + 1} 题开始依次重做。\n"
        )

        return render_template(
            "exercise_quiz.html",
            page_heading="错题重做",
            quiz_data=quiz_data,
            exercise_markdown=exercise_markdown,
            uploaded_filename=source_name,
            source_file=source_name,
            back_url=back_url,
            finish_url=back_url,
            auto_start_difficulty=difficulty_name,
            auto_start_question_index=initial_question_index,
            is_mistake_redo=True,
        )

    @app.route("/api/mistakes", methods=["POST"])
    @login_required
    def api_add_mistake():
        payload = request.get_json() or {}

        question_text = (payload.get("question_text") or "").strip()
        correct_answer = (payload.get("correct_answer") or "").strip()
        if not question_text or not correct_answer:
            return jsonify({"success": False, "error": "错题内容不完整"})

        source_filename = _normalize_source_filename(payload.get("source_filename"))

        difficulty = (payload.get("difficulty") or "").strip()
        explanation = _normalize_multiline_text(payload.get("explanation"), "")
        last_selected_answer = (payload.get("selected_answer") or "").strip()
        options = payload.get("options")
        if not isinstance(options, list):
            options = []

        record = MistakeRecord.query.filter_by(
            user_id=current_user.id,
            source_filename=source_filename,
            question_text=question_text,
            correct_answer=correct_answer,
        ).first()

        if record:
            record.difficulty = difficulty or record.difficulty
            record.options_json = json.dumps(options, ensure_ascii=False)
            record.explanation = explanation or record.explanation
            record.last_selected_answer = last_selected_answer
            record.wrong_count = int(record.wrong_count or 0) + 1
            record.last_wrong_at = datetime.utcnow()
        else:
            record = MistakeRecord(
                source_filename=source_filename,
                difficulty=difficulty,
                question_text=question_text,
                options_json=json.dumps(options, ensure_ascii=False),
                correct_answer=correct_answer,
                explanation=explanation,
                last_selected_answer=last_selected_answer,
                wrong_count=1,
                user_id=current_user.id,
            )
            db.session.add(record)

        db.session.commit()
        return jsonify({"success": True, "wrong_count": record.wrong_count})

    @app.route("/api/process", methods=["POST"])
    @login_required
    def api_process():
        file = request.files.get("file")
        if not file:
            return jsonify({"success": False, "error": "未上传文件"})

        upload_error = _validate_upload_file(file)
        if upload_error:
            return jsonify({"success": False, "error": upload_error})

        summary, exercise, status, _, _, document_text = _save_and_process(
            file,
            request.form.get("prompt", ""),
            str(upload_dir),
        )
        if summary:
            display_filename = getattr(file, "_display_filename", "") or file.filename
            _save_ai_assistant_context(upload_dir, display_filename, document_text)
            summary_html, summary_toc_html = _render_summary_markdown(summary)
            return jsonify(
                {
                    "success": True,
                    "summary": summary,
                    "summary_html": summary_html,
                    "summary_toc_html": summary_toc_html,
                    "exercise": exercise or "",
                    "status": status,
                }
            )

        return jsonify({"success": False, "error": status})

    @app.route("/api/my-notes-assistant", methods=["POST"])
    @login_required
    def api_my_notes_assistant():
        data = request.get_json() or {}
        message = (data.get("message") or "").strip()
        if not message:
            return jsonify({"success": False, "error": "请输入操作内容"})

        page_context = data.get("page_context") or {}
        response = _build_my_notes_assistant_response(message, page_context)
        return jsonify(
            {
                "success": True,
                "reply": response.get("reply", ""),
                "action": response.get("action"),
            }
        )

    @app.route("/api/convert_braille", methods=["POST"])
    @login_required
    def api_convert_braille():
        content = (request.get_json() or {}).get("content", "")
        if not content:
            return jsonify({"success": False, "error": "没有内容"})

        try:
            result = get_braille_converter().convert_to_braille(content)
            brf_filename = f"braille_{current_user.id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.brf"
            brf_path = os.path.join(basedir, brf_filename)
            generate_brf_file(result["brf_content"], brf_path)
            return jsonify(
                {
                    "success": True,
                    "unicode_braille": result["unicode"],
                    "brf_url": url_for("download_file", filename=brf_filename),
                }
            )
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)})

    @app.route("/api/ai-chat", methods=["POST"])
    @login_required
    def api_ai_chat():
        data = request.get_json() or {}
        message = (data.get("message") or "").strip()
        if not message:
            return jsonify({"success": False, "error": "请输入问题"})

        history = data.get("history") or []
        page_context = data.get("page_context") or {}

        system_content = ai_chat_system_prompt + _build_ai_chat_context(page_context)

        messages = [{"role": "system", "content": system_content}]
        for item in history[-10:]:
            role = item.get("role")
            content = (item.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message})

        try:
            response = ai_client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
            )
            reply = response.choices[0].message.content or ""
            return jsonify({"success": True, "reply": reply})
        except Exception as exc:
            return jsonify({"success": False, "error": f"AI 请求失败：{exc}"})
