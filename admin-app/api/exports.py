"""CSV exports for the desktop admin app."""

from __future__ import annotations

import csv
import io
from typing import Any

from .candidates import list_candidates
from .constants import ELECTION_ID
from .results import list_votes


def _candidate_names() -> dict[str, str]:
    return {candidate["id"]: candidate.get("name", candidate["id"]) for candidate in list_candidates()}


def export_votes_csv(election_id: str = ELECTION_ID) -> str:
    names = _candidate_names()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["electionId", "positionId", "candidateId", "candidate", "yearLevel", "createdAt"])
    for vote in list_votes(election_id):
        writer.writerow(
            [
                vote.get("electionId", ""),
                vote.get("positionId", ""),
                vote.get("candidateId", ""),
                names.get(vote.get("candidateId"), vote.get("candidateId", "")),
                vote.get("yearLevel", ""),
                vote.get("createdAt", ""),
            ]
        )
    return output.getvalue()


def export_candidates_csv() -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["candidateId", "name", "positionId", "section", "yearLevel", "active", "order"])
    for candidate in list_candidates():
        writer.writerow(
            [
                candidate["id"],
                candidate.get("name", ""),
                candidate.get("positionId", ""),
                candidate.get("section", ""),
                candidate.get("yearLevel", ""),
                candidate.get("active", ""),
                candidate.get("order", ""),
            ]
        )
    return output.getvalue()
