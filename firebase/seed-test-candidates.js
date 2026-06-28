import { ELECTION_ID, positions } from "./seed-data.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectId = process.env.GCLOUD_PROJECT || "css-department-voting-system";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8081";
const baseUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`;

function assertEmulatorHost() {
  const host = firestoreHost.split(":")[0];
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(
      `Refusing to seed non-local Firestore host "${firestoreHost}". Test candidate seeds are emulator-only.`
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

async function patchDocument(path, data) {
  const response = await fetch(`${baseUrl}/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fields: toFirestoreFields(data)
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to seed ${path}: ${response.status} ${body}`);
  }
}

function candidateId(positionId, number) {
  return `test_${positionId}_${number}`;
}

export async function seedTestCandidates() {
  assertEmulatorHost();
  const now = new Date();

  await patchDocument(`elections/${ELECTION_ID}`, {
    title: "CSS Department Election 2026",
    status: "open",
    positions: positions.map((position) => position.id),
    openAt: null,
    closeAt: null,
    createdAt: now,
    updatedAt: now
  });

  for (const position of positions) {
    for (const number of [1, 2]) {
      const yearLevel = position.scope === "year" ? position.yearLevel : ((position.order + number) % 4) + 1;
      await patchDocument(`candidates/${candidateId(position.id, number)}`, {
        electionId: ELECTION_ID,
        positionId: position.id,
        name: `${position.name} Candidate ${number}`,
        section: `BSCS ${yearLevel}-A`,
        yearLevel,
        platform: `Test platform for ${position.name} candidate ${number}.`,
        party: null,
        photoURL: "",
        photoPath: "",
        order: number,
        active: true,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  console.log(`Seeded ${positions.length * 2} test candidates.`);
  console.log(`Set election ${ELECTION_ID} status to "open" for emulator testing.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedTestCandidates().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
