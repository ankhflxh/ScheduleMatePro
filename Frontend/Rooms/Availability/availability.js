// File: Frontend/Rooms/Availability/availability.js

const form = document.querySelector("#availability-form");
// Removed daySelect
const startSelect = document.querySelector("#start_time");
const endSelect = document.querySelector("#end_time");
const locationInput = document.querySelector("#location");

// NEW Element for day display
const constrainedDayDisplay = document.getElementById("constrainedDayDisplay");

// New elements for Creator logic
const creatorControls = document.getElementById("creatorControls");
const intervalSelect = document.getElementById("interval");
const preferredDaySelect = document.getElementById("preferred_day"); // Day select in creator form
const availabilityWrapper = document.getElementById("availabilityWrapper");
const disabledOverlay = document.getElementById("disabledOverlay");
const disabledMessage = document.getElementById("disabledMessage");

// Modal elements (unchanged)
const successModal = document.getElementById("successModal");
const errorModal = document.getElementById("errorModal");
const errorMessage = document.getElementById("errorMessage");
const viewSchedulerBtn = document.getElementById("viewSchedulerBtn");
const successExitBtn = document.getElementById("successExitBtn");
const errorOkBtn = document.getElementById("errorOkBtn");

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");
const token = localStorage.getItem("sm_token");

// 泙 NEW CONSTANT: University Buildings List
const UNIVERSITY_BUILDINGS = [
  "Library",
  "Future Technology Centre",
  "Portland Building",
  "Anglesea Building",
  "Park Building",
  "Eldon Building",
  "Dennis Sciama",
  "International College of Portsmouth",
];

// --- GLOBAL STATE ---
let currentUserId = null;
let roomData = null; // Store room data here after fetching
let intervalSet = false;
let daySet = false;

// --- HELPER FUNCTIONS ---

// Function to populate the location select dropdown
function populateLocationSelect() {
  if (!locationInput) return;
  UNIVERSITY_BUILDINGS.forEach((building) => {
    const option = document.createElement("option");
    option.value = building;
    option.textContent = building;
    locationInput.appendChild(option);
  });
}

// Function to generate time options for select fields
function generateTimeOptions(interval) {
  startSelect.innerHTML = '<option value="">-- Select Start Time --</option>';
  endSelect.innerHTML = '<option value="">-- Select End Time --</option>';

  const durationMinutes = interval * 60;

  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      const startHour = String(h).padStart(2, "0");
      const startMinute = String(m).padStart(2, "0");
      const startTimeStr = `${startHour}:${startMinute}`;

      let endTime = new Date(1970, 0, 1, h, m + durationMinutes);

      if (endTime.getHours() < 22) {
        const startOption = document.createElement("option");
        startOption.value = startTimeStr;
        startOption.textContent = startTimeStr;
        startSelect.appendChild(startOption);
      }
    }
  }
  updateEndTimes(durationMinutes);
}

// Function to ensure End Time corresponds to Start Time + Interval
function updateEndTimes(durationMinutes) {
  const startTimeStr = startSelect.value;
  endSelect.innerHTML = '<option value="">-- Select End Time --</option>';

  if (startTimeStr) {
    const [startHour, startMinute] = startTimeStr.split(":").map(Number);
    const startTime = new Date(1970, 0, 1, startHour, startMinute);

    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    const endHour = String(endTime.getHours()).padStart(2, "0");
    const endMinute = String(endTime.getMinutes()).padStart(2, "0");
    const endTimeStr = `${endHour}:${endMinute}`;

    if (
      endTime.getHours() < 22 ||
      (endTime.getHours() === 22 && endTime.getMinutes() === 0)
    ) {
      const endOption = document.createElement("option");
      endOption.value = endTimeStr;
      endOption.textContent = endTimeStr;
      endSelect.appendChild(endOption);
      endSelect.value = endTimeStr;
    }
  }
}

startSelect.addEventListener("change", () => {
  const currentInterval = parseInt(availabilityWrapper.dataset.interval) || 1;
  updateEndTimes(currentInterval * 60);
});

