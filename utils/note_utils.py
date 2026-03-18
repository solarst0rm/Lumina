"""Utilities for note titles, folder labels, and summary normalization."""

from __future__ import annotations

import re
from pathlib import Path


TITLE_PATTERN = re.compile(r"^#\s+(.+?)\s*$")


def _clean_title(raw_title: str) -> str:
    title = (raw_title or "").strip()
    title = re.sub(r"[*_`~#>\[\]\(\)]", "", title)
    title = re.sub(r"\s+", " ", title)
    return title.strip(" -_.")[:120].strip()


def extract_title_from_summary(summary_text: str, fallback: str = "") -> str:
    """Use the first Markdown H1 as the note title."""
    for line in (summary_text or "").splitlines():
        match = TITLE_PATTERN.match(line.strip())
        if not match:
            continue
        candidate = _clean_title(match.group(1))
        if candidate:
            return candidate

    fallback_name = Path(fallback).stem if fallback else "未命名笔记"
    return _clean_title(fallback_name) or "未命名笔记"


def build_unique_title(base_title: str, existing_titles: list[str] | set[str] | tuple[str, ...]) -> str:
    """Append a Chinese serial suffix when a note title already exists."""
    existing = {str(title).strip() for title in existing_titles if str(title).strip()}
    normalized_base = _clean_title(base_title) or "未命名笔记"
    if normalized_base not in existing:
        return normalized_base

    index = 2
    while True:
        candidate = f"{normalized_base}（{index}）"
        if candidate not in existing:
            return candidate
        index += 1


def normalize_summary_for_exercises(summary_text: str) -> str:
    """Strip headings so the exercise prompt stays compact."""
    text = re.sub(r"^#{1,4}\s*", "", summary_text or "", flags=re.MULTILINE)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()
