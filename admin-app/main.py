"""PyWebView desktop admin app for the CSS Department Voting System."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import webview

from api import candidates, elections, exports, results, voters
from api.constants import ELECTION_ID, POSITIONS
from api.firebase_admin_init import initialize_firebase


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


class AdminApi:
    """Methods exposed to JavaScript through PyWebView."""

    actor_uid = "desktop-admin"

    def _call(self, fn: Callable, *args, **kwargs) -> dict[str, Any]:
        try:
            return {"ok": True, "data": _jsonable(fn(*args, **kwargs))}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_dashboard(self):
        def load():
            return {
                "electionId": ELECTION_ID,
                "positions": POSITIONS,
                "election": elections.get_election(),
                "candidates": candidates.list_candidates(),
                "voters": voters.list_voters(),
                "counts": results.dashboard_counts(),
                "tallies": results.recompute_tallies(),
            }

        return self._call(load)

    def save_candidate(self, payload):
        return self._call(candidates.save_candidate, payload, self.actor_uid)

    def set_candidate_active(self, candidate_id, active):
        return self._call(candidates.set_candidate_active, candidate_id, active, self.actor_uid)

    def select_and_upload_candidate_image(self, candidate_id):
        def upload():
            window = webview.windows[0]
            files = window.create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False,
                file_types=("Image files (*.png;*.jpg;*.jpeg;*.webp)",),
            )
            if not files:
                return None
            return candidates.upload_candidate_image(candidate_id, files[0], self.actor_uid)

        return self._call(upload)

    def search_voters(self, search=""):
        return self._call(voters.list_voters, search)

    def set_voter_eligibility(self, uid, eligible):
        return self._call(voters.set_eligibility, uid, eligible, self.actor_uid)

    def create_voter(self, payload):
        return self._call(voters.create_voter, payload, self.actor_uid)

    def transition_election(self, target_status):
        return self._call(elections.transition_status, target_status, self.actor_uid)

    def publish_results(self):
        return self._call(results.publish_results, self.actor_uid)

    def export_votes_csv(self):
        return self._call(exports.export_votes_csv)

    def set_admin_claim(self, identifier):
        return self._call(voters.set_admin_claim, identifier, self.actor_uid)


def main() -> None:
    initialize_firebase()
    ui_path = Path(__file__).resolve().parent / "ui" / "index.html"
    webview.create_window(
        "CSS Department Admin",
        url=str(ui_path),
        js_api=AdminApi(),
        width=1180,
        height=780,
        min_size=(920, 620),
    )
    webview.start(debug=False)


if __name__ == "__main__":
    main()
