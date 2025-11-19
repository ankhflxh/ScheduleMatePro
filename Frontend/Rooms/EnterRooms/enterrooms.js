const token = localStorage.getItem("sm_token");
const roomId = new URLSearchParams(window.location.search).get("roomId");

// 1. Load Room Name
const headerLabel = document.getElementById("room-header");

if (roomId && headerLabel) {
  fetch(`/api/rooms/${roomId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((data) => {
      const roomName = data.room_name || data.name;
      if (roomName) {
        // CHANGE: Now adds "'s Room" to the end
        headerLabel.textContent = `${roomName}'s Room`;
      }
    })
    .catch((err) => console.warn("Failed to load room info", err));
}

// 2. Check for Confirmed Meeting
const confirmedBanner = document.getElementById("confirmed-meeting-info");

if (roomId && confirmedBanner) {
  fetch(`/api/meetings/confirmed?roomId=${roomId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data && data.day && data.time) {
        confirmedBanner.innerHTML = `
          <span class="material-icons">check_circle</span>
          <span>Meeting confirmed: <strong>${data.day} @ ${data.time}</strong> (${data.location})</span>
        `;
        confirmedBanner.style.display = "flex";
        confirmedBanner.style.alignItems = "center";
        confirmedBanner.style.gap = "10px";
      } else {
        confirmedBanner.style.display = "none";
      }
    })
    .catch(() => {
      confirmedBanner.style.display = "none";
    });
}

// 3. Exit Button Logic
const exitBtn = document.getElementById("exitBtn");
if (exitBtn) {
  exitBtn.onclick = () => {
    window.location.href = "/Dashboard/dashboard.html";
  };
}
