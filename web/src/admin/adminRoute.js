import { requireAdminRoute } from "../auth/guards.js";
import { signOut } from "../auth/session.js";
import { ELECTION_ID } from "../lib/constants.js";
import {
  aggregateVotes,
  buildTallies,
  candidatesForPosition,
  formatTimestamp,
  formatYearLevel,
  rankedCandidatesForPosition,
  votesToCsv
} from "./adminCore.js";
import {
  loadCandidates,
  loadElection,
  loadPositions,
  loadVoters,
  publishElection,
  saveCandidate,
  setCandidateActive,
  setElectionStatus,
  setVoterEligibility,
  validateCandidatePhoto,
  watchElection,
  watchVotes
} from "./adminData.js";

const deniedPanel = document.querySelector("#admin-denied");
const deniedMessage = document.querySelector("#admin-denied-message");
const dashboard = document.querySelector("#admin-dashboard");
const statusLine = document.querySelector("#admin-status");
const signOutButtons = [
  document.querySelector("#admin-sign-out-button"),
  document.querySelector("#admin-denied-sign-out")
].filter(Boolean);

const state = {
  session: null,
  election: null,
  positions: [],
  candidates: [],
  voters: [],
  votes: [],
  selectedPositionId: "president",
  charts: {},
  unsubscribes: []
};

let initialized = false;

function setStatus(message) {
  statusLine.textContent = message;
}

function setBusy(button, busy, text = "Working...") {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function populatePositionSelects() {
  const filter = document.querySelector("#position-filter");
  const candidatePosition = document.querySelector("#candidate-position");
  filter.replaceChildren();
  candidatePosition.replaceChildren();

  state.positions.forEach((position) => {
    const label = `${position.order}. ${position.name}`;
    filter.append(option(position.id, label));
    candidatePosition.append(option(position.id, label));
  });

  filter.value = state.selectedPositionId;
  candidatePosition.value = state.selectedPositionId;
}

function chartColors(count) {
  const palette = ["#22B8A0", "#1CABB8", "#3BD6B0", "#1A8FA0", "#A0EDE2", "#0E6E7E", "#115E6E", "#D4F7F1"];
  return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
}

function createOrUpdateChart(id, type, labels, data, label) {
  const canvas = document.querySelector(`#${id}`);
  const chartData = {
    labels,
    datasets: [
      {
        label,
        data,
        backgroundColor: chartColors(labels.length),
        borderColor: "rgba(212,247,241,.35)",
        borderWidth: 1
      }
    ]
  };

  if (state.charts[id]) {
    state.charts[id].data = chartData;
    state.charts[id].update();
    return;
  }

  state.charts[id] = new Chart(canvas, {
    type,
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: id === "leaderboard-chart" ? "y" : "x",
      plugins: {
        legend: {
          display: type !== "bar",
          labels: { color: "#D4F7F1" }
        }
      },
      scales: type === "bar"
        ? {
            x: { ticks: { color: "#A0EDE2" }, grid: { color: "rgba(120,200,190,.12)" } },
            y: { beginAtZero: true, ticks: { color: "#A0EDE2", precision: 0 }, grid: { color: "rgba(120,200,190,.12)" } }
          }
        : undefined
    }
  });
}

