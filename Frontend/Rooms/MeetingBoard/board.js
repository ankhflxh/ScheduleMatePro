const token = localStorage.getItem("sm_token");
const roomId = new URLSearchParams(window.location.search).get("roomId");

if (!token) window.location.href = "/LoginPage/login.html";
if (!roomId) alert("Room ID missing");

const API_BASE = ""; // Or your backend URL

function loadMeetingHistory() {
  fetch(`/api/meetings/history/${roomId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((meetings) => {
      const upcomingEl = document.getElementById("upcoming-list");
      const activeEl = document.getElementById("active-list");
      const pastEl = document.getElementById("past-list");

      upcomingEl.innerHTML = "";
      activeEl.innerHTML = "";
      pastEl.innerHTML = "";

      if (!meetings || meetings.length === 0) {
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
        // This allows us to check "Time of Day" status
        const start = new Date();
        const [sH, sM] = m.start_time.split(":");
        start.setHours(sH, sM, 0);

        const end = new Date();
        const [eH, eM] = m.end_time.split(":");
        end.setHours(eH, eM, 0);

        let status = "upcoming";

        // LOGIC: Categorize based on Weekly Cycle
        if (dayIndex === currentDayIndex) {
          // It's TODAY
          if (now >= start && now <= end) {
            status = "active";
          } else if (now > end) {
            status = "past";
          } else {
            status = "upcoming";
          }
        } else if (dayIndex < currentDayIndex) {
          // Day has passed this week (e.g. Today is Wed, Meeting was Mon)
          status = "past";
        } else {
          // Day is later this week (e.g. Today is Mon, Meeting is Wed)
          status = "upcoming";
        }

        // Render Card
        const card = document.createElement("div");
        card.className = `meeting-card ${status}-card`;

        const cleanStart = m.start_time.substring(0, 5);
        const cleanEnd = m.end_time.substring(0, 5);

        card.innerHTML = `
                <div class="card-day">${m.meeting_day}</div>
                <div class="card-time">${cleanStart} - ${cleanEnd}</div>
                <div class="card-loc">
                    <span class="material-icons">place</span> ${m.location}
                </div>
            `;

        if (status === "active") activeEl.appendChild(card);
        else if (status === "past") pastEl.appendChild(card);
        else upcomingEl.appendChild(card);
      });
    })
    .catch((err) => console.error("Error loading history:", err));
}

// Run
loadMeetingHistory();
