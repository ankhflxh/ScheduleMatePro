// File: Frontend/Dashboard/dashboard.js

// DOM Elements
const roomsContainer = document.querySelector("#my-rooms");
const meetingsList = document.querySelector("#my-meetings");
const noRoomsMsg = document.querySelector("#no-rooms-message");
const noMeetingsMsg = document.querySelector("#no-meetings-message");
const createForm = document.querySelector("#create-room-form");
const joinForm = document.querySelector("#join-room-form");
const roomNameError = document.getElementById("roomNameError");

// Modals
const infoModal = document.getElementById("infoModal");
const infoTitle = document.getElementById("infoModalTitle");
const infoBody = document.getElementById("infoModalBody");
const infoOkBtn = document.getElementById("infoModalOk");

// NEW: Success Modal Elements
const successModal = document.getElementById("dashboardSuccessModal");
const successTitle = document.getElementById("successTitle");
const successBody = document.getElementById("successBody");

// --- HELPER: Show Info Modal ---
function showModal(title, message) {
  infoTitle.textContent = title;
  infoBody.textContent = message;
  infoModal.style.display = "grid";
}
infoOkBtn.onclick = () => (infoModal.style.display = "none");

// --- NEW HELPER: Show Success Modal (With Lottie) ---
function showSuccess(title, message) {
  successTitle.textContent = title;
  successBody.textContent = message;
  successModal.style.display = "grid"; // Grid centers it via CSS
}

// Validate room name
function isRoomNameValid(name) {
  return /^[A-Za-z]{4,}$/.test(name);
}
document.getElementById("create-room-name").addEventListener("input", () => {
  roomNameError.style.display = "none";
});

// --- INITIALIZE BACKGROUND LOTTIE ---
document.addEventListener("DOMContentLoaded", () => {
  const bgContainer = document.getElementById("lottie-background");
  if (bgContainer && window.lottie) {
    window.lottie.loadAnimation({
      container: bgContainer,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/Assets/background-collab.json",
      rendererSettings: { preserveAspectRatio: "xMidYMid slice" },
    });
  }
});

// --- AUTH & INIT ---
const token = localStorage.getItem("sm_token");

if (!token) {
  window.location.href = "/LoginPage/login.html";
} else {
  fetch("/api/users/me", {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Session expired");
      return res.json();
    })
    .then((user) => {
      const userId = user.user_id || user.id;
      window.SLOTIFY_USER_ID = userId;

      const titleEl = document.getElementById("dashboard-title");
      if (titleEl) {
        const nameToDisplay = user.username || user.user_username || "User";
        const displayName =
          nameToDisplay.charAt(0).toUpperCase() + nameToDisplay.slice(1);
        titleEl.textContent = `${displayName}'s Dashboard`;
      }

      if (sessionStorage.getItem("justLoggedIn") === "1") {
        const firstVisit = !localStorage.getItem("firstVisitDone");
        const welcomeName = user.username || user.user_username || "User";
        showModal(
          firstVisit ? `Welcome, ${welcomeName}!` : `Welcome Back!`,
          firstVisit
            ? "Ready to schedule? Create a room to get started."
            : "Good to see you again."
        );
        if (firstVisit) localStorage.setItem("firstVisitDone", "true");
        sessionStorage.removeItem("justLoggedIn");
      }

      loadRooms(userId);
      loadMeetings(userId);
    })
    .catch((err) => {
      console.error("Dashboard Load Error:", err);
      localStorage.removeItem("sm_token");
      window.location.href = "/LoginPage/login.html";
    });
}