function renderMonitor() {
  if (!state.positions.length || !state.candidates.length) {
    return;
  }

  const aggregate = aggregateVotes({
    votes: state.votes,
    candidates: state.candidates,
    positions: state.positions,
    voters: state.voters
  });
  const selectedCandidates = rankedCandidatesForPosition(state.candidates, aggregate, state.selectedPositionId);
  const selectedPosition = state.positions.find((position) => position.id === state.selectedPositionId);
  const distribution = state.positions.map((position) => aggregate.perPosition[position.id] || 0);

  document.querySelector("#turnout-total").textContent = aggregate.turnout.total;
  document.querySelector("#turnout-eligible").textContent = `${aggregate.eligible.total} eligible voters`;
  document.querySelector("#vote-doc-total").textContent = aggregate.voteDocTotal;
  document.querySelector("#active-candidate-total").textContent = state.candidates.filter((candidate) => candidate.active).length;
  document.querySelector("#candidate-total").textContent = `${state.candidates.length} total candidates`;

  createOrUpdateChart(
    "candidate-counts-chart",
    "bar",
    selectedCandidates.map((candidate) => candidate.name),
    selectedCandidates.map((candidate) => candidate.votes),
    selectedPosition?.name || "Votes"
  );
  createOrUpdateChart(
    "distribution-chart",
    "doughnut",
    state.positions.map((position) => position.name),
    distribution,
    "Votes per position"
  );
  createOrUpdateChart(
    "turnout-chart",
    "bar",
    ["Year 1", "Year 2", "Year 3", "Year 4"],
    ["1", "2", "3", "4"].map((year) => aggregate.turnout.byYear[year] || 0),
    "Turnout"
  );
  createOrUpdateChart(
    "leaderboard-chart",
    "bar",
    selectedCandidates.map((candidate) => candidate.name),
    selectedCandidates.map((candidate) => candidate.votes),
    "Ranked votes"
  );

  document.querySelector("#tally-preview").textContent = JSON.stringify(
    buildTallies(ELECTION_ID, state.votes),
    null,
    2
  );
}

function candidateAvatar(candidate) {
  if (candidate.photoURL) {
    return `<img src="${escapeHtml(candidate.photoURL)}" alt="" />`;
  }

  return `<span class="avatar-placeholder" aria-hidden="true">${escapeHtml(candidate.name.slice(0, 1).toUpperCase())}</span>`;
}

function renderCandidates() {
  const list = document.querySelector("#candidate-list");
  document.querySelector("#candidate-list-count").textContent = `${state.candidates.length} records`;

  const grouped = state.positions.flatMap((position) =>
    candidatesForPosition(state.candidates, position.id).map((candidate) => ({ candidate, position }))
  );

  list.replaceChildren();
  grouped.forEach(({ candidate, position }) => {
    const card = document.createElement("article");
    card.className = "candidate-admin-card";
    card.innerHTML = `
      ${candidateAvatar(candidate)}
      <div>
        <strong>${escapeHtml(candidate.name)}</strong>
        <span>${escapeHtml(position.name)} · ${escapeHtml(candidate.section)} · ${escapeHtml(formatYearLevel(candidate.yearLevel))}</span>
        <p>${escapeHtml(candidate.platform)}</p>
        ${candidate.party ? `<small>${escapeHtml(candidate.party)}</small>` : ""}
      </div>
      <div class="mini-actions">
        <button class="btn btn-ghost" type="button" data-edit-candidate="${escapeHtml(candidate.id)}">Edit</button>
        <button class="btn btn-ghost" type="button" data-toggle-candidate="${escapeHtml(candidate.id)}">
          ${candidate.active ? "Deactivate" : "Activate"}
        </button>
      </div>
    `;
    list.append(card);
  });
}

function hasVoted(voter) {
  return voter.hasVoted?.[ELECTION_ID] === true;
}

