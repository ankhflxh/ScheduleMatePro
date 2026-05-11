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
let currentSuggestion = null;

const roomId = new URLSearchParams(window.location.search).get("roomId");
if (!roomId) {
  entriesContainer.innerHTML = "<p style='color:red;'>Room ID missing.</p>";
  throw new Error("Missing roomId");
}

let currentUserId = null;
let roomCreatorId = null;
// We no longer need roomInterval here for calculation, strictly display if needed
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
      creatorControls.style.display = "block"; // Show Button
      if (confirmBtn) confirmBtn.onclick = showConfirmModal;
    } else {
      creatorControls.style.display = "none"; // Hide Button
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

    // Set Loading State
    const originalText = confirmOkBtn.textContent;
    confirmOkBtn.textContent = "Confirming...";
    confirmOkBtn.disabled = true;

    const [meeting_day, start_time] = mostCommonTime.split(" ");

    // 🟢 UPDATED: No longer calculating end_time here. Backend handles it.
    fetch(`/api/meetings/${roomId}`, {
      method: "POST",
      ...API_HEADERS, // Use spread to include headers
      body: JSON.stringify({
        meeting_day: meeting_day,
        start_time: start_time,
        location: location,
      }),
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
        // Reset Button
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
// Ensure headers are correct for GET requests
const GET_HEADERS = {
  headers: { "X-Auth-Token": token },
};

Promise.all([
  fetch("/api/users/me", GET_HEADERS).then((res) => res.json()),
  fetch(`/api/rooms/${roomId}`, GET_HEADERS).then((res) => res.json()),
])
  .then(([user, room]) => {
    currentUserId = String(user.user_id);
    roomCreatorId = String(room.creator_id);
    fetchAvailabilities();
  })
  .catch((err) => {
    console.error("Initialization error:", err);
    entriesContainer.innerHTML = "<p>Please log in to view this room.</p>";
  });

function fetchAvailabilities() {
  if (suggestedTimeEl) suggestedTimeEl.textContent = "Loading...";

  fetch(`/api/availability/${roomId}`, GET_HEADERS)
    .then((res) => res.json())
    .then((entries) => {
      renderEntries(entries);
      suggestMeeting(entries);
      showConfirmIfEligible(entries);
    })
    .catch((err) => {
      console.error("Error fetching entries:", err);
    });

  fetch(`/api/meetings/confirmed?roomId=${roomId}`, GET_HEADERS)
    .then((res) => {
      if (!res.ok) throw new Error("No confirmed meeting");
      return res.json();
    })
    .catch((err) => {
      // It's normal to have no confirmed meeting yet, suppress error
    });
}

// ----------------------------------------------------
// RENDER ENTRIES
// ----------------------------------------------------
function renderEntries(entries) {
  entriesContainer.innerHTML = "";

  const userEntry = entries.find(
    (entry) => String(entry.user_id) === currentUserId,
  );

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
    const timeRange = `${entry.start_time} - ${entry.end_time}`;
    div.textContent = `👤 ${entry.username} — 🕒 ${entry.day}, ${timeRange} @ ${entry.location}`;
    entriesContainer.appendChild(div);
  });
}

// ----------------------------------------------------
// SUGGEST MEETING LOGIC
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

  // 1. Best Time
  const sortedTimes = Object.entries(countMap).sort((a, b) => b[1] - a[1]);

  if (sortedTimes.length > 0) {
    mostCommonTime = sortedTimes[0][0];
    const maxTimeVotes = sortedTimes[0][1];

    if (suggestedTimeEl) {
      suggestedTimeEl.innerHTML = `${mostCommonTime} <span style="font-weight:normal; color:#64748b; font-size:0.85em">(${maxTimeVotes} votes)</span>`;
    }
  } else {
    if (suggestedTimeEl) suggestedTimeEl.textContent = "No data yet";
  }

  // 2. Best Location
  if (preferredLocation) {
    mostCommonPlace = preferredLocation;
    if (suggestedLocationEl) {
      suggestedLocationEl.innerHTML = `${preferredLocation} <span style="font-weight:normal; color:#64748b; font-size:0.85em">(${maxLocationVotes} votes)</span>`;
    }
  } else {
    if (suggestedLocationEl) suggestedLocationEl.textContent = "No data yet";
  }
}

if (String(currentRoom?.creator_id) === String(loggedInUserId)) {
  suggestBtn.style.display = "block";
}

suggestBtn.addEventListener("click", async () => {
  suggestBtn.disabled = true;
  suggestBtn.textContent = "✨ Thinking...";
  suggestionCard.style.display = "none";

  try {
    const res = await fetch(`/api/suggest/${roomId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    suggestBtn.textContent = "✨ Suggest Best Time with AI";
  }
});

// Auto-fill the form when creator accepts suggestion
acceptBtn.addEventListener("click", () => {
  if (!currentSuggestion) return;
  const s = currentSuggestion;

  // Auto-fill your existing form fields (adjust IDs to match yours)
  const daySelect = document.getElementById("meetingDay");
  const timeInput = document.getElementById("startTime");
  const locationInput = document.getElementById("location");

  if (daySelect) daySelect.value = s.suggested_day;
  if (timeInput) timeInput.value = s.suggested_start_time;
  if (locationInput && s.preferred_location)
    locationInput.value = s.preferred_location;

  suggestionCard.style.display = "none";
});

dismissBtn.addEventListener("click", () => {
  suggestionCard.style.display = "none";
  currentSuggestion = null;
});
