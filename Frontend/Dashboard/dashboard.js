// File: Frontend/Dashboard/dashboard.js

const roomsContainer = document.querySelector("#my-rooms");
const meetingsList = document.querySelector("#my-meetings");
const noRoomsMsg = document.querySelector("#no-rooms-message");
const noMeetingsMsg = document.querySelector("#no-meetings-message");

const createForm = document.querySelector("#create-room-form");
const joinForm = document.querySelector("#join-room-form");

// Welcome modal elements
const welcomeModal = document.getElementById("welcomeModal");
const welcomeModalTitle = document.getElementById("welcomeModalTitle");
const welcomeModalBody = document.getElementById("welcomeModalBody");
const welcomeModalOk = document.getElementById("welcomeModalOk");

// Room created modal elements
const roomNameInput = document.querySelector("#create-room-name");
const roomNameError = document.getElementById("roomNameError");
const roomCreatedModal = document.getElementById("roomCreatedModal");
const roomCreatedModalTitle = document.getElementById("roomCreatedModalTitle");
const roomCreatedModalBody = document.getElementById("roomCreatedModalBody");
const roomCreatedModalOk = document.getElementById("roomCreatedModalOk");

// Validate room name: at least 4 letters, no numbers or special chars
function isRoomNameValid(name) {
  return /^[A-Za-z]{4,}$/.test(name);
}

// Hide error on typing
roomNameInput.addEventListener("input", () => {
  roomNameError.style.display = "none";
});

// --- LOTTIE PROGRAMMATIC LOADER (FIX) ---
function loadLottieAnimation(playerSelector, jsonPath) {
  const player = document.querySelector(playerSelector);
  if (!player) return;

  // Explicitly fetch the JSON file content
  fetch(jsonPath)
    .then((response) => {
      if (!response.ok) {
        console.error(
          `Failed to load Lottie JSON from: ${jsonPath}. Status: ${response.status}`
        );
        // Optionally display a fallback if fetch fails
        return;
      }
      return response.json();
    })
    .then((animationData) => {
      // Load the animation data directly to the player component
      if (player.load) {
        player.load(animationData);
      } else {
        // Fallback for older lottie-player versions
        player.src = jsonPath;
      }
    })
    .catch((error) => {
      console.error("Error loading Lottie animation data:", error);
    });
}
// --- END LOTTIE LOADER ---

// --- CORE AUTHENTICATION AND DATA LOADING ---
const token = localStorage.getItem("sm_token");

if (!token) {
  // Show session expired modal and force login if no token is found
  welcomeModalTitle.textContent = "Session expired. Please log in again.";
  welcomeModalBody.textContent = "";
  welcomeModal.style.display = "flex";
  if (welcomeModalOk) {
    welcomeModalOk.onclick = () => {
      welcomeModal.style.display = "none";
      window.location.href = "/loginpage/login.html";
    };
  }
} else {
  // Fetch user info using the stored token
  fetch("/api/users/me", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token, // Passing the authentication token
    },
  })
    .then((res) => {
      // Check for unauthorized or forbidden status (401/403)
      if (res.status === 401 || res.status === 403) {
        throw new Error("Session expired or invalid token.");
      }
      return res.json();
    })
    .then((user) => {
      const username = user.user_username || user.username || "";
      const userId = user.user_id || user.id;

      if (!userId || !username) {
        throw new Error("User data incomplete.");
      }

      // --- PERSONALIZED WELCOME MESSAGE LOGIC ---
      if (sessionStorage.getItem("justLoggedIn") === "1") {
        const firstVisitDone = localStorage.getItem("firstVisitDone");

        if (!firstVisitDone) {
          // SCENARIO 1: First ever login after verification
          welcomeModalTitle.textContent = `Welcome to ScheduleMatePro, ${username}!`;
          localStorage.setItem("firstVisitDone", "true"); // Set permanent flag
        } else {
          // SCENARIO 2: Regular return login
          welcomeModalTitle.textContent = `Welcome back to ScheduleMate, ${username}!`;
        }

        welcomeModalBody.textContent = "";
        welcomeModal.style.display = "flex";
        sessionStorage.removeItem("justLoggedIn"); // Clear temporary flag
      }
      // --- END WELCOME MESSAGE LOGIC ---

      window.SLOTIFY_USER_ID = userId;
      loadRooms(userId);
      loadMeetings(userId);
      // Removed: loadUpcomingMeetings(userId);
    })
    .catch((err) => {
      console.error("Error loading user info:", err);
      welcomeModalTitle.textContent = "Session expired. Please log in again.";
      welcomeModalBody.textContent = "";
      welcomeModal.style.display = "flex";
      welcomeModalOk.onclick = () => {
        welcomeModal.style.display = "none";
        localStorage.removeItem("sm_token");
        window.location.href = "/loginpage/login.html";
      };
    });
}
// --- END CORE AUTHENTICATION AND DATA LOADING ---

