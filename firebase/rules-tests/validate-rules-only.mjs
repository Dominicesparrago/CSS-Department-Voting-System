import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(here, "..", "firestore.rules"), "utf8");
const testEnv = await initializeTestEnvironment({
  projectId: "css-department-voting-sy-f46a5",
  firestore: {
    rules,
    host: "127.0.0.1",
    port: 8081
  }
});
await testEnv.cleanup();
console.log("RULES_PARSE_OK");
