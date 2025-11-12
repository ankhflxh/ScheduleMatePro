const roomId = new URLSearchParams(window.location.search).get("roomId");

if (!roomId) {
  alert("⚠️ Missing roomId. You must enter settings through a room.");
  throw new Error("roomId not found in URL");
}

// --- Load room info and apply theme ---
fetch(`/api/rooms/${roomId}`, { credentials: "include" })
  .then((res) => res.json())
  .then((data) => {
    // Apply theme
    if (data.theme === "dark") {
      document.body.classList.add("dark-theme");
    }

    // Show room code
    const codeSpan = document.getElementById("roomCodeText");
    const copyBtn = document.getElementById("copyLinkBtn");
    if (codeSpan && copyBtn) {
      const inviteCode = data.invite_code;
      const shareURL = `${window.location.origin}/join?code=${inviteCode}`;
      codeSpan.textContent = inviteCode;

      copyBtn.onclick = () => {
        navigator.clipboard.writeText(shareURL).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => (copyBtn.textContent = "Copy Link"), 1500);
        });
      };
    }
  })
  .catch((err) => {
    console.error("Failed to load room info:", err);
  });

// --- Theme toggle with server save ---
const themeBtn = document.getElementById("theme-toggle");

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark-theme");

    // Update on server
    fetch(`/api/rooms/${roomId}/theme`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: isDark ? "dark" : "light" }),
    });
  });
}

// --- Load Participants ---
if (roomId) {
  // Load participants and mark creator
  fetch(`/api/rooms/${roomId}/users`, { credentials: "include" })
    .then((res) => res.json())
    .then((users) => {
      fetch(`/api/rooms/${roomId}/creator`, { credentials: "include" })
        .then((res) => res.json())
        .then(({ creator_id }) => {
          const list = document.getElementById("participantsList");
          list.innerHTML = "";

          users.forEach((user, index) => {
            const li = document.createElement("li");
            li.textContent = `${index + 1}. ${user.user_username}${
              user.user_id === creator_id ? " (creator)" : ""
            }`;
            list.appendChild(li);
          });
        });
    })
    .catch((err) => {
      console.error("Failed to load participants:", err);
    });
}

// --- Logout modal logic ---
const logoutBtn = document.getElementById("logoutBtn");
const logoutModal = document.getElementById("logoutModal");
const confirmLogout = document.getElementById("confirmLogout");
const cancelLogout = document.getElementById("cancelLogout");

logoutBtn.onclick = () => (logoutModal.style.display = "flex");
cancelLogout.onclick = () => (logoutModal.style.display = "none");
confirmLogout.onclick = () => {
  logoutModal.style.display = "none";
  const success = document.getElementById("logoutSuccessModal");
  success.style.display = "flex";

  setTimeout(() => {
    window.location.href = "../../landingpage/index.html";
  }, 2000);
};
