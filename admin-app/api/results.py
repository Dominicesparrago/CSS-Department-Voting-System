"""Results recompute and publish logic backed by immutable votes."""

from __future__ import annotations

from typing import Any

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from .constants import ELECTION_ID
from .elections import get_election
from .firebase_admin_init import get_db, write_audit


def _doc_to_dict(snapshot) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    return data


def list_votes(election_id: str = ELECTION_ID) -> list[dict[str, Any]]:
    docs = get_db().collection("votes").where(filter=FieldFilter("electionId", "==", election_id)).stream()
    return [_doc_to_dict(doc) for doc in docs]


def recompute_tallies(election_id: str = ELECTION_ID) -> dict[str, Any]:
    per_candidate: dict[str, int] = {}
    per_position: dict[str, int] = {}
    voter_years: dict[str, int] = {}

    for vote in list_votes(election_id):
        candidate_id = vote["candidateId"]
        position_id = vote["positionId"]
        per_candidate[candidate_id] = per_candidate.get(candidate_id, 0) + 1
        per_position[position_id] = per_position.get(position_id, 0) + 1
        voter_years.setdefault(vote["uid"], int(vote.get("yearLevel", 0)))

    by_year = {"1": 0, "2": 0, "3": 0, "4": 0}
    for year_level in voter_years.values():
        if year_level in (1, 2, 3, 4):
            by_year[str(year_level)] += 1

    return {
        "perCandidate": per_candidate,
        "perPosition": per_position,
        "turnout": {
            "total": len(voter_years),
            "byYear": by_year,
        },
    }


def publish_results(actor_uid: str = "desktop-admin", election_id: str = ELECTION_ID) -> dict[str, Any]:
    election = get_election(election_id)
    if election.get("status") != "closed":
        raise ValueError("Election must be closed before publishing results.")

    tallies = recompute_tallies(election_id)
    db = get_db()
    batch = db.batch()
    batch.set(
        db.collection("tallies").document(election_id),
        {**tallies, "updatedAt": firestore.SERVER_TIMESTAMP},
    )
    batch.update(
        db.collection("elections").document(election_id),
        {"status": "published", "updatedAt": firestore.SERVER_TIMESTAMP},
    )
    audit_ref = db.collection("audit").document()
    batch.set(
        audit_ref,
        {
            "ts": firestore.SERVER_TIMESTAMP,
            "actorUid": actor_uid,
            "actorRole": "admin",
            "action": "election.publish",
            "target": f"elections/{election_id}",
            "details": {
                "voteDocs": sum(tallies["perPosition"].values()),
                "turnout": tallies["turnout"]["total"],
            },
        },
    )
    batch.commit()
    return tallies


def dashboard_counts(election_id: str = ELECTION_ID) -> dict[str, Any]:
    tallies = recompute_tallies(election_id)
    candidates = [_doc_to_dict(doc) for doc in get_db().collection("candidates").stream()]
    voters = [_doc_to_dict(doc) for doc in get_db().collection("voters").stream()]
    return {
        "tallies": tallies,
        "candidateCount": len(candidates),
        "activeCandidateCount": len([candidate for candidate in candidates if candidate.get("active") is True]),
        "voterCount": len(voters),
        "eligibleVoterCount": len([voter for voter in voters if voter.get("eligible") is True]),
    }
