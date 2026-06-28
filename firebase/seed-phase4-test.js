import { ELECTION_ID, positions } from "./seed-data.js";
import { patchDocument, seedBaseData } from "./seed-emulator.js";

const candidateSeeds = [
  ["phase4_president_a", "president", "Alex Santos", "BSCS 3-A", 3, 1],
  ["phase4_president_b", "president", "Bianca Cruz", "BSCS 2-B", 2, 2],
  ["phase4_secretary_a", "secretary", "Chris Reyes", "BSCS 1-A", 1, 1],
  ["phase4_year2_a", "year_rep_2", "Dana Villanueva", "BSCS 2-A", 2, 1],
  ["phase4_year2_b", "year_rep_2", "Eli Navarro", "BSCS 2-B", 2, 2]
];

const voterSeeds = [
  ["phase4_voter_a", "1002003", "Maria Ana Santos", "maria.ana.scc@gmail.com", 2, "BSCS 2-A", true],
  ["phase4_voter_b", "1002004", "Ben Cruz", "ben.cruz.scc@gmail.com", 2, "BSCS 2-B", true],
  ["phase4_voter_c", "1002005", "Cara Reyes", "cara.reyes.scc@gmail.com", 3, "BSCS 3-A", true],
  ["phase4_voter_d", "1002006", "Dino Lim", "dino.lim.scc@gmail.com", 1, "BSCS 1-A", false]
];

const voteSeeds = [
  ["phase4_voter_a", "president", "phase4_president_a", 2],
  ["phase4_voter_b", "president", "phase4_president_b", 2],
  ["phase4_voter_c", "president", "phase4_president_a", 3],
  ["phase4_voter_a", "secretary", "phase4_secretary_a", 2],
  ["phase4_voter_b", "secretary", "phase4_secretary_a", 2],
  ["phase4_voter_a", "year_rep_2", "phase4_year2_a", 2],
  ["phase4_voter_b", "year_rep_2", "phase4_year2_b", 2]
];

async function seedPhase4TestData() {
  await seedBaseData();
  await patchDocument(`elections/${ELECTION_ID}`, {
    title: "CSS Department Election 2026",
    status: "open",
    positions: positions.map((position) => position.id),
    openAt: null,
    closeAt: null
  });

  for (const [id, positionId, name, section, yearLevel, order] of candidateSeeds) {
    await patchDocument(`candidates/${id}`, {
      electionId: ELECTION_ID,
      positionId,
      name,
      section,
      yearLevel,
      platform: `${name} test platform for Phase 4 dashboard verification.`,
      party: null,
      photoURL: "",
      photoPath: "",
      order,
      active: true
    });
  }

  for (const [uid, studentNo, fullName, email, yearLevel, section, eligible] of voterSeeds) {
    await patchDocument(`voters/${uid}`, {
      studentNo,
      fullName,
      email,
      yearLevel,
      section,
      eligible,
      hasVoted: {
        [ELECTION_ID]: voteSeeds.some(([voteUid]) => voteUid === uid)
      },
      votedAt: {
        [ELECTION_ID]: new Date()
      }
    });
  }

  for (const [uid, positionId, candidateId, yearLevel] of voteSeeds) {
    await patchDocument(`votes/${ELECTION_ID}__${uid}__${positionId}`, {
      electionId: ELECTION_ID,
      uid,
      positionId,
      candidateId,
      yearLevel
    });
  }

  console.log(`Seeded Phase 4 dashboard data: ${candidateSeeds.length} candidates, ${voterSeeds.length} voters, ${voteSeeds.length} votes.`);
}

seedPhase4TestData().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
