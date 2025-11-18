const token = localStorage.getItem("sm_token");
const roomId = new URLSearchParams(window.location.search).get("roomId");

if (!roomId) {
  alert("⚠️ Missing roomId. You must enter settings through a room.");
  throw new Error("roomId not found in URL");
}

// --- Load room info and apply theme ---
fetch(`/api/rooms/${roomId}`, {
  credentials: "include",
  headers: { "X-Auth-Token": token },
})
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
      const inviteCode = data.code;
      const shareURL = `${window.location.origin}/join?code=${inviteCode}`;

      // FIX: Display the full URL to match what is copied.
      codeSpan.textContent = shareURL;

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
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      },
      body: JSON.stringify({ theme: isDark ? "dark" : "light" }),
    });
  });
}

// --- Load Participants ---
if (roomId) {
  // Load participants and mark creator
  fetch(`/api/rooms/${roomId}/users`, {
    credentials: "include",
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((users) => {
      fetch(`/api/rooms/${roomId}/creator`, {
        credentials: "include",
        headers: { "X-Auth-Token": token },
      })
        .then((res) => res.json())
        .then(({ creator_id }) => {
          const list = document.getElementById("participantsList");
          list.innerHTML = "";

          // Ensure users is an array before iterating
          if (!Array.isArray(users) || users.length === 0) {
            list.innerHTML = "<li>No participants found.</li>";
            return;
          }

          users.forEach((user, index) => {
            const li = document.createElement("li");
            li.classList.add("participant-item"); // Class for Flexbox alignment

            const isCreator = user.user_id === creator_id;
            const roleText = isCreator ? "Creator" : "";
            const roleClass = isCreator ? "role-creator" : "role-member";

            // 🟢 FIX: Use innerHTML to create two distinct containers (span) for alignment
            li.innerHTML = `
                <span class="participant-name">${index + 1}. ${
              user.user_username || user.username
            }</span>
                <span class="participant-role ${roleClass}">${roleText}</span>
            `;

            list.appendChild(li);
          });
        })
        .catch((err) => {
          console.error("Failed to load creator info:", err);
          document.getElementById("participantsList").innerHTML =
            "<li>Error loading creator info.</li>";
        });
    })
    .catch((err) => {
      console.error("Failed to load participants:", err);
      document.getElementById("participantsList").innerHTML =
        "<li>Error loading participants.</li>";
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
  // FIX: Clear the persistent flag and token on logout for consistency
  localStorage.removeItem("sm_token");
  localStorage.removeItem("firstVisitDone");

  const success = document.getElementById("logoutSuccessModal");
  success.style.display = "flex";

  setTimeout(() => {
    window.location.href = "../../landingpage/index.html";
  }, 2000);
};
