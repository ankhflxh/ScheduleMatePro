// File: Frontend/Rooms/EnterRooms/enterrooms.js

const token = localStorage.getItem("sm_token");
const roomId = new URLSearchParams(window.location.search).get("roomId");

// 1. Safety Check: Ensure we have a Room ID
if (!token) {
  window.location.href = "/LoginPage/login.html";
} else if (!roomId) {
  console.error("No Room ID found in URL");
  alert("Room ID missing. Returning to Dashboard.");
  window.location.href = "/Dashboard/dashboard.html";
}

// 2. Load Room Name
const headerLabel = document.getElementById("room-header");

if (roomId && headerLabel) {
  fetch(`/api/rooms/${roomId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch room data");
      return res.json();
    })
    .then((data) => {
      const roomName = data.room_name || data.name;
      if (roomName) {
        headerLabel.textContent = `${roomName}'s Room`;
      } else {
        headerLabel.textContent = "Unnamed Room";
      }
    })
    .catch((err) => {
      console.error("Error loading room info:", err);
      headerLabel.textContent = "Error Loading Room";
    });
}

// 3. Check for Confirmed Meeting (Top Banner)
const confirmedBanner = document.getElementById("confirmed-meeting-info");

if (roomId && confirmedBanner) {
  fetch(`/api/meetings/confirmed?roomId=${roomId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((data) => {
      // Uses database columns (day, time, location)
      if (data && data.day && data.time) {
        confirmedBanner.innerHTML = `
          <span class="material-icons">check_circle</span>
          <span>Latest confirmed: <strong>${data.day} @ ${data.time.substring(
          0,
          5
        )}</strong> (${data.location})</span>
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

// 4. Exit Button Logic
const exitBtn = document.getElementById("exitBtn");
if (exitBtn) {
  exitBtn.onclick = () => {
    window.location.href = "/Dashboard/dashboard.html";
  };
}
