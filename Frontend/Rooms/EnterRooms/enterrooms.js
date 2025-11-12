const roomId = new URLSearchParams(window.location.search).get("roomId");

// Update the room name in the header
const header = document.getElementById("room-header");

if (roomId && header) {
  fetch(`/api/rooms/${roomId}`, { credentials: "include" })
    .then((res) => {
      if (!res.ok) throw new Error("Room not found");
      return res.json();
    })
    .then((data) => {
      if (data.room_name) {
        header.innerHTML = `
          <span class="material-icons">meeting_room</span>
          ${data.room_name} Dashboard
        `;
      }
    })
    .catch(() => {
      console.warn("Failed to load room name");
    });
}

// Dynamic routing for all menu buttons
document.querySelectorAll(".menu-item").forEach((button) => {
  button.addEventListener("click", () => {
    const baseLink = button.dataset.link;
    if (baseLink && roomId) {
      window.location.href = `${baseLink}?roomId=${roomId}`;
    }
  });
});

// Show confirmed meeting info
const confirmedDisplay = document.querySelector("#confirmed-meeting-info");

if (roomId && confirmedDisplay) {
  fetch(`/api/meetings/confirmed?roomId=${roomId}`, { credentials: "include" })
    .then((res) => res.json())
    .then((data) => {
      if (data && data.day && data.time && data.location) {
        confirmedDisplay.textContent = `📢 Confirmed Meeting: ${data.day} at ${data.time}, Location: ${data.location}`;
      }
    })
    .catch(() => {
      console.warn("No confirmed meeting for this room.");
    });
}



window.addEventListener("keydown", (e) => {
  if (modal.style.display === "flex" && e.key === "Escape")
    modal.style.display = "none";
});

const exitBtn = document.getElementById("exitBtn");

if (exitBtn) {
  exitBtn.onclick = () => {
    window.location.href = "/Dashboard/dashboard.html"; // ✅ change to your actual dashboard path
  };
}