function loadRooms(userId) {
  // The backend route is /api/rooms/user/:userId if the server.js is configured correctly.
  fetch(`/api/rooms/me?userId=${userId}`, { credentials: "include" })
    .then((res) => res.json())
    .then((rooms) => {
      roomsContainer.innerHTML = "";

      if (!rooms || rooms.length === 0) {
        roomsContainer.style.display = "none";
        noRoomsMsg.style.display = "flex";
        // --- LOTTIE CALL FOR NO ROOMS ---
        loadLottieAnimation(
          "#no-rooms-message lottie-player",
          "../NoRooms.json"
        );
        return;
      }

      roomsContainer.style.display = "grid";
      noRoomsMsg.style.display = "none";

      rooms.forEach((room) => {
        const card = document.createElement("div");
        card.classList.add("card");
        card.classList.add("room-card");

        const roomId = room.room_id || room.id;
        const roomName = room.room_name || room.name;

        card.innerHTML = `
          <h3>${roomName}</h3>
          <div class="room-actions">
            <button class="submit-btn" onclick="window.location.href='/rooms/enterRooms/enterRooms.html?roomId=${roomId}'">
              <span class="material-icons">meeting_room</span> Enter
            </button>
            <button class="submit-btn delete-room-btn" data-room-id="${roomId}">
              <span class="material-icons">delete</span> Delete
            </button>
          </div>
        `;

        roomsContainer.appendChild(card);
      });
    })
    .catch((err) => {
      console.error("Error loading rooms:", err);
    });
}

function loadMeetings(userId) {
  fetch(`/api/meetings/me?userId=${userId}`, { credentials: "include" })
    .then((res) => res.json())
    .then((meetings) => {
      meetingsList.innerHTML = "";
      if (!meetings.length) {
        meetingsList.style.display = "none";
        noMeetingsMsg.style.display = "flex";
        // --- LOTTIE CALL FOR NO MEETINGS ---
        loadLottieAnimation(
          "#no-meetings-message lottie-player",
          "../NoMeetings.json"
        );
        return;
      }

      meetingsList.style.display = "flex";
      noMeetingsMsg.style.display = "none";

      meetings.forEach((m) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <strong>${m.room_name}</strong><br>
          ${m.day} @ ${m.time} — Location: ${m.location}
        `;
        meetingsList.appendChild(li);
      });
    })
    .catch((err) => {
      console.error("Error loading meetings:", err);
    });
}

// CREATE ROOM HANDLING
createForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = roomNameInput.value.trim();

  if (!isRoomNameValid(name)) {
    roomNameError.textContent =
      "Room name must be at least 4 letters, with no numbers or special characters.";
    roomNameError.style.display = "block";
    return;
  }
  roomNameError.style.display = "none";

  const simpleCode = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  fetch("/api/rooms", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name,
      code: simpleCode,
      // SECURITY FIX: creatorId REMOVED. Backend now uses ID from JWT (req.user.id).
    }),
  })
    .then((res) => {
      if (!res.ok) {
        // Check for explicit error responses (e.g., 409 from duplicate code)
        return res.json().then((err) => {
          throw new Error(err.message || "Failed to create room.");
        });
      }
      return res.json();
    })
    .then((room) => {
      roomCreatedModalTitle.textContent = "Room created successfully!";
      roomCreatedModalBody.textContent = `Room "${room.name}" has been created.`;
      roomCreatedModal.style.display = "flex";
      if (roomCreatedModalOk) {
        roomCreatedModalOk.onclick = () => {
          roomCreatedModal.style.display = "none";
          // Reload rooms on success
          loadRooms(window.SLOTIFY_USER_ID);
          roomNameInput.value = "";
        };
      }
    })
    .catch((err) => {
      console.error(err);
      roomNameError.textContent =
        err.message || "Failed to create room. Please try again.";
      roomNameError.style.display = "block";
    });
});

// JOIN ROOM HANDLING (Improved)
joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = document.querySelector("#join-room-code").value.trim();
  if (!code) return;

  fetch("/api/rooms/join", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteCode: code }), // SECURITY FIX: userId REMOVED. Backend now uses ID from JWT.
  })
    .then((res) => {
      if (!res.ok) {
        return res.json().then((err) => {
          throw new Error(err.message || "Failed to join room.");
        });
      }
      return res.json();
    })
    .then((data) => {
      roomCreatedModalTitle.textContent = "Room Joined!";
      roomCreatedModalBody.textContent = `You've successfully joined a room with code "${code}".`;
      roomCreatedModal.style.display = "flex";
      if (roomCreatedModalOk) {
        roomCreatedModalOk.onclick = () => {
          roomCreatedModal.style.display = "none";
          loadRooms(window.SLOTIFY_USER_ID);
          document.querySelector("#join-room-code").value = "";
        };
      }
    })
    .catch((err) => {
      alert(err.message);
    });
});

