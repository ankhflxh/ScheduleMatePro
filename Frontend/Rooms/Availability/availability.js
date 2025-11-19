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

// 🟢 NEW CONSTANT: University Buildings List
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
  // locationInput is the select element with id="location"
  UNIVERSITY_BUILDINGS.forEach((building) => {
    const option = document.createElement("option");
    option.value = building;
    option.textContent = building;
    locationInput.appendChild(option);
  });
}

// Function to generate time options for select fields
function generateTimeOptions(interval) {
  // Clear existing options, keeping the placeholder
  startSelect.innerHTML = '<option value="">-- Select Start Time --</option>';
  endSelect.innerHTML = '<option value="">-- Select End Time --</option>';

  // Meeting duration in minutes
  const durationMinutes = interval * 60;

  // Generate options from 8:00 to 20:00, in 15-minute increments
  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      const startHour = String(h).padStart(2, "0");
      const startMinute = String(m).padStart(2, "0");
      const startTimeStr = `${startHour}:${startMinute}`;

      // Calculate end time
      let endTime = new Date(1970, 0, 1, h, m + durationMinutes);

      // Only add slots that end before or at 22:00 (10 PM)
      if (endTime.getHours() < 22) {
        const startOption = document.createElement("option");
        startOption.value = startTimeStr;
        startOption.textContent = startTimeStr;
        startSelect.appendChild(startOption);
      }
    }
  }
  // Now, ensure only valid end times based on the start time are available
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

    // Only add the required end time if it's not past 10 PM
    if (
      endTime.getHours() < 22 ||
      (endTime.getHours() === 22 && endTime.getMinutes() === 0)
    ) {
      const endOption = document.createElement("option");
      endOption.value = endTimeStr;
      endOption.textContent = endTimeStr;
      endSelect.appendChild(endOption);
      endSelect.value = endTimeStr; // Auto-select the required end time
    }
  }
}

// Attach event listener for dynamic end time update when start time changes
startSelect.addEventListener("change", () => {
  // We need to know the current interval, which is stored in a dataset attribute
  const currentInterval = parseInt(availabilityWrapper.dataset.interval) || 1;
  updateEndTimes(currentInterval * 60);
});

// --- INITIALIZATION AND MAIN LOGIC ---

if (!roomId) {
  showError("Room ID is missing. Please access this page via a room link.");
  form.style.display = "none";
  throw new Error("Missing roomId");
}

document.getElementById("exitButton").onclick = () => {
  window.location.href = `/rooms/enterRooms/enterRooms.html?roomId=${roomId}`;
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
    const timestamp = Date.now(); // force reload
    window.location.href = `/rooms/meetingscheduler/scheduler.html?roomId=${roomId}&t=${timestamp}`;
  };

  successExitBtn.onclick = () => {
    successModal.style.display = "none";
    window.location.href = `/rooms/enterRooms/enterRooms.html?roomId=${roomId}`;
  };
}

async function initializeAvailabilityPage() {
  populateLocationSelect(); // Populate the location dropdown on load

  try {
    // 1. Fetch User ID (needed for role check)
    const userRes = await fetch("/api/users/me", {
      headers: { "X-Auth-Token": token },
    });

    if (!userRes.ok) {
      showError("Session expired or unauthorized access. Please log in again.");
      return;
    }
    const userData = await userRes.json();
    currentUserId = userData.user_id;

    // 2. Fetch Room Data (needed for creator_id, interval, and day)
    const roomRes = await fetch(`/api/rooms/${roomId}`, {
      headers: { "X-Auth-Token": token },
    });

    if (!roomRes.ok) {
      showError(
        "Failed to load room details. Room may not exist or network error."
      );
      return;
    }
    roomData = await roomRes.json(); // Store in global state

    // Fix: Cast both IDs to string before comparison
    const creatorIdStr = String(roomData.creator_id);
    const currentUserIdStr = String(currentUserId);

    const isCreator = creatorIdStr === currentUserIdStr; // Reliable comparison

    intervalSet = !!roomData.meeting_interval;
    daySet = !!roomData.meeting_day;

    // 🟢 NEW UX LOGIC: Show/Hide preference inputs
    if (isCreator) {
      creatorControls.style.display = "block"; // Show preference inputs

      // Hide the display-only field for the creator
      constrainedDayDisplay.style.display = "none";
      constrainedDayDisplay.previousElementSibling.style.display = "none"; // Hide label

      // Pre-populate creator form if data exists
      if (intervalSet) intervalSelect.value = roomData.meeting_interval;
      if (daySet) preferredDaySelect.value = roomData.meeting_day;
    } else {
      creatorControls.style.display = "none"; // Hide preference inputs
    }

    // --- CONSTRAINED MEMBER / POST-SETUP CREATOR LOGIC ---

    if (!intervalSet || !daySet) {
      // Preferences NOT SET: Disable availability submission
      disabledOverlay.style.display = "flex";
    } else {
      // Preferences SET: Enable form and set constraints
      disabledOverlay.style.display = "none";

      // 🟢 Constraint 1: Display the Constrained Day to the user
      constrainedDayDisplay.style.display = "block"; // Show display field
      constrainedDayDisplay.previousElementSibling.style.display = "block"; // Show label
      constrainedDayDisplay.textContent = roomData.meeting_day;

      // Store interval for time slot generation
      availabilityWrapper.dataset.interval = roomData.meeting_interval;

      // 🟢 Constraint 2: Generate Time Slots based on interval
      generateTimeOptions(roomData.meeting_interval);

      // 3. Load existing availability (Edit Mode)
      loadExistingAvailability(roomData.meeting_interval);
    }
  } catch (e) {
    console.error("Initialization failed:", e);
    showError("Failed to initialize page data.");
  }
}

