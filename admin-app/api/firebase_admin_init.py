"""Firebase Admin SDK initialization for the desktop admin app."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials, firestore, storage
from google.auth.credentials import AnonymousCredentials

from .constants import PROJECT_ID, STORAGE_BUCKET


class EmulatorCredential(credentials.Base):
    """Anonymous credential for local Firebase emulators."""

    def get_credential(self):
        return AnonymousCredentials()


def _service_account_path() -> str | None:
    candidates = [
        os.environ.get("SCC_FIREBASE_SERVICE_ACCOUNT"),
        os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY"),
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"),
        str(Path(__file__).resolve().parents[1] / "serviceAccountKey.json"),
    ]
    return next((path for path in candidates if path and Path(path).exists()), None)


def using_emulators() -> bool:
    return any(
        os.environ.get(name)
        for name in (
            "FIRESTORE_EMULATOR_HOST",
            "FIREBASE_AUTH_EMULATOR_HOST",
            "FIREBASE_STORAGE_EMULATOR_HOST",
            "STORAGE_EMULATOR_HOST",
        )
    )


def initialize_firebase() -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    options: dict[str, Any] = {
        "projectId": PROJECT_ID,
        "storageBucket": STORAGE_BUCKET,
    }
    key_path = _service_account_path()

    if key_path:
        cred = credentials.Certificate(key_path)
    elif using_emulators():
        cred = EmulatorCredential()
    else:
        raise RuntimeError(
            "Set SCC_FIREBASE_SERVICE_ACCOUNT to a local serviceAccountKey.json path, "
            "or run against emulators with FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST."
        )

    return firebase_admin.initialize_app(cred, options)


def get_db():
    initialize_firebase()
    return firestore.client()


def get_bucket():
    initialize_firebase()
    return storage.bucket()


def get_auth():
    initialize_firebase()
    return auth


def write_audit(actor_uid: str, action: str, target: str, details: dict[str, Any] | None = None) -> str:
    db = get_db()
    doc_ref = db.collection("audit").document()
    doc_ref.set(
        {
            "ts": firestore.SERVER_TIMESTAMP,
            "actorUid": actor_uid,
            "actorRole": "admin",
            "action": action,
            "target": target,
            "details": details or {},
        }
    )
    return doc_ref.id
