"""Flask route registration."""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path

from flask import flash, jsonify, redirect, render_template, request, send_file, url_for
from flask_login import current_user, login_required, login_user, logout_user
from openai import OpenAI
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from core.config import (
    API_KEY,
    BASE_URL,
    DEFAULT_EXERCISE_FILENAME,
    DEFAULT_EXERCISE_JSON_FILENAME,
    DEFAULT_SUMMARY_FILENAME,
    MODEL_NAME,
)
from core.processor import process_uploaded_file
from utils.exercise_generator import generate_valid_exercises, load_exercise_payload
from utils.render_utils import markdown_to_html_fragments


_braille_converter = None


def get_braille_converter():
    global _braille_converter
    if _braille_converter is None:
        from utils.braille_converter import BrailleConverter
        _braille_converter = BrailleConverter()
    return _braille_converter


def _read_text_if_exists(path: str | Path) -> str:
    file_path = Path(path)
    if not file_path.exists():
        return ""
    return file_path.read_text(encoding="utf-8")


def _save_and_process(file, prompt, upload_dir):
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    file.save(file_path)
    return _process_document(file_path, prompt)


def _process_document(file_path, user_prompt):
    if not file_path or not os.path.exists(file_path):
        return None, None, "未找到文件", None, None

    try:
        result = process_uploaded_file(file_path, user_prompt or "")
        if result.get("success"):
            summary = result.get("summary", "")
            exercise = result.get("exercise", "") or _read_text_if_exists(DEFAULT_EXERCISE_FILENAME)
            summary_file = DEFAULT_SUMMARY_FILENAME if Path(DEFAULT_SUMMARY_FILENAME).exists() else None
            exercise_file = DEFAULT_EXERCISE_FILENAME if Path(DEFAULT_EXERCISE_FILENAME).exists() else None
            return summary, exercise, "处理完成", summary_file, exercise_file

        return None, None, f"处理失败：{result.get('error', '未知错误')}", None, None
    except Exception as exc:
        return None, None, f"处理失败：{exc}", None, None


def _convert_to_braille(text, brf_path):
    if not text or not text.strip():
        return "请先生成内容", None

    try:
        from utils.braille_converter import generate_brf_file
        result = get_braille_converter().convert_to_braille(text)
        generate_brf_file(result["brf_content"], brf_path)
        return result["unicode"], os.path.basename(brf_path)
    except Exception as exc:
        return f"转换失败：{exc}", None


def _render_summary_markdown(summary_text: str) -> tuple[str, str]:
    if not summary_text or not summary_text.strip():
        return "", ""
    return markdown_to_html_fragments(summary_text, is_exercise=False)


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


