// File: Frontend/Rooms/MeetingBoard/board.js

const token = localStorage.getItem("sm_token");
const roomId = new URLSearchParams(window.location.search).get("roomId");

if (!token) window.location.href = "/LoginPage/login.html";
if (!roomId) alert("Room ID missing");

function loadMeetingHistory() {
  fetch(`/api/meetings/history/${roomId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((meetings) => {
      const upcomingEl = document.getElementById("upcoming-list");
      const activeEl = document.getElementById("active-list");
      const pastEl = document.getElementById("past-list");

      // Clear existing content
      if (upcomingEl) upcomingEl.innerHTML = "";
      if (activeEl) activeEl.innerHTML = "";
      if (pastEl) pastEl.innerHTML = "";

      if (!meetings || meetings.length === 0) {
        if (upcomingEl)
          upcomingEl.innerHTML =
            "<div class='empty-msg'>No meetings found.</div>";
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
      const currentDayIndex = now.getDay(); // 0-6

      meetings.forEach((m) => {
        const dayIndex = days.indexOf(m.meeting_day);

        // Build Date objects for Today using the meeting times
        const start = new Date();
        const [sH, sM] = m.start_time.split(":");
        start.setHours(sH, sM, 0);

        const end = new Date();
        const [eH, eM] = m.end_time.split(":");
        end.setHours(eH, eM, 0);

        // --- STATUS CATEGORIZATION ---
        let status = "upcoming";

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
          // Day passed this week
          status = "past";
        } else {
          // Day is later this week
          status = "upcoming";
        }

        // --- VISUAL FIX FOR OLD DATA (11:00 - 11:00) ---
        let cleanStart = m.start_time.substring(0, 5);
        let cleanEnd = m.end_time.substring(0, 5);

        // If start == end (old bug), force a 1-hour duration for display
        if (cleanStart === cleanEnd) {
          const fixDate = new Date();
          fixDate.setHours(parseInt(sH), parseInt(sM), 0);
          fixDate.setHours(fixDate.getHours() + 1); // Add 1 hour

          // Format as HH:MM
          const fixH = String(fixDate.getHours()).padStart(2, "0");
          const fixM = String(fixDate.getMinutes()).padStart(2, "0");
          cleanEnd = `${fixH}:${fixM}`;
        }

        // --- RENDER CARD ---
        const card = document.createElement("div");
        card.className = `meeting-card ${status}-card`;

        card.innerHTML = `
                <div class="card-day">${m.meeting_day}</div>
                <div class="card-time">${cleanStart} - ${cleanEnd}</div>
                <div class="card-loc">
                    <span class="material-icons" style="font-size:1rem">place</span> ${m.location}
                </div>
            `;

        if (status === "active" && activeEl) activeEl.appendChild(card);
        else if (status === "past" && pastEl) pastEl.appendChild(card);
        else if (upcomingEl) upcomingEl.appendChild(card);
      });
    })
    .catch((err) => console.error("Error loading history:", err));
}

// Run
loadMeetingHistory();
