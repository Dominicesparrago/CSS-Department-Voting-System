import { signOut } from "../auth/session.js";
import { requireStudentRoute } from "../auth/guards.js";
import { ELECTION_ID } from "../lib/constants.js";
import { loadCandidatesForPositions, loadElection, loadRequiredPositions } from "./ballotData.js";
import {
  isBallotComplete,
  selectedCandidatesByPosition,
  unansweredPositions
} from "./ballotState.js";
import { submitCompleteBallot } from "./voteSubmit.js";

const title = document.querySelector("#route-title");
const message = document.querySelector("#route-message");
const profileList = document.querySelector("#profile-list");
const toolbar = document.querySelector("#ballot-toolbar");
const progress = document.querySelector("#ballot-progress");
const raceList = document.querySelector("#race-list");
const reviewPanel = document.querySelector("#review-panel");
const reviewList = document.querySelector("#review-list");
const reviewButton = document.querySelector("#review-button");
const editButton = document.querySelector("#edit-button");
const confirmButton = document.querySelector("#confirm-button");
const submitMessage = document.querySelector("#submit-message");
const signOutButton = document.querySelector("#sign-out-button");

let activeSession = null;
let activeElection = null;
let requiredPositions = [];
let candidatesByPosition = {};
let selections = {};

function setProfile(voterProfile) {
  profileList.classList.remove("is-hidden");
  document.querySelector('[data-profile="fullName"]').textContent = voterProfile.fullName;
  document.querySelector('[data-profile="studentNo"]').textContent = voterProfile.studentNo;
  document.querySelector('[data-profile="yearLevel"]').textContent = `Year ${voterProfile.yearLevel}`;
  document.querySelector('[data-profile="section"]').textContent = voterProfile.section;
}

