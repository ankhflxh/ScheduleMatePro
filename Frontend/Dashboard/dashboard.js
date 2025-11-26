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

function showModal(title, message) {
  if (infoTitle && infoBody && infoModal) {
    infoTitle.textContent = title;
    infoBody.textContent = message;
    infoModal.style.display = "grid";
  }
}
if (infoOkBtn) infoOkBtn.onclick = () => (infoModal.style.display = "none");

function isRoomNameValid(name) {
  return /^[A-Za-z]{4,}$/.test(name);
}
const createRoomNameInput = document.getElementById("create-room-name");
if (createRoomNameInput) {
  createRoomNameInput.addEventListener("input", () => {
    roomNameError.style.display = "none";
  });
}

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
        const visitKey = `firstVisitDone_${userId}`;
        const oldKey = "firstVisitDone";
        let hasVisited = localStorage.getItem(visitKey);

        if (!hasVisited && localStorage.getItem(oldKey)) {
          hasVisited = "true";
          localStorage.setItem(visitKey, "true");
        }

        const isFirstVisit = !hasVisited;
        const welcomeName = user.username || user.user_username || "User";

        showModal(
          isFirstVisit
            ? `Welcome to ScheduleMatePro, ${welcomeName}!`
            : `Welcome Back!`,
          isFirstVisit
            ? "Ready to schedule? Create a room to get started."
            : "Good to see you again."
        );

        if (isFirstVisit) localStorage.setItem(visitKey, "true");
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

// --- HELPER: Filter Past Meetings ---
function isUpcoming(dayName, endTimeStr) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const now = new Date();
  const currentDayIndex = now.getDay();
  const meetingDayIndex = days.indexOf(dayName);

  if (meetingDayIndex === -1) return true; // Show if invalid to be safe

  // 1. If today is the meeting day, check if END time has passed
  if (currentDayIndex === meetingDayIndex) {
    const [hours, minutes] = endTimeStr.split(":");
    const meetingEndTimeToday = new Date();
    meetingEndTimeToday.setHours(hours, minutes, 0);

    // Show if NOW is before the meeting ENDS
    return now < meetingEndTimeToday;
  }

  // 2. If meeting day is later in the week -> Show it
  if (meetingDayIndex > currentDayIndex) {
    return true;
  }

  // 3. If meeting day was earlier in the week -> Hide it (It's past)
  return false;
}

// --- LOAD ROOMS ---
function loadRooms(userId) {
  fetch(`/api/rooms/me?userId=${userId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((rooms) => {
      if (roomsContainer) roomsContainer.innerHTML = "";

      if (!rooms || rooms.length === 0) {
        if (roomsContainer) roomsContainer.style.display = "none";
        if (noRoomsMsg) noRoomsMsg.style.display = "flex";
        return;
      }

      if (roomsContainer) roomsContainer.style.display = "grid";
      if (noRoomsMsg) noRoomsMsg.style.display = "none";

      rooms.forEach((room) => {
        const card = document.createElement("div");
        card.className = "room-card";
        const roomName = room.room_name || room.name;
        const roomId = room.room_id || room.id;
        const codeDisplay = room.code
          ? `Code: <span style="font-family:monospace; background:#edf2f7; padding:2px 5px; border-radius:4px;">${room.code}</span>`
          : "";

        card.innerHTML = `
          <div>
            <div class="room-name">${roomName}</div>
            <div class="room-code">${codeDisplay}</div>
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
        if (roomsContainer) roomsContainer.appendChild(card);
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
      if (meetingsList) meetingsList.innerHTML = "";

      // FILTER: Only keep upcoming/active meetings for THIS WEEK
      const upcomingMeetings = meetings.filter(
        (m) =>
          m.meeting_day && m.end_time && isUpcoming(m.meeting_day, m.end_time)
      );

      if (!upcomingMeetings.length) {
        if (noMeetingsMsg) noMeetingsMsg.style.display = "flex";
        return;
      }
      if (noMeetingsMsg) noMeetingsMsg.style.display = "none";

      upcomingMeetings.forEach((m) => {
        const div = document.createElement("div");
        div.className = "meeting-item";

        const cleanStart = m.start_time ? m.start_time.substring(0, 5) : "";

        div.innerHTML = `
          <div class="meeting-time">${m.meeting_day} @ ${cleanStart}</div>
          <div class="meeting-info">Room: ${m.room_name}</div>
          <div class="meeting-loc">
            <span class="material-icons" style="font-size:1rem">place</span> ${m.location}
          </div>
        `;
        if (meetingsList) meetingsList.appendChild(div);
      });
    })
    .catch(console.error);
}

// --- CREATE/JOIN/LOGOUT/DELETE Logic (Unchanged) ---
if (createForm) {
  createForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("create-room-name");
    const name = nameInput.value.trim();
    if (!isRoomNameValid(name)) {
      roomNameError.textContent =
        "Name must be 4+ letters, no numbers/symbols.";
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
        showModal("Success", `Room "${room.name}" created! Code: ${room.code}`);
        nameInput.value = "";
        loadRooms(window.SLOTIFY_USER_ID);
      })
      .catch((err) => showModal("Error", err.message));
  });
}

if (joinForm) {
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const codeInput = document.getElementById("join-room-code");
    const code = codeInput.value.trim();
    fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      body: JSON.stringify({ inviteCode: code }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        showModal("Joined!", "You have successfully joined the room.");
        codeInput.value = "";
        loadRooms(window.SLOTIFY_USER_ID);
      })
      .catch((err) => showModal("Error", err.message));
  });
}

const logoutModal = document.getElementById("logoutModal");
const logoutBtn = document.getElementById("logout-button");
if (logoutBtn) {
  logoutBtn.onclick = () => (logoutModal.style.display = "grid");
}
window.closeLogoutModal = () => (logoutModal.style.display = "none");
window.confirmLogout = () => {
  localStorage.removeItem("sm_token");
  window.location.href = "../../LandingPage/index.html";
};

let deleteTargetId = null;
const deleteModal = document.getElementById("deleteRoomModal");
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-room-btn");
  if (btn) {
    deleteTargetId = btn.dataset.roomId;
    if (deleteModal) deleteModal.style.display = "grid";
  }
});
window.closeDeleteModal = () => {
  if (deleteModal) deleteModal.style.display = "none";
};
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
if (confirmDeleteBtn) {
  confirmDeleteBtn.onclick = () => {
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
}
