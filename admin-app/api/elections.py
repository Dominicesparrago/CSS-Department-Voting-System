"""Election lifecycle controls for the desktop admin app."""

from __future__ import annotations

from typing import Any

from firebase_admin import firestore

from .constants import ELECTION_ID
from .firebase_admin_init import get_db, write_audit

ORDERED_TRANSITIONS = {
    "draft": {"open"},
    "open": {"closed"},
    "closed": {"draft"},
    "published": set(),
}


def get_election(election_id: str = ELECTION_ID) -> dict[str, Any]:
    snapshot = get_db().collection("elections").document(election_id).get()
    if not snapshot.exists:
        raise ValueError(f"Election {election_id} was not found.")

    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    return data


def transition_status(target_status: str, actor_uid: str = "desktop-admin", election_id: str = ELECTION_ID) -> dict[str, Any]:
    target_status = str(target_status or "").strip()
    if target_status == "published":
        raise ValueError("Use publish_results so tallies are recomputed before publishing.")

    election = get_election(election_id)
    current = election.get("status")
    if target_status == current:
        return election

    if target_status not in ORDERED_TRANSITIONS.get(current, set()):
        raise ValueError(f"Invalid lifecycle transition: {current} -> {target_status}.")

    get_db().collection("elections").document(election_id).update(
        {"status": target_status, "updatedAt": firestore.SERVER_TIMESTAMP}
    )
    write_audit(actor_uid, "election.status.set", f"elections/{election_id}", {"from": current, "to": target_status})
    return get_election(election_id)


def seed_positions_and_election(actor_uid: str = "desktop-admin", election_id: str = ELECTION_ID) -> None:
    from .constants import POSITIONS

    db = get_db()
    batch = db.batch()
    for position in POSITIONS:
        position_id = position["id"]
        data = {key: value for key, value in position.items() if key != "id"}
        batch.set(db.collection("positions").document(position_id), data)
    batch.set(
        db.collection("elections").document(election_id),
        {
            "title": "CSS Department Election 2026",
            "status": "draft",
            "positions": [position["id"] for position in POSITIONS],
            "openAt": None,
            "closeAt": None,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
    )
    batch.commit()
    write_audit(actor_uid, "election.seed_base", f"elections/{election_id}", {"positions": len(POSITIONS)})