function renderVoters() {
  const table = document.querySelector("#voter-table");
  const queryText = document.querySelector("#voter-search").value.trim().toLowerCase();
  const filtered = state.voters.filter((voter) => {
    const haystack = `${voter.fullName} ${voter.email} ${voter.studentNo} ${voter.section}`.toLowerCase();
    return haystack.includes(queryText);
  });

  table.replaceChildren();
  filtered.forEach((voter) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(voter.fullName)}<br><small>${escapeHtml(voter.email)}</small></td>
      <td>${escapeHtml(voter.studentNo)}</td>
      <td>${escapeHtml(voter.yearLevel)}</td>
      <td>${voter.eligible ? "Yes" : "No"}</td>
      <td>${hasVoted(voter) ? "Yes" : "No"}</td>
      <td>
        <button class="btn btn-ghost table-button" type="button" data-toggle-voter="${escapeHtml(voter.id)}">
          ${voter.eligible ? "Disable" : "Enable"}
        </button>
      </td>
    `;
    table.append(row);
  });
}

function renderElection() {
  document.querySelector("#election-status-line").textContent =
    `Current status: ${state.election?.status || "unknown"}`;
  const publishButton = document.querySelector("#publish-button");
  const canPublish = state.election?.status === "closed";
  publishButton.disabled = !canPublish;
  publishButton.title = canPublish ? "" : "Close the election before publishing results.";
}

function renderVoteTable() {
  const table = document.querySelector("#vote-table");
  const aggregate = aggregateVotes({
    votes: state.votes,
    candidates: state.candidates,
    positions: state.positions,
    voters: state.voters
  });

  table.replaceChildren();
  state.votes.slice(-250).reverse().forEach((vote) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><small>${escapeHtml(vote.id)}</small></td>
      <td>${escapeHtml(aggregate.positionsById[vote.positionId]?.name || vote.positionId)}</td>
      <td>${escapeHtml(aggregate.candidatesById[vote.candidateId]?.name || vote.candidateId)}</td>
      <td>${escapeHtml(vote.yearLevel)}</td>
      <td>${escapeHtml(formatTimestamp(vote.createdAt))}</td>
    `;
    table.append(row);
  });
}

function renderAll() {
  renderMonitor();
  renderCandidates();
  renderVoters();
  renderElection();
  renderVoteTable();
}

function resetCandidateForm() {
  document.querySelector("#candidate-form").reset();
  document.querySelector("#candidate-id").value = "";
  document.querySelector("#candidate-form-title").textContent = "Add candidate";
  document.querySelector("#candidate-active").checked = true;
  document.querySelector("#candidate-order").value = "1";
  document.querySelector("#candidate-position").value = state.selectedPositionId;
  document.querySelector("#candidate-photo-error").textContent = "";
}

function fillCandidateForm(candidate) {
  document.querySelector("#candidate-id").value = candidate.id;
  document.querySelector("#candidate-form-title").textContent = "Edit candidate";
  document.querySelector("#candidate-name").value = candidate.name;
  document.querySelector("#candidate-position").value = candidate.positionId;
  document.querySelector("#candidate-section").value = candidate.section;
  document.querySelector("#candidate-year").value = String(candidate.yearLevel);
  document.querySelector("#candidate-platform").value = candidate.platform;
  document.querySelector("#candidate-party").value = candidate.party || "";
  document.querySelector("#candidate-order").value = String(candidate.order || 1);
  document.querySelector("#candidate-active").checked = candidate.active === true;
  document.querySelector("#candidate-photo").value = "";
  document.querySelector("[data-admin-tab='candidates']").click();
}

async function refreshLists() {
  const [candidates, voters] = await Promise.all([loadCandidates(), loadVoters()]);
  state.candidates = candidates;
  state.voters = voters;
  renderAll();
}

