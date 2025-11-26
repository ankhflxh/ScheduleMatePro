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

const roomId = new URLSearchParams(window.location.search).get("roomId");
if (!roomId) {
  entriesContainer.innerHTML = "<p style='color:red;'>Room ID missing.</p>";
  throw new Error("Missing roomId");
}

let currentUserId = null;
let roomCreatorId = null;
let roomInterval = 1; // Default to 1 hour
let mostCommonTime = "";
let mostCommonPlace = "";
const token = localStorage.getItem("sm_token");

const API_HEADERS = {
  credentials: "include",
  headers: {
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

// 🟢 FIXED: Calculate End Time based on Interval
if (confirmOkBtn) {
  confirmOkBtn.onclick = () => {
    const location = confirmLocationInput.value.trim();
    if (!location) {
      alert("Location cannot be empty.");
      return;
    }

    const [meeting_day, start_time] = mostCommonTime.split(" ");

    // 1. Calculate End Time
    // Parse "11:00" into hours and minutes
    const [startH, startM] = start_time.split(":").map(Number);

    const date = new Date();
    date.setHours(startH, startM, 0, 0);
    // Add the room's interval (in hours)
    date.setHours(date.getHours() + roomInterval);

    // Format back to HH:MM
    const endH = String(date.getHours()).padStart(2, "0");
    const endM = String(date.getMinutes()).padStart(2, "0");
    const end_time = `${endH}:${endM}`;

    fetch(`/api/meetings/${roomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      },
      body: JSON.stringify({
        meeting_day: meeting_day,
        start_time: start_time,
        end_time: end_time, // Sending calculated end time
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

if (confirmedCloseBtn) {
  confirmedCloseBtn.onclick = () => {
    if (confirmedModal) confirmedModal.style.display = "none";
    window.location.reload();
  };
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
Promise.all([
  fetch("/api/users/me", API_HEADERS).then((res) => res.json()),
  fetch(`/api/rooms/${roomId}`, API_HEADERS).then((res) => res.json()),
])
  .then(([user, room]) => {
    currentUserId = String(user.user_id);
    roomCreatorId = String(room.creator_id);
    // 🟢 Save the room interval
    roomInterval = parseInt(room.meeting_interval) || 1;

    fetchAvailabilities();
  })
  .catch((err) => {
    console.error("Initialization error:", err);
  });

function fetchAvailabilities() {
  if (suggestedTimeEl) suggestedTimeEl.textContent = "Loading...";

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

// ----------------------------------------------------
// RENDER ENTRIES
// ----------------------------------------------------
function renderEntries(entries) {
  entriesContainer.innerHTML = "";

  const userEntry = entries.find(
    (entry) => String(entry.user_id) === currentUserId
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
  const locations = new Set();
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
    locations.add(location);
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
