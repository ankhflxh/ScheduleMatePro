// File: Frontend/Rooms/Settings/settings.js

const roomId = new URLSearchParams(window.location.search).get("roomId");
const token = localStorage.getItem("sm_token");

// UI Elements
const roomCodeText = document.getElementById("roomCodeText");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const participantsList = document.getElementById("participantsList");
const logoutBtn = document.getElementById("logoutBtn");
const logoutModal = document.getElementById("logoutModal");
const confirmLogout = document.getElementById("confirmLogout");
const cancelLogout = document.getElementById("cancelLogout");
const logoutSuccessModal = document.getElementById("logoutSuccessModal");

// 1. Load Room & Participants
function initSettings() {
  if (!roomId) {
    console.error("No Room ID found.");
    return;
  }

  // Fetch Room Data
  fetch(`/api/rooms/${roomId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((room) => {
      if (roomCodeText) roomCodeText.textContent = room.code || "UNKNOWN";

      // Fetch Participants
      loadParticipants(roomId, room.creator_id);
    })
    .catch((err) => {
      console.error("Error loading settings:", err);
      if (roomCodeText) roomCodeText.textContent = "ERROR";
    });
}

// 2. Fetch & Render Members (UPDATED)
function loadParticipants(roomId, creatorId) {
  // 🟢 FIXED: Now uses the dedicated members endpoint
  fetch(`/api/rooms/${roomId}/members`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((users) => {
      participantsList.innerHTML = "";

      if (users.length === 0) {
        participantsList.innerHTML =
          "<li class='participant-item'>No members found.</li>";
        return;
      }

      users.forEach((user) => {
        const li = document.createElement("li");
        li.className = "participant-item";

        // Check if this user is the creator
        const isCreator = String(user.id) === String(creatorId);

        // Badge Logic
        const roleBadge = isCreator
          ? `<span class="participant-role role-creator">Creator</span>`
          : `<span class="participant-role role-member">Member</span>`;

        li.innerHTML = `
            <span class="member-name">${user.username}</span>
            ${roleBadge}
        `;
        participantsList.appendChild(li);
      });
    })
    .catch((err) => {
      console.error(err);
      participantsList.innerHTML =
        "<li class='participant-item'>Failed to load members.</li>";
    });
}

// 3. Copy Room Code
if (copyLinkBtn) {
  copyLinkBtn.onclick = () => {
    const code = roomCodeText.textContent;
    if (code && code !== "LOADING..." && code !== "ERROR") {
      navigator.clipboard.writeText(code).then(() => {
        // Visual Feedback
        const originalIcon = copyLinkBtn.innerHTML;
        copyLinkBtn.innerHTML =
          '<span class="material-icons" style="color:#10b981">check</span>';

        setTimeout(() => {
          copyLinkBtn.innerHTML = originalIcon;
        }, 2000);
      });
    }
  };
}

// 4. Logout Handlers
if (logoutBtn) {
  logoutBtn.onclick = () => (logoutModal.style.display = "flex");
}

if (cancelLogout) {
  cancelLogout.onclick = () => (logoutModal.style.display = "none");
}

if (confirmLogout) {
  confirmLogout.onclick = () => {
    logoutModal.style.display = "none";
    logoutSuccessModal.style.display = "flex";

    // Clear Session
    localStorage.removeItem("sm_token");

    // Redirect after brief delay
    setTimeout(() => {
      window.location.href = "../../LandingPage/index.html";
    }, 1500);
  };
}

// Start
initSettings();