// Logout modal handlers
const logoutBtn = document.getElementById("logout-button");
const logoutModal = document.getElementById("logoutModal");
const logoutSuccessModal = document.getElementById("logoutSuccessModal");

if (logoutBtn) {
  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    logoutModal.style.display = "flex";
  });
}

window.closeLogoutModal = function () {
  logoutModal.style.display = "none";
};

window.confirmLogout = function () {
  logoutModal.style.display = "none";
  // Clear token on logout
  localStorage.removeItem("sm_token");

  // FIX: Clear the persistent flag so re-created accounts see the "Welcome" message
  localStorage.removeItem("firstVisitDone");

  logoutSuccessModal.style.display = "flex";
  setTimeout(() => {
    window.location.href = "../../landingpage/index.html";
  }, 2000);
};

let selectedRoomId = null;
let selectedRoomCard = null;

// capture selected room, then wait for user confirmation
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("delete-room-btn")) {
    selectedRoomCard = e.target.closest(".room-card");
    selectedRoomId = e.target.dataset.roomId;
    document.getElementById("deleteRoomModal").style.display = "flex";
  }
});

function closeDeleteModal() {
  document.getElementById("deleteRoomModal").style.display = "none";
}

document.getElementById("confirmDeleteBtn").addEventListener("click", () => {
  if (!selectedRoomId || !selectedRoomCard) return;

  fetch(`/api/rooms/${selectedRoomId}/leave`, {
    method: "DELETE",
    credentials: "include",
  })
    .then((res) => {
      if (res.ok) {
        selectedRoomCard.remove();
        document.getElementById("deleteRoomModal").style.display = "none";
        document.getElementById("deleteSuccessModal").style.display = "flex";
        setTimeout(() => {
          document.getElementById("deleteSuccessModal").style.display = "none";
        }, 2000);
      } else {
        alert("Failed to leave room.");
      }
    })
    .catch((err) => {
      console.error("Error:", err);
      alert("An error occurred.");
    });
});

welcomeModalOk.addEventListener("click", () => {
  welcomeModal.style.display = "none";
});

// Helper function that was included in the original project structure but not used/called
function loadUpcomingMeetings(userId) {
  fetch(`/meeting/upcoming/${userId}`, { credentials: "include" })
    .then((res) => res.json())
    .then((meetings) => {
      const container = document.getElementById("upcomingContainer");
      if (!meetings.length) {
        container.innerHTML = "<p>No upcoming meetings.</p>";
        return;
      }

      container.innerHTML = "";
      meetings.forEach((m) => {
        const div = document.createElement("div");
        div.classList.add("upcoming-item");
        div.innerHTML = `
          <span class="material-icons">calendar_month</span>
          <div><strong>${m.room_name}</strong><br>
          ${m.day} at ${m.start_time} — @ ${m.location}</div>
        `;
        container.appendChild(div);
      });
    })
    .catch((err) => {
      console.warn("Failed to load upcoming meetings:", err);
    });
}