async function loadExistingAvailability(interval) {
  const isEditMode = urlParams.get("edit") === "true";
  if (isEditMode) {
    fetch(`/api/availability/${roomId}/me`, {
      headers: { "X-Auth-Token": token },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          // data.day is now confirmed to match roomData.meeting_day, so we just load time/location
          startSelect.value = data.start_time;
          locationInput.value = data.location;

          // Manually trigger the end time update after setting start time
          updateEndTimes(interval * 60);

          // Select the end time that was loaded
          endSelect.value = data.end_time;
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
  // Update global roomData state to reflect the new preferences
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

  // Ensure roomData is loaded before proceeding
  if (!roomData) {
    showError("Room data not loaded. Please try refreshing.");
    return;
  }

  // Get data from the *unified* form
  const start_time = startSelect.value;
  const end_time = endSelect.value;
  const location = locationInput.value;

  let success = false;

  const creatorIdStr = String(roomData.creator_id);
  const currentUserIdStr = String(currentUserId);
  const isCreator = creatorIdStr === currentUserIdStr;

  // Day variable is now determined based on the source of the constraint (roomData)
  let dayForSubmission = roomData.meeting_day;

  // 1. CREATOR LOGIC: SUBMIT PREFERENCES FIRST (if preferences have changed or are new)
  if (isCreator) {
    const currentInterval = parseInt(intervalSelect.value);
    const currentDay = preferredDaySelect.value;

    // The creator's day for submission is the current preferred day, even before it's saved to the server
    dayForSubmission = currentDay;

    // Only submit preferences if the form is visible and inputs are complete
    if (creatorControls.style.display === "block") {
      if (currentInterval && currentDay) {
        const prefSaved = await submitCreatorPreferences(
          currentInterval,
          currentDay
        );
        if (!prefSaved) return; // Halt if preference save failed

        // Force state update to allow availability submission
        intervalSet = true;
        daySet = true;

        // If preferences were newly set or changed, update the display for the creator (in case they switch roles)
        if (
          roomData.meeting_interval !== currentInterval ||
          roomData.meeting_day !== currentDay
        ) {
          // Re-enable and apply constraints visually and functionally
          disabledOverlay.style.display = "none";
          availabilityWrapper.dataset.interval = currentInterval;
          generateTimeOptions(currentInterval);

          // Update the display field with the newly set day
          constrainedDayDisplay.textContent = currentDay;
        }
      } else {
        // Creator tried to submit with incomplete preferences
        showError(
          "Creator must select both Meeting Duration and Preferred Day."
        );
        return;
      }
    }
  }

  // For non-creators, this ensures the day is set correctly if preferences are already defined
  if (!dayForSubmission && roomData.meeting_day) {
    dayForSubmission = roomData.meeting_day;
  }

  // 2. AVAILABILITY LOGIC (Runs for everyone, including creator)
  if (intervalSet && daySet) {
    // Re-validate against current constraints (ensures time validity)
    const currentInterval = parseInt(availabilityWrapper.dataset.interval) || 1;
    const durationMinutes = currentInterval * 60;

    // Check if a time slot was actually selected
    if (!start_time || !end_time || !location) {
      showError(
        "Missing required availability fields (Start/End Time or Location)."
      );
      return;
    }

    // Time validation check
    const start = new Date(`2000/01/01 ${start_time}`);
    const end = new Date(`2000/01/01 ${end_time}`);

    if ((end.getTime() - start.getTime()) / 60000 !== durationMinutes) {
      showError(
        `Your selected time slot must be exactly ${currentInterval} hour(s).`
      );
      return;
    }

    // Final submission using the correct dayForSubmission variable
    success = await submitAvailability(
      dayForSubmission,
      start_time,
      end_time,
      location
    );
  } else {
    // Should only happen if a non-creator submits when preferences are not set
    showError(
      "Meeting preferences must be set before submitting availability."
    );
    return;
  }

  if (success) {
    showSuccessModal();
  }
});

// Start the initialization process
initializeAvailabilityPage();
