// File: Frontend/Rooms/MeetingScheduler/scheduler.js

const entriesContainer = document.querySelector("#entries");
const suggestedTimeEl = document.querySelector("#suggested-time-text");
const suggestedLocationEl = document.querySelector("#suggested-location-text");
const creatorControls = document.getElementById("creator-controls");
const editBtn = document.getElementById("editAvailabilityBtn");
const confirmBtn = document.getElementById("confirmMeetingBtn");
const confirmModal = document.getElementById("confirmModal");
const confirmPromptText = document.getElementById("confirmPromptText");
const confirmLocationInput = document.getElementById("confirmLocationInput");
const confirmOkBtn = document.getElementById("confirmOkBtn");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmedModal = document.getElementById("confirmedModal");
const confirmedCloseBtn = document.getElementById("confirmedCloseBtn");
const suggestBtn = document.getElementById("suggestBtn");
const viewSuggestionBtn = document.getElementById("viewSuggestionBtn");
const suggestionModal = document.getElementById("suggestionModal");
const modalAcceptBtn = document.getElementById("modalAcceptBtn");
const modalShareBtn = document.getElementById("modalShareBtn");
const modalDismissBtn = document.getElementById("modalDismissBtn");
const modalMemberInPersonBtn = document.getElementById(
  "modalMemberInPersonBtn",
);
const modalMemberOnlineBtn = document.getElementById("modalMemberOnlineBtn");
const modalMemberDeclineBtn = document.getElementById("modalMemberDeclineBtn");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const creatorModalActions = document.getElementById("creatorModalActions");
const memberModalActions = document.getElementById("memberModalActions");
const memberAlreadyResponded = document.getElementById(
  "memberAlreadyResponded",
);
const responsesPanel = document.getElementById("responsesPanel");
const responsesList = document.getElementById("responsesList");

let currentSuggestion = null;
let currentUserId = null;
let roomCreatorId = null;
let mostCommonTime = "";
let mostCommonPlace = "";
let responsePollInterval = null;

const params = new URLSearchParams(window.location.search);
const roomId = params.get("roomId");
const fromNotification = params.get("fromNotification") === "1";

if (!roomId) {
  entriesContainer.innerHTML = "<p style='color:red;'>Room ID missing.</p>";
  throw new Error("Missing roomId");
}

const token = localStorage.getItem("sm_token");
const GET_HEADERS = { headers: { "X-Auth-Token": token } };
const API_HEADERS = {
  credentials: "include",
  headers: { "Content-Type": "application/json", "X-Auth-Token": token },
};

// ─── OPEN / CLOSE MODAL ──────────────────────────────────────────
function openSuggestionModal() {
  if (suggestionModal) suggestionModal.style.display = "flex";
}
function closeSuggestionModal() {
  if (suggestionModal) suggestionModal.style.display = "none";
}
if (modalCloseBtn)
  modalCloseBtn.addEventListener("click", closeSuggestionModal);
// Close when clicking the dark backdrop
if (suggestionModal) {
  suggestionModal.addEventListener("click", (e) => {
    if (e.target === suggestionModal) closeSuggestionModal();
  });
}

// ─── POPULATE MODAL WITH SUGGESTION DATA ─────────────────────────
function populateSuggestionModal(s) {
  document.getElementById("modalSuggestionBody").textContent =
    `${s.suggested_day} · ${s.suggested_start_time} – ${s.suggested_end_time}` +
    (s.preferred_location ? ` · ${s.preferred_location}` : "");
  document.getElementById("modalCoverage").textContent =
    `${s.members_covered}/${s.total_members} members`;
  document.getElementById("modalSuggestionReasoning").textContent = s.reasoning;
}

// ─── INITIALIZATION ───────────────────────────────────────────────
Promise.all([
  fetch("/api/users/me", GET_HEADERS).then((r) => r.json()),
  fetch(`/api/rooms/${roomId}`, GET_HEADERS).then((r) => r.json()),
])
  .then(([user, room]) => {
    currentUserId = String(user.user_id);
    roomCreatorId = String(room.creator_id);

    if (currentUserId === roomCreatorId) {
      suggestBtn.style.display = "flex";
    }

    fetchAvailabilities();
    loadSharedSuggestion();
  })
  .catch((err) => {
    console.error("Initialization error:", err);
    entriesContainer.innerHTML = "<p>Please log in to view this room.</p>";
  });

