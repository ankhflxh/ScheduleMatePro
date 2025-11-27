// File: Frontend/Dashboard/dashboard.js

// ... (DOM Elements and Modals are unchanged) ...
const roomsContainer = document.querySelector("#my-rooms");
const meetingsList = document.querySelector("#my-meetings");
const noRoomsMsg = document.querySelector("#no-rooms-message");
const noMeetingsMsg = document.querySelector("#no-meetings-message");
const createForm = document.querySelector("#create-room-form");
const joinForm = document.querySelector("#join-room-form");
const roomNameError = document.getElementById("roomNameError");

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
      const nameToDisplay = user.username || user.user_username || "User";
      const displayName =
        nameToDisplay.charAt(0).toUpperCase() + nameToDisplay.slice(1);

      if (titleEl) {
        titleEl.textContent = `${displayName}'s Dashboard`;
      }

      // 🟢 UPDATED: Use Database 'has_seen_tour' instead of LocalStorage
      // If has_seen_tour is FALSE (or null), we show the tour.
      const isFirstVisit = !user.has_seen_tour;

      TourManager.init(isFirstVisit, displayName);

      loadRooms(userId);
      loadMeetings(userId);
    })
    .catch((err) => {
      console.error("Dashboard Load Error:", err);
      // Only redirect if it's a true auth error, not just a fetch error
      if (err.message === "Session expired") {
        localStorage.removeItem("sm_token");
        window.location.href = "/LoginPage/login.html";
      }
    });
}

