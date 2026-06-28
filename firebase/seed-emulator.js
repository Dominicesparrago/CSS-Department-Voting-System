import { ELECTION_ID, election, positions } from "./seed-data.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectId = process.env.GCLOUD_PROJECT || "css-department-voting-system";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8081";
const baseUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`;

function assertEmulatorHost() {
  const host = firestoreHost.split(":")[0];
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(
      `Refusing to seed non-local Firestore host "${firestoreHost}". Test seed scripts are emulator-only.`
    );
  }
}

function toFirestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return { integerValue: value.toString() };
  }

  if (typeof value === "number") {
    return { doubleValue: value };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  return {
    mapValue: {
      fields: toFirestoreFields(value)
    }
  };
}

function toFirestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])
  );
}

export async function patchDocument(path, data) {
  const now = new Date();
  const payload = {
    fields: toFirestoreFields({
      ...data,
      updatedAt: now,
      createdAt: data.createdAt || now
    })
  };

  const response = await fetch(`${baseUrl}/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to seed ${path}: ${response.status} ${body}`);
  }
}

export async function seedBaseData() {
  assertEmulatorHost();

  for (const position of positions) {
    const { id, ...data } = position;
    await patchDocument(`positions/${id}`, data);
  }

  const { id, ...electionData } = election;
  await patchDocument(`elections/${id}`, electionData);

  console.log(`Seeded ${positions.length} positions.`);
  console.log(`Seeded election ${ELECTION_ID} with status "${election.status}".`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedBaseData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
