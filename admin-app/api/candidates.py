"""Candidate CRUD and Storage image upload for the desktop admin app."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from firebase_admin import firestore

from .constants import ELECTION_ID
from .firebase_admin_init import get_bucket, get_db, write_audit
from .validation import validate_candidate_payload, validate_image_file


def _doc_to_dict(snapshot) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    return data


def list_candidates() -> list[dict[str, Any]]:
    docs = get_db().collection("candidates").order_by("order").stream()
    return [_doc_to_dict(doc) for doc in docs]


def save_candidate(data: dict[str, Any], actor_uid: str = "desktop-admin") -> dict[str, Any]:
    payload = validate_candidate_payload(data)
    db = get_db()
    candidate_id = str(data.get("id") or "").strip()
    doc_ref = db.collection("candidates").document(candidate_id) if candidate_id else db.collection("candidates").document()
    exists = doc_ref.get().exists

    write_payload = {
        **payload,
        "electionId": str(data.get("electionId") or ELECTION_ID),
        "photoURL": str(data.get("photoURL") or ""),
        "photoPath": str(data.get("photoPath") or ""),
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    if exists:
        doc_ref.update(write_payload)
        action = "candidate.update"
    else:
        doc_ref.set({**write_payload, "createdAt": firestore.SERVER_TIMESTAMP})
        action = "candidate.create"

    write_audit(actor_uid, action, f"candidates/{doc_ref.id}", {"positionId": payload["positionId"]})
    return {"id": doc_ref.id, **write_payload}


def set_candidate_active(candidate_id: str, active: bool, actor_uid: str = "desktop-admin") -> None:
    if not candidate_id:
        raise ValueError("candidate_id is required.")

    get_db().collection("candidates").document(candidate_id).update(
        {"active": bool(active), "updatedAt": firestore.SERVER_TIMESTAMP}
    )
    write_audit(actor_uid, "candidate.active.set", f"candidates/{candidate_id}", {"active": bool(active)})


def upload_candidate_image(candidate_id: str, image_path: str | Path, actor_uid: str = "desktop-admin") -> dict[str, str]:
    if not candidate_id:
        raise ValueError("candidate_id is required before uploading an image.")

    file_path, content_type = validate_image_file(image_path)
    token = str(uuid4())
    safe_name = file_path.name.replace(" ", "_")
    storage_path = f"candidates/{candidate_id}-{uuid4().hex}-{safe_name}"
    blob = get_bucket().blob(storage_path)
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_filename(str(file_path), content_type=content_type)

    bucket_name = get_bucket().name
    photo_url = (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
        f"{quote(storage_path, safe='')}?alt=media&token={token}"
    )
    get_db().collection("candidates").document(candidate_id).update(
        {
            "photoPath": storage_path,
            "photoURL": photo_url,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
    )
    write_audit(actor_uid, "candidate.photo.upload", f"candidates/{candidate_id}", {"photoPath": storage_path})
    return {"photoPath": storage_path, "photoURL": photo_url}
