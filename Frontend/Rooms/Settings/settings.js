// File: Frontend/Rooms/Settings/settings.js

const roomId = new URLSearchParams(window.location.search).get("roomId");
const token = localStorage.getItem("sm_token");

// UI Elements
const roomCodeText = document.getElementById("roomCodeText");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const participantsList = document.getElementById("participantsList");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const leaveRoomLabel = document.getElementById("leaveRoomLabel");

const leaveModal = document.getElementById("leaveModal");
const cancelLeave = document.getElementById("cancelLeave");
const confirmLeave = document.getElementById("confirmLeave");

const deleteModal = document.getElementById("deleteModal");
const cancelDelete = document.getElementById("cancelDelete");
const confirmDelete = document.getElementById("confirmDelete");

const leaveSuccessModal = document.getElementById("leaveSuccessModal");
const leaveSuccessMsg = document.getElementById("leaveSuccessMsg");

let currentUserId = null;
let roomCreatorId = null;

// ─── 1. INIT ────────────────────────────────────────────────────
async function initSettings() {
  if (!roomId) {
    console.error("No Room ID found.");
    return;
  }

  // Get current user
  try {
    const meRes = await fetch("/api/users/me", {
      headers: { "X-Auth-Token": token },
    });
    if (!meRes.ok) {
      window.location.href = "/LoginPage/login.html";
      return;
    }
    const me = await meRes.json();
    currentUserId = String(me.user_id || me.id);
  } catch (err) {
    console.error("Failed to load user:", err);
    return;
  }

  // Get room info
  try {
    const roomRes = await fetch(`/api/rooms/${roomId}`, {
      headers: { "X-Auth-Token": token },
    });
    const room = await roomRes.json();
    roomCreatorId = String(room.creator_id);

    if (roomCodeText) roomCodeText.textContent = room.code || "UNKNOWN";

    // Update button label based on role
    const isCreator = currentUserId === roomCreatorId;
    if (leaveRoomLabel) {
      leaveRoomLabel.textContent = isCreator ? "Delete Room" : "Leave Room";
    }
    if (leaveRoomBtn) {
      const icon = leaveRoomBtn.querySelector(".material-icons");
      if (icon) icon.textContent = isCreator ? "delete_forever" : "exit_to_app";
    }

    loadParticipants(roomId, roomCreatorId);
  } catch (err) {
    console.error("Error loading settings:", err);
    if (roomCodeText) roomCodeText.textContent = "ERROR";
  }
}

// ─── 2. PARTICIPANTS ─────────────────────────────────────────────
function loadParticipants(roomId, creatorId) {
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

      users.sort((a, b) => a.username.localeCompare(b.username));

      users.forEach((user) => {
        const li = document.createElement("li");
        li.className = "participant-item";
        const isCreator = String(user.id) === String(creatorId);
        const roleBadge = isCreator
          ? `<span class="participant-role role-creator">Creator</span>`
          : `<span class="participant-role role-member">Member</span>`;
        li.innerHTML = `<span class="member-name">${user.username}</span>${roleBadge}`;
        participantsList.appendChild(li);
      });
    })
    .catch((err) => {
      console.error(err);
      participantsList.innerHTML =
        "<li class='participant-item'>Failed to load members.</li>";
    });
}

// ─── 3. COPY ROOM CODE ───────────────────────────────────────────
if (copyLinkBtn) {
  copyLinkBtn.onclick = () => {
    const code = roomCodeText.textContent;
    if (code && code !== "LOADING..." && code !== "ERROR") {
      navigator.clipboard.writeText(code).then(() => {
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

// ─── 4. LEAVE / DELETE BUTTON ────────────────────────────────────
if (leaveRoomBtn) {
  leaveRoomBtn.onclick = () => {
    const isCreator = currentUserId === roomCreatorId;
    if (isCreator) {
      deleteModal.style.display = "flex";
    } else {
      leaveModal.style.display = "flex";
    }
  };
}

// Cancel handlers
if (cancelLeave)
  cancelLeave.onclick = () => (leaveModal.style.display = "none");
if (cancelDelete)
  cancelDelete.onclick = () => (deleteModal.style.display = "none");

// ─── Confirm LEAVE (member) ───────────────────────────────────────
if (confirmLeave) {
  confirmLeave.onclick = async () => {
    leaveModal.style.display = "none";
    confirmLeave.disabled = true;

    try {
      const res = await fetch(`/api/rooms/${roomId}/leave`, {
        method: "DELETE",
        headers: { "X-Auth-Token": token },
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to leave room.");
        confirmLeave.disabled = false;
        return;
      }

      if (leaveSuccessMsg)
        leaveSuccessMsg.textContent = "You've left the room.";
      leaveSuccessModal.style.display = "flex";

      setTimeout(() => {
        window.location.href = "/Dashboard/dashboard.html";
      }, 1500);
    } catch (err) {
      console.error("Leave error:", err);
      alert("Something went wrong. Please try again.");
      confirmLeave.disabled = false;
    }
  };
}

// ─── Confirm DELETE (creator) ─────────────────────────────────────
if (confirmDelete) {
  confirmDelete.onclick = async () => {
    deleteModal.style.display = "none";
    confirmDelete.disabled = true;

    try {
      const res = await fetch(`/api/rooms/${roomId}/leave`, {
        method: "DELETE",
        headers: { "X-Auth-Token": token },
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete room.");
        confirmDelete.disabled = false;
        return;
      }

      if (leaveSuccessMsg)
        leaveSuccessMsg.textContent = "Room deleted successfully.";
      leaveSuccessModal.style.display = "flex";

      setTimeout(() => {
        window.location.href = "/Dashboard/dashboard.html";
      }, 1500);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Something went wrong. Please try again.");
      confirmDelete.disabled = false;
    }
  };
}

// ─── Start ────────────────────────────────────────────────────────
initSettings();
