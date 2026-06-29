const state = {
  positions: [],
  election: null,
  candidates: [],
  voters: [],
  tallies: null,
  charts: {},
  candidateImage: null
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const $ = (selector) => document.querySelector(selector);

function setStatus(message, isError = false) {
  const line = $("#status-line");
  line.textContent = message;
  line.classList.toggle("error", isError);
}

function setCandidateMessage(message, isError = false) {
  const line = $("#candidate-message");
  line.textContent = message;
  line.style.color = isError ? "var(--danger)" : "var(--teal-200)";
}

function setPhotoPreview(url) {
  const preview = $("#candidate-photo-preview");
  if (url) {
    preview.src = url;
    preview.classList.remove("is-empty");
  } else {
    preview.removeAttribute("src");
    preview.classList.add("is-empty");
  }
}

function resetCandidateForm() {
  $("#candidate-form").reset();
  $("#candidate-id").value = "";
  $("#candidate-form-title").textContent = "Add candidate";
  $("#candidate-active").checked = true;
  $("#candidate-order").value = "1";
  $("#candidate-photo-error").textContent = "";
  state.candidateImage = null;
  setPhotoPreview("");
  setCandidateMessage("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
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
    datasets: [{ label, data, backgroundColor: ["#d325e6", "#7c5cff", "#a3e635", "#ec5cf6", "#9a82ff", "#fb7185"] }]
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
      plugins: { legend: { labels: { color: "#f2eeff" } } },
      scales: type === "bar" ? {
        x: { ticks: { color: "#b8a8ff" }, grid: { color: "rgba(168,142,255,.12)" } },
        y: { beginAtZero: true, ticks: { color: "#b8a8ff", precision: 0 }, grid: { color: "rgba(168,142,255,.12)" } }
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

function positionName(positionId) {
  return state.positions.find((position) => position.id === positionId)?.name || positionId;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderCandidates() {
  const list = $("#candidate-list");
  list.replaceChildren();

  if (state.candidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "state-block";
    empty.innerHTML = "<strong>No candidates yet</strong><span>Add your first candidate with the form. Saved candidates and photos appear instantly on the student ballot.</span>";
    list.append(empty);
    return;
  }

  state.candidates.forEach((candidate) => {
    const item = document.createElement("article");
    item.className = "item with-photo";
    const avatar = candidate.photoURL
      ? `<img class="item-photo" src="${escapeHtml(candidate.photoURL)}" alt="" />`
      : `<span class="item-photo-empty" aria-hidden="true">${escapeHtml((candidate.name || "?").slice(0, 1).toUpperCase())}</span>`;
    item.innerHTML = `
      ${avatar}
      <div>
        <strong>${escapeHtml(candidate.name)}</strong>
        <small>${escapeHtml(positionName(candidate.positionId))} · ${escapeHtml(candidate.section)} · Year ${escapeHtml(candidate.yearLevel)}</small>
        <small>${candidate.active ? "Active" : "Inactive"} · order ${escapeHtml(candidate.order)}${candidate.goals ? " · has goals" : ""}</small>
      </div>
      <div class="actions stack">
        <button type="button" class="ghost" data-edit="${escapeHtml(candidate.id)}">Edit</button>
        <button type="button" class="ghost" data-active="${escapeHtml(candidate.id)}">${candidate.active ? "Deactivate" : "Activate"}</button>
      </div>
    `;
    list.append(item);
  });
}

function renderVoters() {
  const list = $("#voter-list");
  list.replaceChildren();

  if (state.voters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "state-block";
    empty.innerHTML = "<strong>No voters found</strong><span>Voters appear here after they self-register, or create one with the form.</span>";
    list.append(empty);
    return;
  }

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

$("#candidate-clear").addEventListener("click", resetCandidateForm);

$("#candidate-photo").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  const errorLine = $("#candidate-photo-error");

  if (!file) {
    state.candidateImage = null;
    setPhotoPreview("");
    errorLine.textContent = "";
    return;
  }

  if (!file.type.startsWith("image/")) {
    errorLine.textContent = "Upload an image file.";
    event.target.value = "";
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    errorLine.textContent = "Image must be 2MB or smaller.";
    event.target.value = "";
    return;
  }

  errorLine.textContent = "";
  try {
    state.candidateImage = await readFileAsDataUrl(file);
    setPhotoPreview(state.candidateImage);
  } catch (error) {
    errorLine.textContent = error.message;
  }
});

$("#candidate-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter || $("#candidate-form button[type='submit']");
  if (button) button.disabled = true;
  setCandidateMessage("Saving candidate...");

  try {
    await api("save_candidate", {
      id: $("#candidate-id").value,
      name: $("#candidate-name").value,
      positionId: $("#candidate-position").value,
      section: $("#candidate-section").value,
      yearLevel: $("#candidate-year").value,
      platform: $("#candidate-platform").value,
      goals: $("#candidate-goals").value,
      bio: $("#candidate-bio").value,
      party: $("#candidate-party").value,
      order: $("#candidate-order").value,
      active: $("#candidate-active").checked,
      image: state.candidateImage || ""
    });
    resetCandidateForm();
    setCandidateMessage("Candidate saved.");
    await refresh();
  } catch (error) {
    setCandidateMessage(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
});

$("#candidate-list").addEventListener("click", async (event) => {
  const editId = event.target.dataset.edit;
  const activeId = event.target.dataset.active;
  if (editId) {
    const candidate = state.candidates.find((item) => item.id === editId);
    if (!candidate) return;
    $("#candidate-id").value = candidate.id;
    $("#candidate-form-title").textContent = "Edit candidate";
    $("#candidate-name").value = candidate.name;
    $("#candidate-position").value = candidate.positionId;
    $("#candidate-section").value = candidate.section;
    $("#candidate-year").value = String(candidate.yearLevel);
    $("#candidate-platform").value = candidate.platform;
    $("#candidate-goals").value = candidate.goals || "";
    $("#candidate-bio").value = candidate.bio || "";
    $("#candidate-party").value = candidate.party || "";
    $("#candidate-order").value = candidate.order || 1;
    $("#candidate-active").checked = candidate.active;
    $("#candidate-photo").value = "";
    state.candidateImage = null;
    setPhotoPreview(candidate.photoURL || "");
    setCandidateMessage("Editing — leave photo empty to keep the current image.");
  }
  if (activeId) {
    const candidate = state.candidates.find((item) => item.id === activeId);
    await api("set_candidate_active", activeId, !candidate.active);
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