// --- CREATOR LIVE UNLOCK LOGIC ---
function checkCreatorInputs() {
  if (creatorControls.style.display === "none") return;

  const interval = parseInt(intervalSelect.value);
  const day = preferredDaySelect.value;

  if (interval && day) {
    disabledOverlay.style.display = "none";
    availabilityWrapper.dataset.interval = interval;
    generateTimeOptions(interval);
    if (constrainedDayDisplay) constrainedDayDisplay.textContent = day;
  } else {
    disabledOverlay.style.display = "flex";
  }
}

if (intervalSelect)
  intervalSelect.addEventListener("change", checkCreatorInputs);
if (preferredDaySelect)
  preferredDaySelect.addEventListener("change", checkCreatorInputs);

// --- INITIALIZATION AND MAIN LOGIC ---

if (!roomId) {
  showError("Room ID is missing. Please access this page via a room link.");
  form.style.display = "none";
  throw new Error("Missing roomId");
}

document.getElementById("exitButton").onclick = () => {
  // 🟢 FIX: Capitalized Rooms and EnterRooms for case-sensitive Render deployment
  window.location.href = `/Rooms/EnterRooms/enterrooms.html?roomId=${roomId}`;
};

function showError(message) {
  errorMessage.textContent = message;
  errorModal.style.display = "flex";
}

errorOkBtn.onclick = () => {
  errorModal.style.display = "none";
};

function showSuccessModal() {
  successModal.style.display = "flex";

  viewSchedulerBtn.onclick = () => {
    const timestamp = Date.now();
    // 🟢 FIX: Capitalized Rooms and MeetingScheduler
    window.location.href = `/Rooms/MeetingScheduler/scheduler.html?roomId=${roomId}&t=${timestamp}`;
  };

  successExitBtn.onclick = () => {
    successModal.style.display = "none";
    // 🟢 FIX: Capitalized Rooms and EnterRooms
    window.location.href = `/Rooms/EnterRooms/enterrooms.html?roomId=${roomId}`;
  };
}

async function initializeAvailabilityPage() {
  populateLocationSelect();

  try {
    const userRes = await fetch("/api/users/me", {
      headers: { "X-Auth-Token": token },
    });

    if (!userRes.ok) {
      showError("Session expired or unauthorized access. Please log in again.");
      return;
    }
    const userData = await userRes.json();
    currentUserId = userData.user_id;

    const roomRes = await fetch(`/api/rooms/${roomId}`, {
      headers: { "X-Auth-Token": token },
    });

    if (!roomRes.ok) {
      showError(
        "Failed to load room details. Room may not exist or network error."
      );
      return;
    }
    roomData = await roomRes.json();

    const creatorIdStr = String(roomData.creator_id);
    const currentUserIdStr = String(currentUserId);
    const isCreator = creatorIdStr === currentUserIdStr;

    intervalSet = !!roomData.meeting_interval;
    daySet = !!roomData.meeting_day;

    if (isCreator) {
      creatorControls.style.display = "block";
      constrainedDayDisplay.style.display = "none";
      constrainedDayDisplay.previousElementSibling.style.display = "none";

      if (intervalSet) intervalSelect.value = roomData.meeting_interval;
      if (daySet) preferredDaySelect.value = roomData.meeting_day;
    } else {
      creatorControls.style.display = "none";
    }

    if (!intervalSet || !daySet) {
      disabledOverlay.style.display = "flex";
    } else {
      disabledOverlay.style.display = "none";
      constrainedDayDisplay.style.display = "block";
      constrainedDayDisplay.previousElementSibling.style.display = "block";
      constrainedDayDisplay.textContent = roomData.meeting_day;

      availabilityWrapper.dataset.interval = roomData.meeting_interval;
      generateTimeOptions(roomData.meeting_interval);

      loadExistingAvailability(roomData.meeting_interval);
    }
  } catch (e) {
    console.error("Initialization failed:", e);
    showError("Failed to initialize page data.");
  }
}

