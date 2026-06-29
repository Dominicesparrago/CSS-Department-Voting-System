# Admin Bootstrap

Admin access is controlled only by Firebase Auth custom claims. No Firestore field grants admin privileges.

The first real admin is created in Phase 5 by the Python Admin app with the Firebase Admin SDK and a local `admin-app/serviceAccountKey.json` file. That key is git-ignored and must never be committed.

Expected Phase 5 flow:

```python
import firebase_admin
from firebase_admin import auth, credentials

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

auth.set_custom_user_claims("<ADMIN_AUTH_UID>", {"admin": True})
```

For emulator-only testing, use the Auth emulator and Admin SDK with `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, then set the same custom claim:

```js
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

const app = initializeApp({ projectId: "css-department-voting-sy-f46a5" });
await getAuth(app).setCustomUserClaims("<ADMIN_AUTH_UID>", { admin: true });
```

After claims are changed, the signed-in browser user must refresh their ID token before the admin route guard sees the new claim.
