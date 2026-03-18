"""Flask application entrypoint."""

from __future__ import annotations

import os
import sys
from datetime import datetime

from dotenv import load_dotenv
from flask import Flask
from flask_login import LoginManager, UserMixin
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text

from utils.note_utils import build_unique_title, extract_title_from_summary


load_dotenv()


if getattr(sys, "frozen", False):
    basedir = os.path.dirname(sys.executable)
else:
    basedir = os.path.abspath(os.path.dirname(__file__))


app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-this-in-production")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(basedir, "notes.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["BASEDIR"] = basedir

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"
login_manager.login_message = "请先登录"


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    has_seen_tutorial = db.Column(db.Boolean, default=False)
    notes = db.relationship("Note", backref="author", lazy=True, cascade="all, delete-orphan")
    folders = db.relationship("NoteFolder", backref="owner", lazy=True, cascade="all, delete-orphan")
    mistakes = db.relationship("MistakeRecord", backref="author", lazy=True, cascade="all, delete-orphan")


class NoteFolder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("note_folder.id"), nullable=True)
    parent = db.relationship(
        "NoteFolder",
        remote_side=[id],
        backref=db.backref("children", lazy=True),
    )
    notes = db.relationship("Note", backref="folder", lazy=True)


class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200))
    content = db.Column(db.Text)
    exercise_content = db.Column(db.Text)
    exercise_payload = db.Column(db.Text)
    document_text = db.Column(db.Text)
    source_filename = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    folder_id = db.Column(db.Integer, db.ForeignKey("note_folder.id"), nullable=True)


class MistakeRecord(db.Model):
    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "source_filename",
            "question_text",
            "correct_answer",
            name="uq_user_mistake_record",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    source_filename = db.Column(db.String(255), nullable=False, default="当前练习")
    difficulty = db.Column(db.String(50))
    question_text = db.Column(db.Text, nullable=False)
    options_json = db.Column(db.Text, nullable=False, default="[]")
    correct_answer = db.Column(db.String(20), nullable=False)
    explanation = db.Column(db.Text)
    last_selected_answer = db.Column(db.String(20))
    wrong_count = db.Column(db.Integer, nullable=False, default=1)
    first_wrong_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_wrong_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)


@login_manager.user_loader
def load_user(user_id: str):
    return db.session.get(User, int(user_id))


def ensure_database_schema() -> None:
    """Keep the SQLite schema compatible with newly added note features."""
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())

    if "note_folder" not in table_names:
        NoteFolder.__table__.create(bind=db.engine, checkfirst=True)

    if "note" not in table_names:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("note")}
    pending_statements = []

    column_definitions = {
        "exercise_content": "ALTER TABLE note ADD COLUMN exercise_content TEXT",
        "exercise_payload": "ALTER TABLE note ADD COLUMN exercise_payload TEXT",
        "document_text": "ALTER TABLE note ADD COLUMN document_text TEXT",
        "source_filename": "ALTER TABLE note ADD COLUMN source_filename VARCHAR(255)",
        "folder_id": "ALTER TABLE note ADD COLUMN folder_id INTEGER",
    }

    for column_name, statement in column_definitions.items():
        if column_name not in existing_columns:
            pending_statements.append(statement)

    if pending_statements:
        with db.engine.begin() as connection:
            for statement in pending_statements:
                connection.execute(text(statement))

    _backfill_note_metadata()


def _backfill_note_metadata() -> None:
    """Preserve original filenames and rename old notes with AI-generated H1 titles."""
    changed = False

    for user in User.query.order_by(User.id.asc()).all():
        seen_titles: set[str] = set()
        notes = (
            Note.query.filter_by(user_id=user.id)
            .order_by(Note.created_at.asc(), Note.id.asc())
            .all()
        )

        for note in notes:
            if not note.source_filename and note.title:
                note.source_filename = note.title
                changed = True

            base_title = extract_title_from_summary(
                note.content or "",
                note.source_filename or note.title or "",
            )
            unique_title = build_unique_title(base_title, seen_titles)

            if note.title != unique_title:
                note.title = unique_title
                changed = True

            seen_titles.add(unique_title)

    if changed:
        db.session.commit()


from routes import register_routes

register_routes(app, db, User, Note, NoteFolder, MistakeRecord)


def initialize_database() -> None:
    with app.app_context():
        db.create_all()
        ensure_database_schema()


def run_app() -> None:
    initialize_database()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "7860"))
    debug = os.environ.get("FLASK_DEBUG", "").lower() in {"1", "true", "yes", "on"}
    app.run(debug=debug, host=host, port=port)


if __name__ == "__main__":
    run_app()
