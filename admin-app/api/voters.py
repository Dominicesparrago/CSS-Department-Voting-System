"""Voter management and first-admin bootstrap."""

from __future__ import annotations

from typing import Any

from firebase_admin import auth, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from .firebase_admin_init import get_db, write_audit
from .validation import validate_voter_payload


def _doc_to_dict(snapshot) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    return data


def list_voters(search: str = "") -> list[dict[str, Any]]:
    query = get_db().collection("voters").order_by("fullName")
    records = [_doc_to_dict(doc) for doc in query.stream()]
    needle = search.strip().lower()
    if not needle:
        return records

    return [
        voter
        for voter in records
        if needle in " ".join(
            str(voter.get(field, ""))
            for field in ("fullName", "email", "studentNo", "section")
        ).lower()
    ]


def set_eligibility(uid: str, eligible: bool, actor_uid: str = "desktop-admin") -> None:
    if not uid:
        raise ValueError("uid is required.")

    get_db().collection("voters").document(uid).update(
        {"eligible": bool(eligible), "updatedAt": firestore.SERVER_TIMESTAMP}
    )
    write_audit(actor_uid, "voter.eligible.set", f"voters/{uid}", {"eligible": bool(eligible)})


def _student_no_available(student_no: str, uid: str | None = None) -> bool:
    db = get_db()
    index_snapshot = db.collection("studentIndex").document(student_no).get()
    if index_snapshot.exists and index_snapshot.to_dict().get("uid") != uid:
        return False

    matches = db.collection("voters").where(filter=FieldFilter("studentNo", "==", student_no)).limit(1).stream()
    for match in matches:
        if match.id != uid:
            return False
    return True


def create_voter(data: dict[str, Any], actor_uid: str = "desktop-admin") -> dict[str, Any]:
    payload = validate_voter_payload(data)
    password = str(data.get("password") or "").strip()
    if len(password) < 6:
        raise ValueError("password must be at least 6 characters for admin-created voters.")

    if not _student_no_available(payload["studentNo"]):
        raise ValueError("This student ID is already registered.")

    created_user = None
    try:
        created_user = auth.create_user(
            email=payload["email"],
            password=password,
            display_name=payload["fullName"],
        )
        db = get_db()
        batch = db.batch()
        voter_ref = db.collection("voters").document(created_user.uid)
        index_ref = db.collection("studentIndex").document(payload["studentNo"])
        now_payload = {
            **payload,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        batch.set(voter_ref, now_payload)
        batch.set(index_ref, {"uid": created_user.uid, "createdAt": firestore.SERVER_TIMESTAMP})
        batch.commit()
        write_audit(actor_uid, "voter.create", f"voters/{created_user.uid}", {"studentNo": payload["studentNo"]})
        return {"id": created_user.uid, **payload}
    except Exception:
        if created_user is not None:
            auth.delete_user(created_user.uid)
        raise


def set_admin_claim(identifier: str, actor_uid: str = "desktop-admin") -> dict[str, Any]:
    identifier = str(identifier or "").strip()
    if not identifier:
        raise ValueError("Email or uid is required.")

    user = auth.get_user_by_email(identifier) if "@" in identifier else auth.get_user(identifier)
    claims = dict(user.custom_claims or {})
    claims["admin"] = True
    auth.set_custom_user_claims(user.uid, claims)
    write_audit(actor_uid, "auth.admin_claim.set", f"auth/{user.uid}", {"email": user.email})
    return {"uid": user.uid, "email": user.email, "admin": True}