// --- FIXED LOAD FUNCTION ---
async function loadExistingAvailability(interval) {
  const isEditMode = urlParams.get("edit") === "true";
  if (isEditMode) {
    // Added ?t=Date.now() to prevent caching
    fetch(`/api/availability/${roomId}/me?t=${Date.now()}`, {
      headers: { "X-Auth-Token": token },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          // FIXED: Strip seconds from time strings (e.g., "10:00:00" -> "10:00")
          // This ensures the value matches the <option> values exactly.
          const cleanStartTime = data.start_time
            ? data.start_time.substring(0, 5)
            : "";
          const cleanEndTime = data.end_time
            ? data.end_time.substring(0, 5)
            : "";

          startSelect.value = cleanStartTime;
          locationInput.value = data.location;

          // Manually trigger end time update
          updateEndTimes(interval * 60);

          // Set end time after options are regenerated
          endSelect.value = cleanEndTime;
        }
      })
      .catch((err) => {
        console.error("Error loading availability:", err);
      });
  }
}

// --- SUBMIT HANDLERS ---

async function submitCreatorPreferences(interval, day) {
  const res = await fetch(`/api/rooms/${roomId}/schedule-preference`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ interval, day }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Server error" }));
    showError(
      "Failed to save preferences: " + (errorData.error || "Server error")
    );
    return false;
  }
  roomData.meeting_interval = interval;
  roomData.meeting_day = day;
  return true;
}

async function submitAvailability(day, start_time, end_time, location) {
  const res = await fetch(`/api/availability/${roomId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ day, start_time, end_time, location }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));

    if (res.status === 403) {
      showError(
        errData.error || "Creator must set scheduling preferences first."
      );
    } else if (res.status === 401) {
      showError("You are not logged in.");
    } else {
      showError(
        "Server responded with error: " + (errData.error || "Unknown error")
      );
    }
    return false;
  }
  return true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!roomData) {
    showError("Room data not loaded. Please try refreshing.");
    return;
  }

  const start_time = startSelect.value;
  const end_time = endSelect.value;
  const location = locationInput.value;

  let success = false;

  const creatorIdStr = String(roomData.creator_id);
  const currentUserIdStr = String(currentUserId);
  const isCreator = creatorIdStr === currentUserIdStr;

  let dayForSubmission = roomData.meeting_day;

  // 1. CREATOR LOGIC
  if (isCreator) {
    const currentInterval = parseInt(intervalSelect.value);
    const currentDay = preferredDaySelect.value;
    dayForSubmission = currentDay;

    if (creatorControls.style.display === "block") {
      if (currentInterval && currentDay) {
        const prefSaved = await submitCreatorPreferences(
          currentInterval,
          currentDay
        );
        if (!prefSaved) return;

        intervalSet = true;
        daySet = true;

        if (
          roomData.meeting_interval !== currentInterval ||
          roomData.meeting_day !== currentDay
        ) {
          disabledOverlay.style.display = "none";
          availabilityWrapper.dataset.interval = currentInterval;
          generateTimeOptions(currentInterval);
          constrainedDayDisplay.textContent = currentDay;
        }
      } else {
        showError(
          "Creator must select both Meeting Duration and Preferred Day."
        );
        return;
      }
    }
  }

  if (!dayForSubmission && roomData.meeting_day) {
    dayForSubmission = roomData.meeting_day;
  }

  // 2. AVAILABILITY LOGIC
  if (intervalSet && daySet) {
    const currentInterval = parseInt(availabilityWrapper.dataset.interval) || 1;
    const durationMinutes = currentInterval * 60;

    if (!start_time || !end_time || !location) {
      showError(
        "Missing required availability fields (Start/End Time or Location)."
      );
      return;
    }

    const start = new Date(`2000/01/01 ${start_time}`);
    const end = new Date(`2000/01/01 ${end_time}`);

    if ((end.getTime() - start.getTime()) / 60000 !== durationMinutes) {
      showError(
        `Your selected time slot must be exactly ${currentInterval} hour(s).`
      );
      return;
    }

    success = await submitAvailability(
      dayForSubmission,
      start_time,
      end_time,
      location
    );
  } else {
    showError(
      "Meeting preferences must be set before submitting availability."
    );
    return;
  }

  if (success) {
    showSuccessModal();
  }
});

initializeAvailabilityPage();