def register_routes(app, db, User, Note):
    basedir = app.config["BASEDIR"]

    def _start_processing_job(file_storage, prompt: str, user_id: int) -> str:
        filename = secure_filename(file_storage.filename or "upload.bin") or "upload.bin"
        job_id = uuid.uuid4().hex
        upload_dir = Path(basedir) / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / f"{job_id}_{filename}"
        file_storage.save(file_path)

        _write_job_status(
            basedir,
            job_id,
            {
                "job_id": job_id,
                "status": "processing",
                "uploaded_filename": filename,
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
                    with app.app_context():
                        user = db.session.get(User, int(user_id))
                        if user and summary:
                            db.session.add(Note(title=filename, content=summary, author=user))
                            db.session.commit()

                    _write_job_status(
                        basedir,
                        job_id,
                        {
                            "job_id": job_id,
                            "status": "completed",
                            "uploaded_filename": filename,
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
                        "uploaded_filename": filename,
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
                        "uploaded_filename": filename,
                        "summary": "",
                        "exercise": "",
                        "error": str(exc),
                        "updated_at": datetime.utcnow().isoformat(),
                    },
                )

        threading.Thread(target=worker, daemon=True).start()
        return job_id

    def _require_exercises():
        summary_text = _read_text_if_exists(DEFAULT_SUMMARY_FILENAME)
        exercise_markdown = _read_text_if_exists(DEFAULT_EXERCISE_FILENAME)
        if not summary_text or not exercise_markdown:
            return None, None, None

        try:
            payload = load_exercise_payload(DEFAULT_EXERCISE_JSON_FILENAME)
        except Exception:
            return summary_text, exercise_markdown, None

        return summary_text, exercise_markdown, payload

    @app.route("/")
    @login_required
    def index():
        return render_template("index.html")

    @app.route("/process", methods=["POST"])
    @login_required
    def process():
        file = request.files.get("file")
        if not file:
            flash("请选择文件")
            return redirect(url_for("index"))

        job_id = _start_processing_job(file, request.form.get("prompt", ""), current_user.id)
        return redirect(url_for("processing_page", job_id=job_id))

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
        summary_html, summary_toc_html = _render_summary_markdown(summary)

        return render_template(
            "result.html",
            summary=summary,
            summary_html=summary_html,
            summary_toc_html=summary_toc_html,
            exercise=exercise,
            status="处理完成",
            sum_file=DEFAULT_SUMMARY_FILENAME if Path(DEFAULT_SUMMARY_FILENAME).exists() else None,
            ex_file=DEFAULT_EXERCISE_FILENAME if Path(DEFAULT_EXERCISE_FILENAME).exists() else None,
            uploaded_filename=job.get("uploaded_filename", ""),
        )

    @app.route("/result")
    @login_required
    def result_page():
        summary_text = _read_text_if_exists(DEFAULT_SUMMARY_FILENAME)
        exercise_text = _read_text_if_exists(DEFAULT_EXERCISE_FILENAME)
        if not summary_text:
            flash("请先生成总结")
            return redirect(url_for("index"))

        summary_html, summary_toc_html = _render_summary_markdown(summary_text)

        return render_template(
            "result.html",
            summary=summary_text,
            summary_html=summary_html,
            summary_toc_html=summary_toc_html,
            exercise=exercise_text,
            status="已加载当前结果",
            sum_file=DEFAULT_SUMMARY_FILENAME if Path(DEFAULT_SUMMARY_FILENAME).exists() else None,
            ex_file=DEFAULT_EXERCISE_FILENAME if Path(DEFAULT_EXERCISE_FILENAME).exists() else None,
            uploaded_filename="",
        )

    @app.route("/exercise/challenge")
    @login_required
    def exercise_challenge():
        _, exercise_markdown, quiz_data = _require_exercises()
        if not exercise_markdown or not quiz_data:
            flash("请先生成总结和练习题")
            return redirect(url_for("index"))

        return render_template(
            "exercise_quiz.html",
            quiz_data=quiz_data,
            exercise_markdown=exercise_markdown,
        )

    @app.route("/exercise/actions")
    @login_required
    def exercise_actions():
        _, exercise_markdown, quiz_data = _require_exercises()
        if not exercise_markdown:
            flash("当前没有可用的练习内容")
            return redirect(url_for("index"))

        return render_template(
            "exercise_actions.html",
            exercise_markdown=exercise_markdown,
            quiz_title=(quiz_data or {}).get("title", "练习闯关"),
            exercise_filename=DEFAULT_EXERCISE_FILENAME,
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

    @app.route("/register", methods=["GET", "POST"])
    def register():
        if request.method == "POST":
            username = request.form["username"]
            if User.query.filter_by(username=username).first():
                flash("用户名已存在")
                return redirect(url_for("register"))

            db.session.add(
                User(
                    username=username,
                    password_hash=generate_password_hash(request.form["password"]),
                )
            )
            db.session.commit()
            flash("注册成功，请登录")
            return redirect(url_for("login"))

        return render_template("register.html")

    @app.route("/login", methods=["GET", "POST"])
    def login():
        speak_login_error = False
        if request.method == "POST":
            user = User.query.filter_by(username=request.form["username"]).first()
            if user and check_password_hash(user.password_hash, request.form["password"]):
                login_user(user)
                return redirect(url_for("index"))
            speak_login_error = True
            flash("用户名或密码错误")

        return render_template("login.html", speak_login_error=speak_login_error)

    @app.route("/logout")
    @login_required
    def logout():
        logout_user()
        flash("已退出登录")
        return redirect(url_for("login"))

    @app.route("/my-notes")
    @login_required
    def my_notes():
        notes = (
            Note.query.filter_by(user_id=current_user.id)
            .order_by(Note.created_at.desc())
            .all()
        )
        return render_template("my_notes.html", notes=notes)

    @app.route("/api/process", methods=["POST"])
    @login_required
    def api_process():
        file = request.files.get("file")
        if not file:
            return jsonify({"success": False, "error": "未上传文件"})

        summary, exercise, status, _, _ = _save_and_process(
            file,
            request.form.get("prompt", ""),
            os.path.join(basedir, "uploads"),
        )
        if summary:
            db.session.add(Note(title=file.filename, content=summary, author=current_user))
            db.session.commit()
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

    @app.route("/api/convert_braille", methods=["POST"])
    @login_required
    def api_convert_braille():
        content = (request.get_json() or {}).get("content", "")
        if not content:
            return jsonify({"success": False, "error": "没有可转换内容"})

        try:
            from utils.braille_converter import generate_brf_file
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

    ai_client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

    ai_chat_system_prompt = (
        "你是面向视障学生的内置学习助手。"
        "你的回答会被语音播报，所以请使用简洁、自然、耐心的中文。"
        "不要使用 Markdown、公式或过多符号。"
        "如果不知道答案，请直接说明。"
    )

    ai_chat_doc_prompt = (
        "\n\n以下是用户当前的学习材料，请优先基于这些内容回答：\n"
        "【总结】\n{summary}\n\n"
        "【练习题】\n{exercise}"
    )

    @app.route("/api/ai-chat", methods=["POST"])
    @login_required
    def api_ai_chat():
        data = request.get_json() or {}
        message = (data.get("message") or "").strip()
        if not message:
            return jsonify({"success": False, "error": "请输入问题"})

        history = data.get("history") or []
        doc_summary = (data.get("doc_summary") or "").strip()
        doc_exercise = (data.get("doc_exercise") or "").strip()

        system_content = ai_chat_system_prompt
        if doc_summary or doc_exercise:
            system_content += ai_chat_doc_prompt.format(
                summary=doc_summary or "无",
                exercise=doc_exercise or "无",
            )

        messages = [{"role": "system", "content": system_content}]
        for item in history:
            role = item.get("role")
            content = item.get("content")
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
