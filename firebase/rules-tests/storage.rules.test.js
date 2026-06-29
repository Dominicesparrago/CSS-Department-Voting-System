import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ref, uploadBytes } from "firebase/storage";

const projectId = "css-department-voting-sy-f46a5";

const testEnv = await initializeTestEnvironment({
  projectId,
  storage: {
    rules: readFileSync("../storage.rules", "utf8"),
    host: "127.0.0.1",
    port: 9199
  }
});

function storageFor(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).storage("css-department-voting-sy-f46a5.firebasestorage.app");
}

try {
  await assertFails(
    uploadBytes(
      ref(storageFor("student"), "candidates/student-upload.jpg"),
      new Blob(["fake image bytes"], { type: "image/jpeg" })
    )
  );

  await assertFails(
    uploadBytes(
      ref(storageFor("admin", { admin: true }), "candidates/not-image.txt"),
      new Blob(["plain text"], { type: "text/plain" })
    )
  );

  await assertSucceeds(
    uploadBytes(
      ref(storageFor("admin", { admin: true }), "candidates/admin-upload.jpg"),
      new Blob(["fake image bytes"], { type: "image/jpeg" })
    )
  );

  console.log("Storage rules tests passed.");
} finally {
  await testEnv.cleanup();
}
