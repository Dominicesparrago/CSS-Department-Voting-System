# CSS Department Voting System Admin App

Desktop admin console for the St. Clare College of Caloocan Computer Science Department election system.

## Security

This app uses the Firebase Admin SDK. Admin SDK writes bypass Firestore and Storage security rules, so the Python modules re-validate student emails, student IDs, year levels, candidate fields, image type/size, lifecycle order, and tally recomputation before writing.

Never commit a service account key. `serviceAccountKey.json` is ignored by the repo. Prefer an environment variable:

```powershell
$env:SCC_FIREBASE_SERVICE_ACCOUNT="C:\secure\serviceAccountKey.json"
```

For local emulator work:

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8081"
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIREBASE_STORAGE_EMULATOR_HOST="http://127.0.0.1:9199"
```

## Install

```powershell
cd admin-app
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
python main.py
```

## First Admin Bootstrap

1. Create or identify the first admin user in Firebase Authentication.
2. Open the desktop app.
3. Go to `Admin Claim`.
4. Enter the user's email or uid.
5. Click `Set admin claim`.

The app calls `auth.set_custom_user_claims(uid, {"admin": true})` and writes an audit document. The user must sign out and sign back in on the web app to refresh their ID token.

## Packaging

From `admin-app/`:

```powershell
pyinstaller --noconsole --onefile --add-data "ui;ui" main.py
```

For production, ship the `.exe` without any service account key. Keep the key in a secure local path and set `SCC_FIREBASE_SERVICE_ACCOUNT` before launch.