// ─── LOAD SHARED SUGGESTION FROM DB ──────────────────────────────
async function loadSharedSuggestion() {
  try {
    const res = await fetch(`/api/suggest/${roomId}/shared`, GET_HEADERS);
    const data = await res.json();
    if (!data.suggestion) return;

    currentSuggestion = data.suggestion;
    const isCreator = currentUserId === roomCreatorId;
    const myResponse = data.myResponse; // "accepted" | "declined" | null

    populateSuggestionModal(data.suggestion);

    if (isCreator) {
      // Show creator actions in modal
      if (creatorModalActions) creatorModalActions.style.display = "flex";
      if (memberModalActions) memberModalActions.style.display = "none";
      if (memberAlreadyResponded) memberAlreadyResponded.style.display = "none";
      // Show responses panel
      if (responsesPanel) responsesPanel.style.display = "block";
      loadResponses();
      startResponsePolling();
      // Auto-open modal if they just generated it (no fromNotification needed for creator)
    } else {
      // Member: show "View AI Suggestion" button
      if (viewSuggestionBtn) viewSuggestionBtn.style.display = "flex";

      if (myResponse) {
        // Already responded — show that state in modal
        if (memberModalActions) memberModalActions.style.display = "none";
        if (creatorModalActions) creatorModalActions.style.display = "none";
        if (memberAlreadyResponded) {
          const modeLabels = {
            in_person: "🟢 In Person",
            online: "🔵 Online",
            cant_attend: "❌ Can't Attend",
          };
          const label = modeLabels[data.myAttendanceMode] || myResponse;
          memberAlreadyResponded.textContent = `You responded: ${label}. Tap "View AI Suggestion" to change.`;
          memberAlreadyResponded.style.display = "block";
        }
      } else {
        // Has not responded yet
        if (memberModalActions) memberModalActions.style.display = "flex";
        if (creatorModalActions) creatorModalActions.style.display = "none";
        if (memberAlreadyResponded)
          memberAlreadyResponded.style.display = "none";
      }

      // Show RSVP panel for members too
      if (responsesPanel) responsesPanel.style.display = "block";
      loadResponses();
      startResponsePolling();

      // Auto-open the modal if they tapped the push notification
      if (fromNotification) openSuggestionModal();
    }
  } catch (err) {
    console.error("Could not load shared suggestion:", err);
  }
}

// ─── VIEW SUGGESTION BUTTON (members) ────────────────────────────
if (viewSuggestionBtn) {
  viewSuggestionBtn.addEventListener("click", openSuggestionModal);
}

