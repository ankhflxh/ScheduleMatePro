const form = document.querySelector("#availability-form");
const daySelect = document.querySelector("#day");
const startSelect = document.querySelector("#start_time");
const endSelect = document.querySelector("#end_time");
const locationInput = document.querySelector("#location");

const successModal = document.getElementById("successModal");
const errorModal = document.getElementById("errorModal");
const errorMessage = document.getElementById("errorMessage");
const viewSchedulerBtn = document.getElementById("viewSchedulerBtn");
const successExitBtn = document.getElementById("successExitBtn");
const errorOkBtn = document.getElementById("errorOkBtn");

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

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

const isEditMode = urlParams.get("edit") === "true";

if (isEditMode) {
  fetch(`/api/availability/${roomId}/me`, { credentials: "include" })
    .then((res) => res.json())
    .then((data) => {
      if (data) {
        daySelect.value = data.day;
        startSelect.value = data.start_time;
        endSelect.value = data.end_time;
        locationInput.value = data.location;
      }
    })
    .catch((err) => {
      console.error("Error loading availability:", err);
    });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const day = daySelect.value;
  const start_time = startSelect.value;
  const end_time = endSelect.value;
  const location = locationInput.value;

  fetch(`/api/availability/${roomId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day, start_time, end_time, location }),
  })
    .then((res) => {
      if (!res.ok) {
        if (res.status === 401) throw new Error("You are not logged in.");
        throw new Error("Server responded with error");
      }
      return res.json();
    })
    .then(() => {
      showSuccessModal();
    })
    .catch((err) => {
      console.error("Submit error:", err);
      showError("Could not submit availability.");
    });
});

document.getElementById("exitButton").onclick = () => {
  window.location.href = `/rooms/enterRooms/enterRooms.html?roomId=${roomId}`;
};