// ... (Helper functions loadRooms, loadMeetings, Form Listeners remain the same) ...
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
  if (meetingDayIndex === -1) return true;
  if (currentDayIndex === meetingDayIndex) {
    const [hours, minutes] = endTimeStr.split(":");
    const meetingEndTimeToday = new Date();
    meetingEndTimeToday.setHours(hours, minutes, 0);
    return now < meetingEndTimeToday;
  }
  if (meetingDayIndex > currentDayIndex) return true;
  return false;
}

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
          <div><div class="room-name">${roomName}</div><div class="room-code">${codeDisplay}</div></div>
          <div class="card-actions">
            <a href="/Rooms/EnterRooms/enterrooms.html?roomId=${roomId}" class="btn-enter">
              Enter Room <span class="material-icons" style="font-size:1.2rem">arrow_forward</span>
            </a>
            <button class="btn-delete delete-room-btn" data-room-id="${roomId}">
              <span class="material-icons">delete_outline</span>
            </button>
          </div>`;
        if (roomsContainer) roomsContainer.appendChild(card);
      });
    })
    .catch(console.error);
}

function loadMeetings(userId) {
  fetch(`/api/meetings/me?userId=${userId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((meetings) => {
      if (meetingsList) meetingsList.innerHTML = "";
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
          <div class="meeting-loc"><span class="material-icons" style="font-size:1rem">place</span> ${m.location}</div>
        `;
        if (meetingsList) meetingsList.appendChild(div);
      });
    })
    .catch(console.error);
}

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
if (logoutBtn) logoutBtn.onclick = () => (logoutModal.style.display = "grid");
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

// --- TOUR & CHATBOT MANAGER ---
const TourManager = {
  step: 0,
  autoCloseTimer: null,

  init: function (isFirstVisit, username) {
    const bubble = document.getElementById("guide-bubble");
    const toggle = document.getElementById("guide-toggle");
    const avatar = document.getElementById("amara-avatar");
    const title = document.querySelector("#guide-text-content h3");
    const text = document.querySelector("#guide-text-content p");
    const actions = document.getElementById("guide-actions");
    const chatOptions = document.getElementById("chat-options");

    if (isFirstVisit) {
      // MAXIMIZED MODE
      avatar.style.display = "block";
      bubble.style.display = "block";
      toggle.style.display = "none";
      actions.style.display = "flex";
      chatOptions.style.display = "none";

      title.textContent = `Hi ${username}!`;
      text.innerHTML = `I am Amara and I will love to show you what I have built just to make navigation easy for you but feel free to skip. You could always visit me at the corner of the screen if you have any questions and I will be delighted to help cause it gets lonely 😞. Okay so let's get started!`;
    } else {
      // MINIMIZED MODE
      avatar.style.display = "none";
      bubble.style.display = "none";
      toggle.style.display = "flex";
    }
  },

  startTour: function () {
    this.step = 0;
    if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
    document.getElementById("tour-overlay").classList.add("active");
    this.nextStep();
  },

  nextStep: function () {
    this.step++;
    this.clearHighlights();

    const title = document.querySelector("#guide-text-content h3");
    const text = document.querySelector("#guide-text-content p");
    const actions = document.getElementById("guide-actions");

    if (this.step === 1) {
      this.highlight(".create-card");
      title.textContent = "1. Create Rooms";
      text.textContent =
        "Start here! Create a secure room for your team or class. You'll get a unique code to share.";
      this.setNextBtn("Next");
    } else if (this.step === 2) {
      this.highlight(".join-card");
      title.textContent = "2. Join Rooms";
      text.textContent =
        "Received a code? Enter it here to join an existing schedule instantly.";
    } else if (this.step === 3) {
      this.highlight(".rooms-section");
      title.textContent = "3. Your Hub";
      text.textContent =
        "All your joined rooms appear here. Click 'Enter Room' to vote on times or view notes.";
    } else if (this.step === 4) {
      this.highlight(".meetings-section");
      title.textContent = "4. Upcoming";
      text.textContent =
        "Never miss a beat. Your finalized meetings for the week will appear right here.";
      this.setNextBtn("Finish");
    } else {
      this.endTour();
    }
  },

  highlight: function (selector) {
    const el = document.querySelector(selector);
    if (el) {
      el.classList.add("tour-highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },

  clearHighlights: function () {
    document.querySelectorAll(".tour-highlight").forEach((el) => {
      el.classList.remove("tour-highlight");
    });
  },

  setNextBtn: function (text) {
    const actions = document.getElementById("guide-actions");
    actions.innerHTML = `
      <button onclick="TourManager.nextStep()" class="guide-btn primary">${text}</button>
      <button onclick="TourManager.endTour()" class="guide-btn secondary">Stop</button>
    `;
  },

  endTour: function () {
    this.clearHighlights();
    document.getElementById("tour-overlay").classList.remove("active");

    // 🟢 NEW: Mark as complete in Database
    fetch("/api/users/tour-complete", {
      method: "POST",
      headers: { "X-Auth-Token": token },
    }).catch(console.error);

    const title = document.querySelector("#guide-text-content h3");
    const text = document.querySelector("#guide-text-content p");
    const actions = document.getElementById("guide-actions");
    const chatOptions = document.getElementById("chat-options");

    title.textContent = "I'm here to help!";
    text.textContent = "Click me anytime if you get stuck.";

    actions.style.display = "none";
    chatOptions.style.display = "none";

    this.autoCloseTimer = setTimeout(() => {
      document.getElementById("guide-bubble").style.display = "none";
      document.getElementById("amara-avatar").style.display = "none";
      document.getElementById("guide-toggle").style.display = "flex";
    }, 3000);
  },

  toggleChat: function (e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }

    const bubble = document.getElementById("guide-bubble");
    const toggle = document.getElementById("guide-toggle");
    const avatar = document.getElementById("amara-avatar");
    const actions = document.getElementById("guide-actions");
    const chatOptions = document.getElementById("chat-options");

    const overlay = document.getElementById("tour-overlay");
    if (overlay.classList.contains("active")) return;

    if (bubble.style.display === "none") {
      // OPEN
      avatar.style.display = "block";
      bubble.style.display = "block";
      toggle.style.display = "none";

      document.querySelector("#guide-text-content h3").textContent =
        "Asking Amara";
      document.querySelector("#guide-text-content p").textContent =
        "How can I help you today?";
      actions.style.display = "none";
      chatOptions.style.display = "flex";
    } else {
      // CLOSE
      avatar.style.display = "none";
      bubble.style.display = "none";
      toggle.style.display = "flex";
    }
  },

  answer: function (topic) {
    const text = document.querySelector("#guide-text-content p");

    if (topic === "overview") {
      text.textContent =
        "It's easy! Create a room, invite friends, vote on availability, and let the app find the perfect meeting time.";
    } else if (topic === "availability") {
      text.textContent =
        "Go into any room and click 'My Availability'. You can select multiple time slots that work for you.";
    } else if (topic === "notes") {
      text.textContent =
        "Click the 'Notes' card inside a room. You can write messages, to-do lists, and upload images to share.";
    } else if (topic === "leave") {
      text.textContent =
        "On the Dashboard, click the 'Trash Can' icon on any room card to leave. If you are the creator, this deletes the room.";
    } else if (topic === "edit") {
      text.textContent =
        "Yes! You can update your availability anytime. Just go back to the room and click 'Edit Mine'.";
    }
  },

  resetChat: function () {
    document.querySelector("#guide-text-content p").textContent =
      "How can I help you today?";
  },
};
