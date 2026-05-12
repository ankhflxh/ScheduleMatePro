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
const suggestionCard = document.getElementById("suggestionCard");
const acceptBtn = document.getElementById("acceptSuggestion");
const dismissBtn = document.getElementById("dismissSuggestion");
const shareSuggestionBtn = document.getElementById("shareSuggestion");
let currentSuggestion = null;

const roomId = new URLSearchParams(window.location.search).get("roomId");
if (!roomId) {
  entriesContainer.innerHTML = "<p style='color:red;'>Room ID missing.</p>";
  throw new Error("Missing roomId");
}

let currentUserId = null;
let roomCreatorId = null;
let mostCommonTime = "";
let mostCommonPlace = "";
const token = localStorage.getItem("sm_token");

const API_HEADERS = {
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-Auth-Token": token,
  },
};

// ----------------------------------------------------
// CREATOR UI TOGGLE
// ----------------------------------------------------
function showConfirmIfEligible(entries) {
  const hasSuggestedTime = mostCommonTime && mostCommonPlace;
  const isCreator = String(currentUserId) === String(roomCreatorId);

  if (creatorControls) {
    if (isCreator && entries.length > 0 && hasSuggestedTime) {
      creatorControls.style.display = "block";
      if (confirmBtn) confirmBtn.onclick = showConfirmModal;
    } else {
      creatorControls.style.display = "none";
    }
  }
}

// ----------------------------------------------------
// MODAL HANDLERS
// ----------------------------------------------------
function showConfirmModal() {
  const [day, time] = mostCommonTime.split(" ");
  if (confirmModal && confirmPromptText && confirmLocationInput) {
    confirmPromptText.textContent = `Confirm meeting at ${day} ${time}?`;
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
      .then((res) => {
        if (!res.ok) throw new Error("Failed to confirm meeting.");
        return res.json();
      })
      .then(() => {
        if (confirmModal) confirmModal.style.display = "none";
        if (confirmedModal) confirmedModal.style.display = "flex";
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to confirm meeting. Check console.");
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

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
const GET_HEADERS = { headers: { "X-Auth-Token": token } };

Promise.all([
  fetch("/api/users/me", GET_HEADERS).then((res) => res.json()),
  fetch(`/api/rooms/${roomId}`, GET_HEADERS).then((res) => res.json()),
])
  .then(([user, room]) => {
    currentUserId = String(user.user_id);
    roomCreatorId = String(room.creator_id);
    if (currentUserId === roomCreatorId) suggestBtn.style.display = "flex";
    fetchAvailabilities();
  })
  .catch((err) => {
    console.error("Initialization error:", err);
    entriesContainer.innerHTML = "<p>Please log in to view this room.</p>";
  });

function fetchAvailabilities() {
  fetch(`/api/availability/${roomId}`, GET_HEADERS)
    .then((res) => res.json())
    .then((entries) => {
      renderEntries(entries);
      suggestMeeting(entries);
      showConfirmIfEligible(entries);
    })
    .catch((err) => console.error("Error fetching entries:", err));

  fetch(`/api/meetings/confirmed?roomId=${roomId}`, GET_HEADERS)
    .then((res) => {
      if (!res.ok) throw new Error("No confirmed meeting");
      return res.json();
    })
    .catch(() => {});
}

// ----------------------------------------------------
// RENDER ENTRIES
// ----------------------------------------------------
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

// ----------------------------------------------------
// SUGGEST MEETING — computes silently, does NOT update UI
// Values only appear in insights after creator clicks Accept
// ----------------------------------------------------
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

  const sortedTimes = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
  if (sortedTimes.length > 0) mostCommonTime = sortedTimes[0][0];
  if (preferredLocation) mostCommonPlace = preferredLocation;
}

// Called only after "Accept & Auto-fill" — reveals the insight values
function revealInsights(time, location) {
  if (suggestedTimeEl) {
    suggestedTimeEl.textContent = time;
    suggestedTimeEl.classList.remove("insights-placeholder");
  }
  if (suggestedLocationEl) {
    suggestedLocationEl.textContent = location;
    suggestedLocationEl.classList.remove("insights-placeholder");
  }
  const hint = document.getElementById("insights-hint");
  if (hint) hint.classList.add("hidden");
}

// ----------------------------------------------------
// AI SUGGEST BUTTON
// ----------------------------------------------------
suggestBtn.addEventListener("click", async () => {
  suggestBtn.disabled = true;
  suggestBtn.innerHTML =
    '<span class="material-icons">hourglass_top</span> Thinking...';
  suggestionCard.style.display = "none";

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
    const s = currentSuggestion;

    document.getElementById("suggestionBody").textContent =
      `${s.suggested_day} · ${s.suggested_start_time} – ${s.suggested_end_time}` +
      (s.preferred_location ? ` · ${s.preferred_location}` : "");
    document.getElementById("suggestionCoverage").textContent =
      `${s.members_covered}/${s.total_members} members`;
    document.getElementById("suggestionReasoning").textContent = s.reasoning;

    suggestionCard.style.display = "block";
  } catch (err) {
    alert("Something went wrong. Please try again.");
    console.error(err);
  } finally {
    suggestBtn.disabled = false;
    suggestBtn.innerHTML =
      '<span class="material-icons">auto_awesome</span> Suggest with AI';
  }
});

// ----------------------------------------------------
// ACCEPT — reveals insights panel and enables Finalize
// ----------------------------------------------------
acceptBtn.addEventListener("click", () => {
  if (!currentSuggestion) return;
  const s = currentSuggestion;

  mostCommonTime = `${s.suggested_day} ${s.suggested_start_time}`;
  mostCommonPlace = s.preferred_location || mostCommonPlace;

  revealInsights(mostCommonTime, mostCommonPlace);

  if (creatorControls) creatorControls.style.display = "block";
  if (confirmBtn) confirmBtn.onclick = showConfirmModal;

  suggestionCard.style.display = "none";
});

// ----------------------------------------------------
// SHARE — sends AI suggestion reasoning to room via push
// ----------------------------------------------------
shareSuggestionBtn.addEventListener("click", async () => {
  if (!currentSuggestion) return;
  const s = currentSuggestion;

  const originalHTML = shareSuggestionBtn.innerHTML;
  shareSuggestionBtn.disabled = true;
  shareSuggestionBtn.innerHTML =
    '<span class="material-icons">hourglass_top</span> Sharing...';

  try {
    const res = await fetch(`/api/suggest/${roomId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      body: JSON.stringify({ suggestion: s }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not share suggestion.");
      return;
    }

    shareSuggestionBtn.innerHTML =
      '<span class="material-icons">check</span> Shared!';
    setTimeout(() => {
      shareSuggestionBtn.innerHTML = originalHTML;
      shareSuggestionBtn.disabled = false;
    }, 2500);
  } catch (err) {
    alert("Something went wrong sharing the suggestion.");
    console.error(err);
    shareSuggestionBtn.innerHTML = originalHTML;
    shareSuggestionBtn.disabled = false;
  }
});

// ----------------------------------------------------
// DISMISS
// ----------------------------------------------------
dismissBtn.addEventListener("click", () => {
  suggestionCard.style.display = "none";
  currentSuggestion = null;
});
