// File: Frontend/Rooms/MeetingScheduler/scheduler.js

const entriesContainer = document.querySelector("#entries");
const suggestedTime = document.querySelector("#suggested-time");
const suggestedLocations = document.querySelector("#suggested-locations");
const editBtn = document.getElementById("editAvailabilityBtn");
const confirmBtn = document.getElementById("confirmMeetingBtn");
const confirmedBanner = document.getElementById("confirmed-meeting");

const confirmModal = document.getElementById("confirmModal");
const confirmPromptText = document.getElementById("confirmPromptText");
const confirmLocationInput = document.getElementById("confirmLocationInput");
const confirmOkBtn = document.getElementById("confirmOkBtn");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");

const confirmedModal = document.getElementById("confirmedModal");
const confirmedCloseBtn = document.getElementById("confirmedCloseBtn");

const roomId = new URLSearchParams(window.location.search).get("roomId");
if (!roomId) {
  entriesContainer.innerHTML = "<p style='color:red;'>Room ID missing.</p>";
  throw new Error("Missing roomId");
}

let currentUserId = null;
let roomCreatorId = null;
let mostCommonTime = ""; // Retained for modal logic
let mostCommonPlace = "";
let maxLocationVotes = 0;
const token = localStorage.getItem("sm_token");

const API_HEADERS = {
  credentials: "include",
  headers: {
    "X-Auth-Token": token,
  },
};

// ----------------------------------------------------
// Define function to enable confirmation button
// ----------------------------------------------------
function showConfirmIfEligible(entries) {
  const hasSuggestedTime = mostCommonTime && mostCommonPlace;
  // Ensure IDs are strings for reliable comparison
  const isCreator = String(currentUserId) === String(roomCreatorId);

  if (confirmBtn && isCreator && entries.length > 0 && hasSuggestedTime) {
    confirmBtn.style.display = "inline-flex";
    confirmBtn.onclick = showConfirmModal;
  } else if (confirmBtn) {
    // Hide button if not creator, no entries, or no suggestion
    confirmBtn.style.display = "none";
  }
}

// ----------------------------------------------------
// MODAL HANDLERS (Made Robust)
// ----------------------------------------------------

function showConfirmModal() {
  const [day, time] = mostCommonTime.split(" ");

  if (confirmModal && confirmPromptText && confirmLocationInput) {
    confirmPromptText.textContent = `Confirm meeting at ${day} ${time}?`;
    confirmLocationInput.value = mostCommonPlace;
    confirmModal.style.display = "flex";
  }
}

// FIX: Added null check for confirmCancelBtn
if (confirmCancelBtn) {
  confirmCancelBtn.onclick = () => {
    if (confirmModal) confirmModal.style.display = "none";
  };
}

// FIX: Added null check for confirmOkBtn
if (confirmOkBtn) {
  confirmOkBtn.onclick = () => {
    const location = confirmLocationInput.value.trim();
    if (!location) {
      alert("Location cannot be empty.");
      return;
    }

    // Destructure time and day from the most common suggestion
    const [meeting_day, start_time] = mostCommonTime.split(" ");
    // Note: end_time is still temporarily set to start_time as interval logic is complex here
    const end_time = start_time;

    fetch(`/api/meetings/${roomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      },
      body: JSON.stringify({
        meeting_day: meeting_day,
        start_time: start_time,
        end_time: end_time,
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
      });
  };
}

// FIX: Added null check for confirmedCloseBtn
if (confirmedCloseBtn) {
  confirmedCloseBtn.onclick = () => {
    if (confirmedModal) confirmedModal.style.display = "none";
    window.location.reload();
  };
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------

// ✅ Get current user & room details
Promise.all([
  fetch("/api/users/me", API_HEADERS).then((res) => res.json()),
  fetch(`/api/rooms/${roomId}`, API_HEADERS).then((res) => res.json()),
])
  .then(([user, room]) => {
    // Convert IDs to strings for reliable comparison everywhere
    currentUserId = String(user.user_id);
    roomCreatorId = String(room.creator_id);
    fetchAvailabilities();
  })
  .catch((err) => {
    console.error("Initialization error:", err);
  });

// ✅ Load availability entries
function fetchAvailabilities() {
  // 🟢 Clear suggestedTime element on every fetch
  if (suggestedTime) suggestedTime.textContent = "";

  fetch(`/api/availability/${roomId}`, API_HEADERS)
    .then((res) => res.json())
    .then((entries) => {
      renderEntries(entries);
      suggestMeeting(entries);
      showConfirmIfEligible(entries);
    })
    .catch((err) => {
      console.error("Error fetching entries:", err);
    });

  fetch(`/api/meetings/confirmed?roomId=${roomId}`, API_HEADERS)
    .then((res) => {
      if (!res.ok) throw new Error("No confirmed meeting");
      return res.json();
    })
    .catch((err) => {
      console.error("No confirmed meeting:", err);
    });
}

// ✅ Render each entry with user names
function renderEntries(entries) {
  entriesContainer.innerHTML = "";
  if (entries.length === 0) {
    entriesContainer.innerHTML = "<p>No availabilities submitted yet.</p>";
    return;
  }

  const userEntry = entries.find(
    (entry) => String(entry.user_id) === currentUserId
  );
  if (userEntry && editBtn) {
    editBtn.style.display = "inline-flex";
    editBtn.onclick = () => {
      window.location.href = `/rooms/availability/availability.html?roomId=${roomId}&edit=true`;
    };
  } else if (editBtn) {
    editBtn.style.display = "none";
  }

  entries.forEach((entry) => {
    const div = document.createElement("div");
    div.classList.add("entry");
    const timeRange = `${entry.start_time} - ${entry.end_time}`;
    // Use entry.username as provided by the updated backend route
    div.textContent = `👤 ${entry.username} — 🕒 ${entry.day}, ${timeRange} @ ${entry.location}`;
    entriesContainer.appendChild(div);
  });
}

// ✅ Count and suggest meeting time/location
function suggestMeeting(entries) {
  const countMap = {}; // Kept for mostCommonTime calculation
  const locationMap = {};
  const locations = new Set();
  let maxLocationVotes = 0;
  let preferredLocation = "";

  entries.forEach(({ day, start_time, location }) => {
    // Logic for mostCommonTime (kept)
    const key = `${day} ${start_time}`;
    countMap[key] = (countMap[key] || 0) + 1;

    // Logic for mostCommonPlace (kept)
    locationMap[location] = (locationMap[location] || 0) + 1;
    if (locationMap[location] > maxLocationVotes) {
      maxLocationVotes = locationMap[location];
      preferredLocation = location;
    }
    locations.add(location);
  });

  // 🟢 Suggestion Logic for Time (Calculate, but DO NOT display)
  const sortedTimes = Object.entries(countMap).sort((a, b) => b[1] - a[1]);

  if (sortedTimes.length > 0) {
    mostCommonTime = sortedTimes[0][0];
    // ❌ REMOVED: suggestedTime.textContent = `...`;
    // This line is intentionally removed to hide the suggested time display.
  }

  // 🟢 Display Logic for Location (Only show location)
  if (preferredLocation) {
    mostCommonPlace = preferredLocation;
    suggestedLocations.innerHTML = `
      📍 Suggested Location: <strong>${preferredLocation}</strong> 
      (${maxLocationVotes} people prefer)
    `;
  } else {
    suggestedLocations.textContent = `📍 Suggested Locations: ${[
      ...locations,
    ].join(", ")}`;
  }
}
