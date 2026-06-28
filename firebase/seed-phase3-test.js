import { seedBaseData } from "./seed-emulator.js";
import { seedTestCandidates } from "./seed-test-candidates.js";

async function seedPhase3TestData() {
  await seedBaseData();
  await seedTestCandidates();
}

seedPhase3TestData().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
