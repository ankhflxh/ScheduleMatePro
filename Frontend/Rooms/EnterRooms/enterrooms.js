// File: Frontend/Rooms/EnterRooms/enterrooms.js

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
        headerLabel.textContent = `${roomName}'s Room`;
      }
    })
    .catch((err) => console.warn("Failed to load room info", err));
}

// 2. Check for Confirmed Meeting (Top Banner)
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

// 3. NEW: Load Meeting History / Status Board
if (roomId) {
  loadMeetingHistory(roomId);
}

function loadMeetingHistory(roomId) {
  fetch(`/api/meetings/history/${roomId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((meetings) => {
      const upcomingEl = document.getElementById("upcoming-list");
      const activeEl = document.getElementById("active-list");
      const pastEl = document.getElementById("past-list");

      // Clear lists
      if (upcomingEl) upcomingEl.innerHTML = "";
      if (activeEl) activeEl.innerHTML = "";
      if (pastEl) pastEl.innerHTML = "";

      if (!meetings || meetings.length === 0) {
        if (upcomingEl)
          upcomingEl.innerHTML =
            "<p style='font-size:0.85rem; color:#94a3b8;'>No meetings found.</p>";
        return;
      }

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

      meetings.forEach((m) => {
        const dayIndex = days.indexOf(m.meeting_day);

        // Parse times
        const start = new Date();
        const [sH, sM] = m.start_time.split(":");
        start.setHours(sH, sM, 0);

        const end = new Date();
        const [eH, eM] = m.end_time.split(":");
        end.setHours(eH, eM, 0);

        let status = "upcoming";

        // Categorization Logic (Weekly Cycle)
        if (dayIndex === currentDayIndex) {
          // Today
          if (now >= start && now <= end) {
            status = "active";
          } else if (now > end) {
            status = "past";
          } else {
            status = "upcoming";
          }
        } else if (dayIndex < currentDayIndex) {
          // Earlier in the week = Past
          status = "past";
        } else {
          // Later in the week = Upcoming
          status = "upcoming";
        }

        // Create Card
        const card = document.createElement("div");
        card.style.background = "rgba(255,255,255,0.6)";
        card.style.padding = "10px";
        card.style.marginBottom = "8px";
        card.style.borderRadius = "12px";
        card.style.fontSize = "0.9rem";
        card.style.borderLeft = `4px solid ${
          status === "active"
            ? "#10b981"
            : status === "past"
            ? "#94a3b8"
            : "#6366f1"
        }`;

        const cleanStart = m.start_time.substring(0, 5);
        const cleanEnd = m.end_time.substring(0, 5);

        card.innerHTML = `
            <div style="font-weight:700; color:#1e293b;">${m.meeting_day}</div>
            <div style="color:#475569;">${cleanStart} - ${cleanEnd}</div>
            <div style="color:#64748b; font-size:0.85em; margin-top:4px;">📍 ${m.location}</div>
        `;

        if (status === "active" && activeEl) activeEl.appendChild(card);
        else if (status === "past" && pastEl) pastEl.appendChild(card);
        else if (upcomingEl) upcomingEl.appendChild(card);
      });
    })
    .catch((err) => console.error("History load error:", err));
}

// 4. Exit Button Logic
const exitBtn = document.getElementById("exitBtn");
if (exitBtn) {
  exitBtn.onclick = () => {
    window.location.href = "/Dashboard/dashboard.html";
  };
}