function setupEvents() {
  signOutButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      await signOut();
      window.location.assign("/");
    });
  });

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-admin-tab]").forEach((item) => item.classList.remove("is-active"));
      document.querySelectorAll("[data-admin-panel]").forEach((panel) => panel.classList.remove("is-active"));
      button.classList.add("is-active");
      document.querySelector(`[data-admin-panel="${button.dataset.adminTab}"]`).classList.add("is-active");
    });
  });

  document.querySelector("#position-filter").addEventListener("change", (event) => {
    state.selectedPositionId = event.target.value;
    renderMonitor();
  });

  document.querySelector("#candidate-photo").addEventListener("change", (event) => {
    document.querySelector("#candidate-photo-error").textContent = validateCandidatePhoto(event.target.files[0]);
  });

  document.querySelector("#candidate-reset-button").addEventListener("click", resetCandidateForm);

  document.querySelector("#candidate-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#candidate-save-button");
    const message = document.querySelector("#candidate-message");
    const file = document.querySelector("#candidate-photo").files[0];
    const photoError = validateCandidatePhoto(file);

    if (photoError) {
      document.querySelector("#candidate-photo-error").textContent = photoError;
      return;
    }

    setBusy(button, true, "Saving...");
    message.textContent = "";

    try {
      await saveCandidate({
        actorUid: state.session.user.uid,
        photoFile: file,
        candidate: {
          id: document.querySelector("#candidate-id").value,
          name: document.querySelector("#candidate-name").value,
          positionId: document.querySelector("#candidate-position").value,
          section: document.querySelector("#candidate-section").value,
          yearLevel: Number(document.querySelector("#candidate-year").value),
          platform: document.querySelector("#candidate-platform").value,
          party: document.querySelector("#candidate-party").value,
          order: Number(document.querySelector("#candidate-order").value),
          active: document.querySelector("#candidate-active").checked
        }
      });
      message.textContent = "Candidate saved.";
      resetCandidateForm();
      await refreshLists();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      setBusy(button, false);
    }
  });

  document.querySelector("#candidate-list").addEventListener("click", async (event) => {
    const editId = event.target.closest("[data-edit-candidate]")?.dataset.editCandidate;
    const toggleId = event.target.closest("[data-toggle-candidate]")?.dataset.toggleCandidate;

    if (editId) {
      const candidate = state.candidates.find((item) => item.id === editId);
      if (candidate) fillCandidateForm(candidate);
      return;
    }

    if (toggleId) {
      const candidate = state.candidates.find((item) => item.id === toggleId);
      await setCandidateActive(toggleId, !candidate.active, state.session.user.uid);
      await refreshLists();
    }
  });

  document.querySelector("#voter-search").addEventListener("input", renderVoters);
  document.querySelector("#voter-table").addEventListener("click", async (event) => {
    const uid = event.target.closest("[data-toggle-voter]")?.dataset.toggleVoter;
    if (!uid) return;

    const voter = state.voters.find((item) => item.id === uid);
    await setVoterEligibility(uid, !voter.eligible, state.session.user.uid);
    await refreshLists();
  });

  document.querySelectorAll("[data-status-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      setBusy(button, true, "Updating...");
      try {
        await setElectionStatus(button.dataset.statusTarget, state.session.user.uid);
      } finally {
        setBusy(button, false);
      }
    });
  });

  document.querySelector("#publish-button").addEventListener("click", async (event) => {
    if (state.election?.status !== "closed") {
      setStatus("Close the election before publishing results.");
      return;
    }

    setBusy(event.currentTarget, true, "Publishing...");
    try {
      await publishElection({
        actorUid: state.session.user.uid
      });
      setStatus("Results published from recomputed vote records.");
    } finally {
      setBusy(event.currentTarget, false);
    }
  });

  document.querySelector("#export-votes-button").addEventListener("click", () => {
    const csv = votesToCsv({
      votes: state.votes,
      candidates: state.candidates,
      positions: state.positions
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `css-votes-${ELECTION_ID}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

async function startDashboard(session) {
  if (initialized) {
    state.session = session;
    return;
  }

  initialized = true;
  state.session = session;
  deniedPanel.hidden = true;
  dashboard.hidden = false;
  setupEvents();

  const [election, positions, candidates, voters] = await Promise.all([
    loadElection(),
    loadPositions(),
    loadCandidates(),
    loadVoters()
  ]);

  state.election = election;
  state.positions = positions;
  state.candidates = candidates;
  state.voters = voters;
  state.selectedPositionId = positions[0]?.id || "president";

  populatePositionSelects();
  renderAll();
  setStatus(`Signed in as admin. Election status: ${election.status}.`);

  state.unsubscribes.push(
    watchVotes((votes) => {
      state.votes = votes;
      renderAll();
    }, (error) => setStatus(error.message)),
    watchElection((nextElection) => {
      state.election = nextElection;
      renderElection();
      setStatus(`Signed in as admin. Election status: ${nextElection.status}.`);
    }, (error) => setStatus(error.message))
  );
}

requireAdminRoute({
  onAllowed(session) {
    startDashboard(session).catch((error) => {
      setStatus(error.message);
    });
  },
  onDenied(reason) {
    dashboard.hidden = true;
    deniedPanel.hidden = false;
    deniedMessage.textContent = reason;
    state.unsubscribes.forEach((unsubscribe) => unsubscribe());
    state.unsubscribes = [];
    initialized = false;
  }
});