// ─── CREATOR: SUGGEST BUTTON ─────────────────────────────────────
suggestBtn.addEventListener("click", async () => {
  suggestBtn.disabled = true;
  suggestBtn.innerHTML =
    '<span class="material-icons">hourglass_top</span> Thinking...';

  try {
    const res = await fetch(`/api/suggest/${roomId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not generate suggestion.");
      return;
    }

    currentSuggestion = data.suggestion;
    populateSuggestionModal(data.suggestion);

    // Creator sees their own actions
    if (creatorModalActions) creatorModalActions.style.display = "flex";
    if (memberModalActions) memberModalActions.style.display = "none";
    if (memberAlreadyResponded) memberAlreadyResponded.style.display = "none";

    openSuggestionModal();
  } catch (err) {
    alert("Something went wrong. Please try again.");
    console.error(err);
  } finally {
    suggestBtn.disabled = false;
    suggestBtn.innerHTML =
      '<span class="material-icons">auto_awesome</span> Suggest with AI';
  }
});

// ─── CREATOR: ACCEPT & AUTO-FILL ─────────────────────────────────
if (modalAcceptBtn) {
  modalAcceptBtn.addEventListener("click", () => {
    if (!currentSuggestion) return;
    const s = currentSuggestion;
    mostCommonTime = `${s.suggested_day} ${s.suggested_start_time}`;
    mostCommonPlace = s.preferred_location || mostCommonPlace;

    // Populate insights panel
    if (suggestedTimeEl) {
      suggestedTimeEl.textContent = mostCommonTime;
      suggestedTimeEl.classList.remove("insights-placeholder");
    }
    if (suggestedLocationEl) {
      suggestedLocationEl.textContent = mostCommonPlace;
      suggestedLocationEl.classList.remove("insights-placeholder");
    }
    const hint = document.getElementById("insights-hint");
    if (hint) hint.classList.add("hidden");

    // Show finalize button
    if (creatorControls) creatorControls.style.display = "block";
    if (confirmBtn) confirmBtn.onclick = showConfirmModal;

    closeSuggestionModal();
  });
}

// ─── CREATOR: SHARE WITH ROOM ─────────────────────────────────────
if (modalShareBtn) {
  modalShareBtn.addEventListener("click", async () => {
    if (!currentSuggestion) return;
    const original = modalShareBtn.innerHTML;
    modalShareBtn.disabled = true;
    modalShareBtn.innerHTML =
      '<span class="material-icons">hourglass_top</span> Sharing...';

    try {
      const res = await fetch(`/api/suggest/${roomId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Auth-Token": token },
        body: JSON.stringify({ suggestion: currentSuggestion }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not share.");
        return;
      }

      modalShareBtn.innerHTML =
        '<span class="material-icons">check</span> Shared!';
      if (responsesPanel) {
        responsesPanel.style.display = "block";
        loadResponses();
        startResponsePolling();
      }
      setTimeout(() => {
        modalShareBtn.innerHTML = original;
        modalShareBtn.disabled = false;
      }, 2500);
    } catch (err) {
      alert("Something went wrong sharing the suggestion.");
      console.error(err);
      modalShareBtn.innerHTML = original;
      modalShareBtn.disabled = false;
    }
  });
}

// ─── CREATOR: DISMISS ────────────────────────────────────────────
if (modalDismissBtn) {
  modalDismissBtn.addEventListener("click", () => {
    closeSuggestionModal();
    currentSuggestion = null;
  });
}

// ─── MEMBER: IN PERSON / ONLINE / CAN'T ATTEND ───────────────────
if (modalMemberInPersonBtn) {
  modalMemberInPersonBtn.addEventListener("click", () =>
    submitMemberResponse("accepted", "in_person"),
  );
}
if (modalMemberOnlineBtn) {
  modalMemberOnlineBtn.addEventListener("click", () =>
    submitMemberResponse("accepted", "online"),
  );
}
if (modalMemberDeclineBtn) {
  modalMemberDeclineBtn.addEventListener("click", () =>
    submitMemberResponse("cant_attend", "cant_attend"),
  );
}

async function submitMemberResponse(response, attendance_mode) {
  [modalMemberInPersonBtn, modalMemberOnlineBtn, modalMemberDeclineBtn].forEach(
    (b) => {
      if (b) b.disabled = true;
    },
  );

  try {
    const res = await fetch(`/api/suggest/${roomId}/respond`, {
      method: "POST",
      ...API_HEADERS,
      body: JSON.stringify({ response, attendance_mode }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Could not submit your response.");
      [
        modalMemberInPersonBtn,
        modalMemberOnlineBtn,
        modalMemberDeclineBtn,
      ].forEach((b) => {
        if (b) b.disabled = false;
      });
      return;
    }

    // Swap action buttons for confirmation message
    if (memberModalActions) memberModalActions.style.display = "none";
    if (memberAlreadyResponded) {
      const modeLabels = {
        in_person: "🟢 In Person",
        online: "🔵 Online",
        cant_attend: "❌ Can't Attend",
      };
      memberAlreadyResponded.textContent = `You responded: ${modeLabels[attendance_mode]}. You can change this anytime.`;
      memberAlreadyResponded.style.display = "block";
    }
    loadResponses();
  } catch (err) {
    console.error("Response error:", err);
    alert("Something went wrong. Please try again.");
    [
      modalMemberInPersonBtn,
      modalMemberOnlineBtn,
      modalMemberDeclineBtn,
    ].forEach((b) => {
      if (b) b.disabled = false;
    });
  }
}

// ─── CREATOR: LOAD & POLL MEMBER RESPONSES ───────────────────────
async function loadResponses() {
  if (!responsesList) return;
  try {
    const res = await fetch(`/api/suggest/${roomId}/responses`, GET_HEADERS);
    const data = await res.json();
    if (!res.ok || !data.responses) return;

    if (data.responses.length === 0) {
      responsesList.innerHTML = "<p class='no-responses'>No responses yet.</p>";
      return;
    }

    const modeLabels = {
      in_person: { emoji: "🟢", label: "In Person" },
      online: { emoji: "🔵", label: "Online" },
      cant_attend: { emoji: "❌", label: "Can't Attend" },
    };

    responsesList.innerHTML = data.responses
      .map((r) => {
        const mode = modeLabels[r.attendance_mode] || modeLabels["in_person"];
        return `<div class="response-item">
        <span class="response-name">${r.username}</span>
        <span class="response-badge ${r.attendance_mode}">${mode.emoji} ${mode.label}</span>
      </div>`;
      })
      .join("");
  } catch (err) {
    console.error("Load responses error:", err);
  }
}

function startResponsePolling() {
  if (responsePollInterval) clearInterval(responsePollInterval);
  responsePollInterval = setInterval(loadResponses, 15000);
}
window.addEventListener("beforeunload", () => {
  if (responsePollInterval) clearInterval(responsePollInterval);
});

// ─── FETCH AVAILABILITIES ─────────────────────────────────────────
function fetchAvailabilities() {
  fetch(`/api/availability/${roomId}`, GET_HEADERS)
    .then((r) => r.json())
    .then((entries) => {
      renderEntries(entries);
      suggestMeeting(entries);
      showConfirmIfEligible(entries);
    })
    .catch((err) => console.error("Error fetching entries:", err));
}

// ─── RENDER ENTRIES ───────────────────────────────────────────────
function renderEntries(entries) {
  entriesContainer.innerHTML = "";
  const userEntry = entries.find((e) => String(e.user_id) === currentUserId);

  if (editBtn) {
    editBtn.style.display = "inline-flex";
    if (userEntry) {
      editBtn.innerHTML = '<span class="material-icons">edit</span> Edit Mine';
      editBtn.onclick = () => {
        window.location.href = `../Availability/availability.html?roomId=${roomId}&edit=true`;
      };
    } else {
      editBtn.innerHTML =
        '<span class="material-icons">add_circle</span> Add Availability';
      editBtn.onclick = () => {
        window.location.href = `../Availability/availability.html?roomId=${roomId}`;
      };
    }
  }

  if (entries.length === 0) {
    entriesContainer.innerHTML = "<p>No availabilities submitted yet.</p>";
    return;
  }
  entries.forEach((entry) => {
    const div = document.createElement("div");
    div.classList.add("entry");
    div.textContent = `👤 ${entry.username} — 🕒 ${entry.day}, ${entry.start_time} - ${entry.end_time} @ ${entry.location}`;
    entriesContainer.appendChild(div);
  });
}

// ─── SILENT SUGGESTION CALC ───────────────────────────────────────
function suggestMeeting(entries) {
  const countMap = {};
  const locationMap = {};
  let maxLocationVotes = 0;
  let preferredLocation = "";

  entries.forEach(({ day, start_time, location }) => {
    const key = `${day} ${start_time}`;
    countMap[key] = (countMap[key] || 0) + 1;
    locationMap[location] = (locationMap[location] || 0) + 1;
    if (locationMap[location] > maxLocationVotes) {
      maxLocationVotes = locationMap[location];
      preferredLocation = location;
    }
  });

  const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) mostCommonTime = sorted[0][0];
  if (preferredLocation) mostCommonPlace = preferredLocation;
}

// ─── CREATOR CONFIRM FLOW ─────────────────────────────────────────
function showConfirmIfEligible(entries) {
  const isCreator = String(currentUserId) === String(roomCreatorId);
  if (creatorControls) {
    if (isCreator && entries.length > 0 && mostCommonTime && mostCommonPlace) {
      creatorControls.style.display = "block";
      if (confirmBtn) confirmBtn.onclick = showConfirmModal;
    } else {
      creatorControls.style.display = "none";
    }
  }
}

function showConfirmModal() {
  const [day, time] = mostCommonTime.split(" ");
  if (confirmModal && confirmPromptText && confirmLocationInput) {
    confirmPromptText.textContent = `Confirm meeting on ${day} at ${time}?`;
    confirmLocationInput.value = mostCommonPlace;
    confirmModal.style.display = "flex";
  }
}

if (confirmCancelBtn) {
  confirmCancelBtn.onclick = () => {
    if (confirmModal) confirmModal.style.display = "none";
  };
}

if (confirmOkBtn) {
  confirmOkBtn.onclick = () => {
    const location = confirmLocationInput.value.trim();
    if (!location) {
      alert("Location cannot be empty.");
      return;
    }

    const originalText = confirmOkBtn.textContent;
    confirmOkBtn.textContent = "Confirming...";
    confirmOkBtn.disabled = true;

    const [meeting_day, start_time] = mostCommonTime.split(" ");

    fetch(`/api/meetings/${roomId}`, {
      method: "POST",
      ...API_HEADERS,
      body: JSON.stringify({ meeting_day, start_time, location }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then(() => {
        if (confirmModal) confirmModal.style.display = "none";
        if (confirmedModal) confirmedModal.style.display = "flex";
        fetch(`/api/suggest/${roomId}/shared`, {
          method: "DELETE",
          headers: { "X-Auth-Token": token },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to confirm meeting.");
      })
      .finally(() => {
        confirmOkBtn.textContent = originalText;
        confirmOkBtn.disabled = false;
      });
  };
}

if (confirmedCloseBtn) {
  confirmedCloseBtn.onclick = () => {
    if (confirmedModal) confirmedModal.style.display = "none";
    window.location.reload();
  };
}
