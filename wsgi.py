"""WSGI entrypoint for production servers."""

from flask_app import app, initialize_database


initialize_database()