function placeholderAvatar(candidateName) {
  const initial = encodeURIComponent((candidateName || "?").slice(0, 1).toUpperCase());
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='24' fill='%230f4c5c'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' dominant-baseline='middle' font-family='Arial' font-size='72' font-weight='700' fill='%2322b8a0'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

function updateProgress() {
  const selectedCount = requiredPositions.filter((position) => selections[position.id]).length;
  const complete = isBallotComplete(requiredPositions, selections);
  progress.textContent = `${selectedCount} of ${requiredPositions.length} races selected`;
  reviewButton.disabled = !complete;

  requiredPositions.forEach((position) => {
    const race = document.querySelector(`[data-race-id="${position.id}"]`);
    if (race) {
      race.classList.toggle("is-unanswered", !selections[position.id]);
    }
  });
}

function renderCandidate(position, candidate) {
  const label = document.createElement("label");
  label.className = "candidate-card";
  label.dataset.candidateId = candidate.id;

  const input = document.createElement("input");
  input.type = "radio";
  input.name = `race-${position.id}`;
  input.value = candidate.id;
  input.addEventListener("change", () => {
    selections[position.id] = candidate.id;
    updateProgress();
  });

  const photo = document.createElement("img");
  photo.alt = "";
  photo.src = candidate.photoURL || placeholderAvatar(candidate.name);

  const content = document.createElement("span");
  content.className = "candidate-content";

  const name = document.createElement("strong");
  name.textContent = candidate.name;

  const meta = document.createElement("span");
  meta.className = "candidate-meta";
  meta.textContent = `${position.name} · ${candidate.section || "Section TBA"} · Year ${candidate.yearLevel}`;

  const platform = document.createElement("span");
  platform.className = "candidate-platform";
  platform.textContent = candidate.platform || "Platform to be announced.";

  content.append(name, meta, platform);

  if (candidate.party) {
    const party = document.createElement("span");
    party.className = "candidate-party";
    party.textContent = candidate.party;
    content.append(party);
  }

  label.append(input, photo, content);
  return label;
}

function renderRaces() {
  raceList.replaceChildren();
  reviewPanel.classList.add("is-hidden");
  toolbar.classList.remove("is-hidden");

  requiredPositions.forEach((position) => {
    const race = document.createElement("section");
    race.className = "race-card is-unanswered";
    race.dataset.raceId = position.id;

    const header = document.createElement("div");
    header.className = "race-header";

    const heading = document.createElement("h2");
    heading.textContent = position.name;

    const status = document.createElement("span");
    status.className = "race-status";
    status.textContent = "Required";

    header.append(heading, status);

    const candidates = document.createElement("div");
    candidates.className = "candidate-list";
    const activeCandidates = candidatesByPosition[position.id] || [];

    if (activeCandidates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-race";
      empty.textContent = "No active candidates are available for this race yet.";
      candidates.append(empty);
    } else {
      activeCandidates.forEach((candidate) => {
        candidates.append(renderCandidate(position, candidate));
      });
    }

    race.append(header, candidates);
    raceList.append(race);
  });

  updateProgress();
}

function renderReview() {
  const missing = unansweredPositions(requiredPositions, selections);

  if (missing.length > 0) {
    submitMessage.textContent = "Complete every race before reviewing.";
    updateProgress();
    return;
  }

  reviewList.replaceChildren();
  selectedCandidatesByPosition(requiredPositions, candidatesByPosition, selections).forEach(({ position, candidate }) => {
    const item = document.createElement("div");
    item.className = "review-item";

    const positionName = document.createElement("span");
    positionName.textContent = position.name;

    const candidateName = document.createElement("strong");
    candidateName.textContent = candidate?.name || "Missing candidate";

    item.append(positionName, candidateName);
    reviewList.append(item);
  });

  submitMessage.textContent = "";
  reviewPanel.classList.remove("is-hidden");
  reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadBallot(session) {
  activeSession = session;
  setProfile(session.voterProfile);
  title.textContent = "Loading ballot...";
  message.textContent = "Preparing your year-aware ballot.";
  raceList.replaceChildren();
  toolbar.classList.add("is-hidden");
  reviewPanel.classList.add("is-hidden");
  selections = {};

  activeElection = await loadElection(ELECTION_ID);

  if (activeElection.status !== "open") {
    title.textContent = "Voting is not open";
    message.textContent = "This election is not accepting votes right now.";
    return;
  }

  requiredPositions = await loadRequiredPositions(session.voterProfile.yearLevel);
  candidatesByPosition = await loadCandidatesForPositions(requiredPositions, ELECTION_ID);

  title.textContent = activeElection.title || "CSS Department Election";
  message.textContent = "Select exactly one candidate for every race.";
  renderRaces();
}

function showAlreadyVoted(session) {
  title.textContent = "You have already voted";
  message.textContent = "Your vote is recorded for this election. The ballot cannot be reopened.";
  setProfile(session.voterProfile);
  toolbar.classList.add("is-hidden");
  reviewPanel.classList.add("is-hidden");
  raceList.replaceChildren();
}

function showDenied(reason) {
  title.textContent = "Access denied";
  message.textContent = reason;
  profileList.classList.add("is-hidden");
  toolbar.classList.add("is-hidden");
  reviewPanel.classList.add("is-hidden");
  raceList.replaceChildren();
}

requireStudentRoute({
  onAllowed(session) {
    loadBallot(session).catch((error) => {
      title.textContent = "Ballot unavailable";
      message.textContent = error.message || "Unable to load the ballot.";
    });
  },
  onAlreadyVoted: showAlreadyVoted,
  onDenied: showDenied
});

reviewButton.addEventListener("click", renderReview);

editButton.addEventListener("click", () => {
  reviewPanel.classList.add("is-hidden");
  raceList.scrollIntoView({ behavior: "smooth", block: "start" });
});

confirmButton.addEventListener("click", async () => {
  submitMessage.textContent = "";
  confirmButton.disabled = true;
  confirmButton.textContent = "Submitting...";

  try {
    await submitCompleteBallot({
      user: activeSession.user,
      voterProfile: activeSession.voterProfile,
      election: activeElection,
      requiredPositions,
      selections
    });
    title.textContent = "Vote submitted";
    message.textContent = "Your ballot was submitted successfully.";
    toolbar.classList.add("is-hidden");
    reviewPanel.classList.add("is-hidden");
    raceList.replaceChildren();
  } catch (error) {
    submitMessage.textContent = error.message || "Unable to submit your vote.";
    confirmButton.disabled = false;
    confirmButton.textContent = "Confirm vote";
  }
});

signOutButton.addEventListener("click", async () => {
  await signOut();
  window.location.assign("/");
});
