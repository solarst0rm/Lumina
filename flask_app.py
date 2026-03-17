"""视障学生学习辅助工具 - Flask 应用入口"""
import os
import sys
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin

# ---------- 路径 ----------
if getattr(sys, 'frozen', False):
    basedir = os.path.dirname(sys.executable)
else:
    basedir = os.path.abspath(os.path.dirname(__file__))

# ---------- Flask 初始化 ----------
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'change-this-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'notes.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['BASEDIR'] = basedir

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = '请先登录'

# ---------- 数据模型 ----------
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    has_seen_tutorial = db.Column(db.Boolean, default=False)
    notes = db.relationship('Note', backref='author', lazy=True)
    mistakes = db.relationship('MistakeRecord', backref='author', lazy=True)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200))
    content = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)


class MistakeRecord(db.Model):
    __table_args__ = (
        db.UniqueConstraint(
            'user_id',
            'source_filename',
            'question_text',
            'correct_answer',
            name='uq_user_mistake_record',
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    source_filename = db.Column(db.String(255), nullable=False, default='当前练习')
    difficulty = db.Column(db.String(50))
    question_text = db.Column(db.Text, nullable=False)
    options_json = db.Column(db.Text, nullable=False, default='[]')
    correct_answer = db.Column(db.String(20), nullable=False)
    explanation = db.Column(db.Text)
    last_selected_answer = db.Column(db.String(20))
    wrong_count = db.Column(db.Integer, nullable=False, default=1)
    first_wrong_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_wrong_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

# ---------- 注册路由 ----------
from routes import register_routes
register_routes(app, db, User, Note, MistakeRecord)

# ---------- 启动 ----------
def initialize_database():
    with app.app_context():
        db.create_all()


def run_app():
    initialize_database()
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', '7860'))
    debug = os.environ.get('FLASK_DEBUG', '').lower() in {'1', 'true', 'yes', 'on'}
    app.run(debug=debug, host=host, port=port)


if __name__ == '__main__':
    run_app()
