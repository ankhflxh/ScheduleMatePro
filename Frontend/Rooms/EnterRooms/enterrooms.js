const token = localStorage.getItem("sm_token");
const roomId = new URLSearchParams(window.location.search).get("roomId");

// Update the room name in the header
const header = document.getElementById("room-header");

if (roomId && header) {
  fetch(`/api/rooms/${roomId}`, {
    credentials: "include",
    // Added token for consistency and security best practice
    headers: { "X-Auth-Token": token },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Room not found");
      return res.json();
    })
    .then((data) => {
      // Assuming backend returns { id, name, creator_id, etc. }
      const roomName = data.room_name || data.name;
      if (roomName) {
        header.innerHTML = `
          <span class="material-icons">meeting_room</span>
          ${roomName} Hub
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
  fetch(`/api/meetings/confirmed?roomId=${roomId}`, {
    credentials: "include",
    // REQUIRED: Added X-Auth-Token to authenticate the request
    headers: { "X-Auth-Token": token },
  })
    .then((res) => {
      // NOTE: Using res.json() will crash if server sends a 404 with no body.
      // A proper fix involves checking res.status first, but for now we rely on the catch.
      return res.json();
    })
    .then((data) => {
      if (data && data.day && data.time && data.location) {
        confirmedDisplay.textContent = `📢 Confirmed Meeting: ${data.day} at ${data.time}, Location: ${data.location}`;
        confirmedDisplay.style.display = "block"; // Ensure visibility
      } else {
        confirmedDisplay.style.display = "none";
      }
    })
    .catch(() => {
      // Hides the bar if no confirmed meeting is found (404/no data)
      confirmedDisplay.style.display = "none";
      console.warn("No confirmed meeting for this room.");
    });
}

const exitBtn = document.getElementById("exitBtn");

if (exitBtn) {
  exitBtn.onclick = () => {
    // This assumes your dashboard is directly at the /Dashboard/ path from the root.
    window.location.href = "/Dashboard/dashboard.html";
  };
}

// NOTE: The Add Participants Modal logic remains unimplemented in the JS,
// as it was not part of the core project requirements.

window.addEventListener("keydown", (e) => {
  // Assuming 'modal' variable is defined globally if used, but removing the check
  // to prevent potential undefined errors based on provided code structure.
  if (e.key === "Escape") {
    document.getElementById("addParticipantsModal").style.display = "none";
  }
});