// --- LOAD ROOMS ---
function loadRooms(userId) {
  fetch(`/api/rooms/me?userId=${userId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((rooms) => {
      roomsContainer.innerHTML = "";

      if (!rooms || rooms.length === 0) {
        roomsContainer.style.display = "none";
        noRoomsMsg.style.display = "flex";
        return;
      }

      roomsContainer.style.display = "grid";
      noRoomsMsg.style.display = "none";

      rooms.forEach((room) => {
        const card = document.createElement("div");
        card.className = "room-card";
        const roomName = room.room_name || room.name;
        const roomId = room.room_id || room.id;
        const codeDisplay = room.code
          ? `<span class="room-code">${room.code}</span>`
          : "";

        card.innerHTML = `
          <div>
            <div class="room-name">${roomName}</div>
            ${codeDisplay}
          </div>
          <div class="card-actions">
            <a href="/Rooms/EnterRooms/enterrooms.html?roomId=${roomId}" class="btn-enter">
              Enter Room <span class="material-icons" style="font-size:1.2rem">arrow_forward</span>
            </a>
            <button class="btn-delete delete-room-btn" data-room-id="${roomId}">
              <span class="material-icons">delete_outline</span>
            </button>
          </div>
        `;
        roomsContainer.appendChild(card);
      });
    })
    .catch(console.error);
}

// --- LOAD MEETINGS ---
function loadMeetings(userId) {
  fetch(`/api/meetings/me?userId=${userId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((meetings) => {
      meetingsList.innerHTML = "";
      if (!meetings.length) {
        noMeetingsMsg.style.display = "flex";
        return;
      }
      noMeetingsMsg.style.display = "none";

      meetings.forEach((m) => {
        const div = document.createElement("div");
        div.className = "meeting-item";
        div.innerHTML = `
          <div class="meeting-time">${m.day} @ ${m.start_time}</div>
          <div class="meeting-info">Room: ${m.room_name}</div>
          <div class="meeting-loc">
            <span class="material-icons" style="font-size:1rem">place</span> ${m.location}
          </div>
        `;
        meetingsList.appendChild(div);
      });
    })
    .catch(console.error);
}

// --- CREATE ROOM ---
createForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("create-room-name").value.trim();

  if (!isRoomNameValid(name)) {
    roomNameError.textContent = "Name must be 4+ letters, no numbers/symbols.";
    roomNameError.style.display = "block";
    return;
  }

  fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ name }),
  })
    .then((res) => res.json())
    .then((room) => {
      if (room.error) throw new Error(room.error);
      // NEW: Use Success Lottie Modal
      showSuccess(
        "Room Created!",
        `Your room "${room.name}" is ready. Invite Code: ${room.code}`
      );
      document.getElementById("create-room-name").value = "";
      loadRooms(window.SLOTIFY_USER_ID);
    })
    .catch((err) => showModal("Error", err.message));
});

// --- JOIN ROOM ---
joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = document.getElementById("join-room-code").value.trim();

  fetch("/api/rooms/join", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ inviteCode: code }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      // NEW: Use Success Lottie Modal
      showSuccess("Joined!", "You have successfully joined the room.");
      document.getElementById("join-room-code").value = "";
      loadRooms(window.SLOTIFY_USER_ID);
    })
    .catch((err) => showModal("Error", err.message));
});

// --- LOGOUT LOGIC ---
const logoutModal = document.getElementById("logoutModal");
document.getElementById("logout-button").onclick = () =>
  (logoutModal.style.display = "grid");
window.closeLogoutModal = () => (logoutModal.style.display = "none");

window.confirmLogout = () => {
  localStorage.removeItem("sm_token");
  localStorage.removeItem("firstVisitDone");
  window.location.href = "../../LandingPage/index.html";
};

// --- DELETE ROOM LOGIC ---
let deleteTargetId = null;
const deleteModal = document.getElementById("deleteRoomModal");

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-room-btn");
  if (btn) {
    deleteTargetId = btn.dataset.roomId;
    deleteModal.style.display = "grid";
  }
});

window.closeDeleteModal = () => (deleteModal.style.display = "none");

document.getElementById("confirmDeleteBtn").onclick = () => {
  if (!deleteTargetId) return;
  fetch(`/api/rooms/${deleteTargetId}/leave`, {
    method: "DELETE",
    headers: { "X-Auth-Token": token },
  }).then((res) => {
    if (res.ok) {
      loadRooms(window.SLOTIFY_USER_ID);
      closeDeleteModal();
    } else {
      alert("Failed to delete room.");
    }
  });
};
