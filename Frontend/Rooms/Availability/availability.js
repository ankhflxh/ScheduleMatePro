// File: Frontend/Rooms/Availability/availability.js (Complete Update with Type Fix)

const form = document.querySelector("#availability-form");
const daySelect = document.querySelector("#day");
const startSelect = document.querySelector("#start_time");
const endSelect = document.querySelector("#end_time");
const locationInput = document.querySelector("#location");

// New elements for Creator logic
const creatorControls = document.getElementById("creatorControls");
const preferenceForm = document.getElementById("preferenceForm");
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

// --- HELPER FUNCTIONS ---

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
    const currentUserId = userData.user_id;

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
    const roomData = await roomRes.json();

    // 🎯 FIX: Cast both IDs to string before comparison
    const creatorIdStr = String(roomData.creator_id);
    const currentUserIdStr = String(currentUserId);

    const isCreator = creatorIdStr === currentUserIdStr; // Reliable comparison

    const intervalSet = !!roomData.meeting_interval;
    const daySet = !!roomData.meeting_day;

    // --- CREATOR LOGIC ---
    if (isCreator) {
      creatorControls.style.display = "flex"; // Show creator form
      availabilityWrapper.style.display = "none"; // Hide member form

      // Pre-populate creator form if data exists
      if (intervalSet) intervalSelect.value = roomData.meeting_interval;
      if (daySet) preferredDaySelect.value = roomData.meeting_day;

      preferenceForm.addEventListener("submit", handleCreatorSubmit);
    }
    // --- MEMBER LOGIC ---
    else {
      creatorControls.style.display = "none"; // Hide creator form
      availabilityWrapper.style.display = "block"; // Show member form wrapper

      if (!intervalSet || !daySet) {
        // Preferences NOT SET: Disable form
        disabledOverlay.style.display = "flex";
      } else {
        // Preferences SET: Enable form and set constraints
        disabledOverlay.style.display = "none";

        // 🟢 Constraint 1: Restrict Day Selection to Creator's Day
        daySelect.innerHTML = `<option value="${roomData.meeting_day}">${roomData.meeting_day}</option>`;
        daySelect.value = roomData.meeting_day;
        daySelect.setAttribute("readonly", true);
        daySelect.style.pointerEvents = "none"; // Visually disable it

        // Store interval for time slot generation
        availabilityWrapper.dataset.interval = roomData.meeting_interval;

        // 🟢 Constraint 2: Generate Time Slots based on interval
        generateTimeOptions(roomData.meeting_interval);

        // 3. Load existing availability (Edit Mode)
        loadExistingAvailability(roomData.meeting_interval);
      }
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
          // Update form values
          daySelect.value = data.day;
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

async function handleCreatorSubmit(e) {
  e.preventDefault();
  const interval = parseInt(intervalSelect.value);
  const day = preferredDaySelect.value;

  const res = await fetch(`/api/rooms/${roomId}/schedule-preference`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ interval, day }),
  });

  if (res.ok) {
    alert(
      `Meeting preferences saved! Interval: ${interval}hr, Day: ${day}. Members can now enter availability.`
    );
    // Reload the page to switch to the member view (or update forms)
    window.location.reload();
  } else {
    const errorData = await res.json().catch(() => ({ error: "Server error" }));
    showError(
      "Failed to save preferences: " + (errorData.error || "Server error")
    );
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  // Perform client-side validation for time constraint
  const interval = parseInt(availabilityWrapper.dataset.interval) || 1;
  const durationMinutes = interval * 60;

  const day = daySelect.value;
  const start_time = startSelect.value;
  const end_time = endSelect.value;
  const location = locationInput.value;

  // Simple check for time integrity
  const start = new Date(`2000/01/01 ${start_time}`);
  const end = new Date(`2000/01/01 ${end_time}`);

  if ((end.getTime() - start.getTime()) / 60000 !== durationMinutes) {
    // This should ideally not happen if generateTimeOptions worked, but is a safety check
    showError(`Your selected time slot must be exactly ${interval} hour(s).`);
    return;
  }

  fetch(`/api/availability/${roomId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ day, start_time, end_time, location }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));

        if (res.status === 403) {
          // Handle the specific backend restriction error
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
        throw new Error("Submit failed.");
      }
      return res.json();
    })
    .then(() => {
      showSuccessModal();
    })
    .catch((err) => {
      console.error("Submit error:", err);
      if (err.message !== "Submit failed.") {
        showError("Could not submit availability.");
      }
    });
});

// Start the initialization process
initializeAvailabilityPage();
