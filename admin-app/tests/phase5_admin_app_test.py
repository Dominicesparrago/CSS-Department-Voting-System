from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

from firebase_admin import auth, firestore

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "admin-app"))

os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8081")
os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
os.environ.setdefault("FIREBASE_STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")
os.environ.setdefault("STORAGE_EMULATOR_HOST", "http://127.0.0.1:9199")

from api import candidates, elections, exports, results, voters  # noqa: E402
from api.constants import ELECTION_ID  # noqa: E402
from api.firebase_admin_init import get_db, initialize_firebase  # noqa: E402


def delete_collection(path: str) -> None:
    db = get_db()
    for doc in db.collection(path).stream():
        doc.reference.delete()


def clear_auth_users() -> None:
    for user in auth.list_users().iterate_all():
        auth.delete_user(user.uid)


def reset_emulator() -> None:
    initialize_firebase()
    clear_auth_users()
    for collection_name in ("votes", "candidates", "voters", "studentIndex", "elections", "positions", "tallies", "audit"):
        delete_collection(collection_name)


def expect_raises(fn, message: str) -> None:
    try:
        fn()
    except Exception:
        return
    raise AssertionError(message)


def create_test_image() -> str:
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00\x02\x00\x01"
        b"\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    handle.write(png_bytes)
    handle.close()
    return handle.name


def seed_votes(voter_a: str, voter_b: str, candidate_a: str, candidate_b: str) -> None:
    db = get_db()
    vote_rows = [
        (voter_a, "president", candidate_a, 2),
        (voter_b, "president", candidate_b, 2),
        (voter_a, "secretary", candidate_a, 2),
        (voter_b, "secretary", candidate_a, 2),
    ]
    for uid, position_id, candidate_id, year_level in vote_rows:
        db.collection("votes").document(f"{ELECTION_ID}__{uid}__{position_id}").set(
            {
                "electionId": ELECTION_ID,
                "uid": uid,
                "positionId": position_id,
                "candidateId": candidate_id,
                "yearLevel": year_level,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )


def main() -> None:
    reset_emulator()
    assert "serviceAccountKey.json" in (ROOT / ".gitignore").read_text(encoding="utf-8")

    elections.seed_positions_and_election("phase5-test")
    expect_raises(lambda: elections.transition_status("closed", "phase5-test"), "draft -> closed must be rejected")

    candidate_a = candidates.save_candidate(
        {
            "name": "Phase Five President A",
            "positionId": "president",
            "section": "BSCS 2-A",
            "yearLevel": 2,
            "platform": "Integrity and service.",
            "party": "",
            "order": 1,
            "active": True,
        },
        "phase5-test",
    )["id"]
    candidate_b = candidates.save_candidate(
        {
            "name": "Phase Five President B",
            "positionId": "president",
            "section": "BSCS 2-B",
            "yearLevel": 2,
            "platform": "Transparent reports.",
            "party": None,
            "order": 2,
            "active": True,
        },
        "phase5-test",
    )["id"]
    candidates.set_candidate_active(candidate_b, False, "phase5-test")
    candidates.set_candidate_active(candidate_b, True, "phase5-test")

    image_path = create_test_image()
    upload = candidates.upload_candidate_image(candidate_a, image_path, "phase5-test")
    assert upload["photoPath"].startswith("candidates/")
    Path(image_path).unlink(missing_ok=True)

    voter_a = voters.create_voter(
        {
            "email": "phasefive.admin.scc@gmail.com",
            "password": "testpass123",
            "studentNo": "5000001",
            "fullName": "Phase Five Admin",
            "yearLevel": 2,
            "section": "BSCS 2-A",
            "eligible": True,
        },
        "phase5-test",
    )["id"]
    voter_b = voters.create_voter(
        {
            "email": "phasefive.voter.scc@gmail.com",
            "password": "testpass123",
            "studentNo": "5000002",
            "fullName": "Phase Five Voter",
            "yearLevel": 2,
            "section": "BSCS 2-B",
            "eligible": True,
        },
        "phase5-test",
    )["id"]
    expect_raises(
        lambda: voters.create_voter(
            {
                "email": "phasefive.duplicate.scc@gmail.com",
                "password": "testpass123",
                "studentNo": "5000001",
                "fullName": "Duplicate Student",
                "yearLevel": 2,
                "section": "BSCS 2-C",
                "eligible": True,
            },
            "phase5-test",
        ),
        "duplicate studentNo must be rejected",
    )
    voters.set_eligibility(voter_b, False, "phase5-test")
    assert get_db().collection("voters").document(voter_b).get().to_dict()["eligible"] is False

    claim = voters.set_admin_claim("phasefive.admin.scc@gmail.com", "phase5-test")
    assert claim["admin"] is True
    assert auth.get_user(voter_a).custom_claims["admin"] is True

    elections.transition_status("open", "phase5-test")
    expect_raises(lambda: elections.transition_status("published", "phase5-test"), "direct publish must be rejected")
    elections.transition_status("closed", "phase5-test")

    seed_votes(voter_a, voter_b, candidate_a, candidate_b)
    tallies = results.recompute_tallies()
    assert tallies["turnout"]["total"] == 2
    assert tallies["turnout"]["byYear"]["2"] == 2
    assert tallies["perCandidate"][candidate_a] == 3
    published = results.publish_results("phase5-test")
    assert published == tallies
    assert get_db().collection("elections").document(ELECTION_ID).get().to_dict()["status"] == "published"
    assert get_db().collection("tallies").document(ELECTION_ID).get().to_dict()["turnout"]["total"] == 2

    csv_text = exports.export_votes_csv()
    assert voter_a not in csv_text
    assert f"{ELECTION_ID}__{voter_a}__president" not in csv_text
    assert "Phase Five President A" in csv_text

    print("Candidate CRUD + image upload verified.")
    print("Voter creation, duplicate studentNo rejection, and eligibility toggle verified.")
    print("Admin claim bootstrap verified.")
    print("Lifecycle ordering and recompute+publish verified.")
    print("UID-omitting vote CSV verified.")
    print("Phase 5 Python admin app tests passed.")


if __name__ == "__main__":
    main()
