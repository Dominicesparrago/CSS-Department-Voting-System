const state = {
  positions: [],
  election: null,
  candidates: [],
  voters: [],
  tallies: null,
  charts: {}
};

const $ = (selector) => document.querySelector(selector);

function setStatus(message, isError = false) {
  const line = $("#status-line");
  line.textContent = message;
  line.classList.toggle("error", isError);
}

async function api(name, ...args) {
  const result = await window.pywebview.api[name](...args);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function chart(id, type, labels, data, label) {
  const chartData = {
    labels,
    datasets: [{ label, data, backgroundColor: ["#22B8A0", "#1CABB8", "#3BD6B0", "#1A8FA0", "#A0EDE2", "#0E6E7E"] }]
  };
  if (state.charts[id]) {
    state.charts[id].data = chartData;
    state.charts[id].update();
    return;
  }
  state.charts[id] = new Chart($(`#${id}`), {
    type,
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#D4F7F1" } } },
      scales: type === "bar" ? {
        x: { ticks: { color: "#A0EDE2" }, grid: { color: "rgba(120,200,190,.12)" } },
        y: { beginAtZero: true, ticks: { color: "#A0EDE2", precision: 0 }, grid: { color: "rgba(120,200,190,.12)" } }
      } : undefined
    }
  });
}

function renderPositions() {
  const select = $("#candidate-position");
  select.replaceChildren();
  state.positions.forEach((position) => {
    const option = document.createElement("option");
    option.value = position.id;
    option.textContent = `${position.order}. ${position.name}`;
    select.append(option);
  });
}

function renderCandidates() {
  const list = $("#candidate-list");
  list.replaceChildren();
  state.candidates.forEach((candidate) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div>
        <strong>${candidate.name}</strong>
        <small>${candidate.positionId} · ${candidate.section} · Year ${candidate.yearLevel}</small>
        <small>${candidate.active ? "Active" : "Inactive"} · order ${candidate.order}</small>
      </div>
      <div class="actions">
        <button class="ghost" data-edit="${candidate.id}">Edit</button>
        <button class="ghost" data-active="${candidate.id}">${candidate.active ? "Deactivate" : "Activate"}</button>
        <button class="ghost" data-upload="${candidate.id}">Upload image</button>
      </div>
    `;
    list.append(item);
  });
}

function renderVoters() {
  const list = $("#voter-list");
  list.replaceChildren();
  state.voters.forEach((voter) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div>
        <strong>${voter.fullName}</strong>
        <small>${voter.email} · ${voter.studentNo} · Year ${voter.yearLevel}</small>
        <small>${voter.eligible ? "Eligible" : "Disabled"}</small>
      </div>
      <button class="ghost" data-voter="${voter.id}">${voter.eligible ? "Disable" : "Enable"}</button>
    `;
    list.append(item);
  });
}

function renderDashboard() {
  $("#metric-turnout").textContent = state.tallies.turnout.total;
  $("#metric-votes").textContent = Object.values(state.tallies.perPosition).reduce((sum, count) => sum + count, 0);
  $("#metric-eligible").textContent = state.voters.filter((voter) => voter.eligible).length;
  $("#metric-candidates").textContent = state.candidates.filter((candidate) => candidate.active).length;
  $("#election-status").textContent = `Status: ${state.election.status}`;
  $("#publish-button").disabled = state.election.status !== "closed";

  chart("turnout-chart", "bar", ["Year 1", "Year 2", "Year 3", "Year 4"], ["1", "2", "3", "4"].map((year) => state.tallies.turnout.byYear[year] || 0), "Turnout");
  chart("position-chart", "doughnut", Object.keys(state.tallies.perPosition), Object.values(state.tallies.perPosition), "Votes");
}

async function refresh() {
  try {
    const data = await api("get_dashboard");
    Object.assign(state, {
      positions: data.positions,
      election: data.election,
      candidates: data.candidates,
      voters: data.voters,
      tallies: data.tallies
    });
    renderPositions();
    renderCandidates();
    renderVoters();
    renderDashboard();
    setStatus(`Connected. Election status: ${state.election.status}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`[data-panel="${button.dataset.tab}"]`).classList.add("active");
  });
});

$("#refresh-button").addEventListener("click", refresh);

$("#candidate-clear").addEventListener("click", () => $("#candidate-form").reset());

$("#candidate-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("save_candidate", {
      id: $("#candidate-id").value,
      name: $("#candidate-name").value,
      positionId: $("#candidate-position").value,
      section: $("#candidate-section").value,
      yearLevel: $("#candidate-year").value,
      platform: $("#candidate-platform").value,
      party: $("#candidate-party").value,
      order: $("#candidate-order").value,
      active: $("#candidate-active").checked
    });
    $("#candidate-form").reset();
    await refresh();
  } catch (error) {
    setStatus(error.message, true);
  }
});

$("#candidate-list").addEventListener("click", async (event) => {
  const editId = event.target.dataset.edit;
  const activeId = event.target.dataset.active;
  const uploadId = event.target.dataset.upload;
  if (editId) {
    const candidate = state.candidates.find((item) => item.id === editId);
    $("#candidate-id").value = candidate.id;
    $("#candidate-name").value = candidate.name;
    $("#candidate-position").value = candidate.positionId;
    $("#candidate-section").value = candidate.section;
    $("#candidate-year").value = String(candidate.yearLevel);
    $("#candidate-platform").value = candidate.platform;
    $("#candidate-party").value = candidate.party || "";
    $("#candidate-order").value = candidate.order || 1;
    $("#candidate-active").checked = candidate.active;
  }
  if (activeId) {
    const candidate = state.candidates.find((item) => item.id === activeId);
    await api("set_candidate_active", activeId, !candidate.active);
    await refresh();
  }
  if (uploadId) {
    await api("select_and_upload_candidate_image", uploadId);
    await refresh();
  }
});

$("#voter-search").addEventListener("input", async (event) => {
  state.voters = await api("search_voters", event.target.value);
  renderVoters();
});

$("#voter-list").addEventListener("click", async (event) => {
  const uid = event.target.dataset.voter;
  if (!uid) return;
  const voter = state.voters.find((item) => item.id === uid);
  await api("set_voter_eligibility", uid, !voter.eligible);
  await refresh();
});

$("#voter-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("create_voter", {
      email: $("#voter-email").value,
      password: $("#voter-password").value,
      studentNo: $("#voter-student-no").value,
      fullName: $("#voter-full-name").value,
      yearLevel: $("#voter-year").value,
      section: $("#voter-section").value,
      eligible: true
    });
    $("#voter-form").reset();
    await refresh();
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelectorAll("[data-transition]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await api("transition_election", button.dataset.transition);
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
});

$("#publish-button").addEventListener("click", async () => {
  try {
    await api("publish_results");
    await refresh();
  } catch (error) {
    setStatus(error.message, true);
  }
});

$("#export-votes").addEventListener("click", async () => {
  try {
    $("#csv-output").value = await api("export_votes_csv");
  } catch (error) {
    setStatus(error.message, true);
  }
});

$("#claim-button").addEventListener("click", async () => {
  try {
    const result = await api("set_admin_claim", $("#admin-identifier").value);
    setStatus(`Admin claim set for ${result.email || result.uid}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

window.addEventListener("pywebviewready", refresh);
