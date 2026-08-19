import { ELECTION_ID, election, positions } from "./seed-data.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectId = process.env.GCLOUD_PROJECT || "css-department-voting-sy-f46a5";
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

// Sample official roster for local development. In production these records are
// written only by the importRoster Cloud Function from the admin-uploaded
// Excel file; here they give the emulator demo data so registered students
// whose IDs/emails match can vote end-to-end.
export const sampleRoster = [
  {
    studentNo: "20260001",
    fullName: "Juan Dela Cruz",
    section: "BSCS-1A",
    yearLevel: 1,
    email: "juan.delacruz.scc@gmail.com",
    status: "active",
    eligible: true
  },
  {
    studentNo: "20260002",
    fullName: "Maria Santos",
    section: "BSCS-2B",
    yearLevel: 2,
    email: "maria.santos.scc@gmail.com",
    status: "active",
    eligible: true
  },
  {
    studentNo: "20260003",
    fullName: "Pedro Reyes",
    section: "BSCS-3A",
    yearLevel: 3,
    email: "pedro.reyes.scc@gmail.com",
    status: "active",
    eligible: true
  },
  {
    studentNo: "20260004",
    fullName: "Ana Garcia",
    section: "BSCS-4A",
    yearLevel: 4,
    email: "ana.garcia.scc@gmail.com",
    status: "active",
    eligible: true
  },
  {
    studentNo: "20260005",
    fullName: "Luis Mendoza",
    section: "BSCS-1B",
    yearLevel: 1,
    email: "luis.mendoza.scc@gmail.com",
    status: "inactive",
    eligible: true
  },
  {
    studentNo: "20260006",
    fullName: "Rosa Torres",
    section: "BSCS-2A",
    yearLevel: 2,
    email: "rosa.torres.scc@gmail.com",
    status: "active",
    eligible: false
  },
  // Masterlist-style entry: no student number. Matched to voters by name +
  // section + year level (the same shape importRoster writes for files that
  // have no Student ID column).
  {
    fullName: "Sofia Ramirez",
    section: "BSCS-1A",
    yearLevel: 1,
    email: "sofia.ramirez.scc@gmail.com",
    status: "active",
    eligible: true
  }
];

export async function seedRoster() {
  assertEmulatorHost();
  let nameIndex = 0;
  for (const student of sampleRoster) {
    // Rows without a student number get a readable placeholder document id;
    // in production importRoster gives them auto ids instead.
    const docId = student.studentNo || `name_${(nameIndex += 1)}`;
    await patchDocument(`students/${docId}`, student);
  }
  console.log(`Seeded ${sampleRoster.length} official roster students.`);
}

export async function seedBaseData() {
  assertEmulatorHost();

  for (const position of positions) {
    const { id, ...data } = position;
    await patchDocument(`positions/${id}`, data);
  }

  const { id, ...electionData } = election;
  await patchDocument(`elections/${id}`, electionData);

  // Enable one-time (guest) voting for local dev so the sign-in card shows all
  // three tabs. In production this is fail-closed until the superadmin turns it
  // on from Settings — the app hides the One-time tab when it is off or absent.
  await patchDocument('config/app', { allowGuestVoters: true, maintenanceMode: false, updatedBy: 'seed' });

  await seedRoster();

  console.log(`Seeded ${positions.length} positions.`);
  console.log(`Seeded election ${ELECTION_ID} with status "${election.status}".`);
  console.log('Seeded config/app (one-time voting enabled for local dev).');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedBaseData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
