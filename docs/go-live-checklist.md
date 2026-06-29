# Go-Live Checklist

Do not start until Phase 6 verification is green and the user has approved production actions.

1. Add `scc-css-department-vote.web.app` to Firebase Auth authorized domains.
2. Deploy Firestore rules, Firestore indexes, and Storage rules.
3. Deploy Hosting to target `scc-css-department-vote`.
4. Seed production with only the 20 positions and one draft election.
5. Bootstrap the first admin claim with the Python Admin app.
6. Sign in to `/admin/` with the admin account and confirm access.
7. Run the required production 17-vote access-budget smoke test.
8. Remove any smoke-test data or use a clean production election.
9. Enter real candidates and upload approved candidate photos.
10. Confirm voter registration instructions with the department.
11. Open the election only when ready for students.
12. Monitor vote docs and turnout from the admin dashboard.
13. Close the election at the end of voting.
14. Publish results only after recomputing tallies from immutable votes.
15. Export final CSV records for the department archive.
