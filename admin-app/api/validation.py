"""Validation mirrored from Firestore and Storage rules for Admin SDK writes."""

from __future__ import annotations

import mimetypes
import re
from pathlib import Path
from typing import Any

from .constants import POSITION_IDS

EMAIL_RE = re.compile(r"^[a-z0-9._-]+\.scc@gmail\.com$")
STUDENT_NO_RE = re.compile(r"^[0-9]{7,9}$")
MAX_IMAGE_BYTES = 2 * 1024 * 1024


class ValidationError(ValueError):
    """Raised when an Admin SDK write would violate the app contract."""


def require_non_empty(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValidationError(f"{field} is required.")
    return text


def validate_email(email: str) -> str:
    email = require_non_empty(email, "email").lower()
    if not EMAIL_RE.fullmatch(email):
        raise ValidationError("Email must match <name>.scc@gmail.com.")
    return email


def validate_student_no(student_no: str) -> str:
    student_no = require_non_empty(student_no, "studentNo")
    if not STUDENT_NO_RE.fullmatch(student_no):
        raise ValidationError("Student ID must be 7-9 digits.")
    return student_no


def validate_year_level(year_level: Any) -> int:
    try:
        value = int(year_level)
    except (TypeError, ValueError) as exc:
        raise ValidationError("yearLevel must be 1, 2, 3, or 4.") from exc

    if value not in (1, 2, 3, 4):
        raise ValidationError("yearLevel must be 1, 2, 3, or 4.")
    return value


def validate_candidate_payload(data: dict[str, Any]) -> dict[str, Any]:
    position_id = require_non_empty(data.get("positionId"), "positionId")
    if position_id not in POSITION_IDS:
        raise ValidationError("positionId must be one of the seeded 20 positions.")

    try:
        order = int(data.get("order", 1))
    except (TypeError, ValueError) as exc:
        raise ValidationError("order must be a positive integer.") from exc
    if order < 1:
        raise ValidationError("order must be a positive integer.")

    return {
        "positionId": position_id,
        "name": require_non_empty(data.get("name"), "name"),
        "section": require_non_empty(data.get("section"), "section"),
        "yearLevel": validate_year_level(data.get("yearLevel")),
        "platform": require_non_empty(data.get("platform"), "platform"),
        "party": (str(data.get("party") or "").strip() or None),
        "order": order,
        "active": bool(data.get("active", True)),
    }


def validate_voter_payload(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "studentNo": validate_student_no(data.get("studentNo")),
        "fullName": require_non_empty(data.get("fullName"), "fullName"),
        "email": validate_email(data.get("email")),
        "yearLevel": validate_year_level(data.get("yearLevel")),
        "section": require_non_empty(data.get("section"), "section"),
        "eligible": bool(data.get("eligible", True)),
    }


def validate_image_file(path: str | Path) -> tuple[Path, str]:
    image_path = Path(path)
    if not image_path.exists() or not image_path.is_file():
        raise ValidationError("Image file was not found.")

    if image_path.stat().st_size > MAX_IMAGE_BYTES:
        raise ValidationError("Image must be 2MB or smaller.")

    content_type = mimetypes.guess_type(str(image_path))[0] or ""
    if not content_type.startswith("image/"):
        raise ValidationError("Candidate upload must be an image file.")

    return image_path, content_type
