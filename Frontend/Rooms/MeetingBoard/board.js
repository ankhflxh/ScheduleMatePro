// File: Frontend/Rooms/MeetingBoard/board.js

const token = localStorage.getItem("sm_token");
const roomId = new URLSearchParams(window.location.search).get("roomId");

if (!token) window.location.href = "/LoginPage/login.html";
if (!roomId) alert("Room ID missing");

let currentUserId = null;
let roomCreatorId = null;

async function init() {
  try {
    const [meRes, roomRes] = await Promise.all([
      fetch("/api/users/me", { headers: { "X-Auth-Token": token } }),
      fetch(`/api/rooms/${roomId}`, { headers: { "X-Auth-Token": token } }),
    ]);
    const me = await meRes.json();
    const room = await roomRes.json();
    currentUserId = String(me.user_id || me.id);
    roomCreatorId = String(room.creator_id);
  } catch (e) {
    console.error("Init error:", e);
  }
  loadMeetingHistory();
}

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

        const isCreator = currentUserId === roomCreatorId;
        const canDelete = isCreator && status !== "past";

        // Show join call button only on the day of the meeting
        const meetingDayIdx = days.indexOf(m.meeting_day);
        const isToday = meetingDayIdx === currentDayIndex;
        const canJoin = isToday && status !== "past" && m.daily_room_url;

        card.innerHTML = `
                <div class="card-day">${m.meeting_day}</div>
                <div class="card-time">${cleanStart} - ${cleanEnd}</div>
                <div class="card-loc">
                    <span class="material-icons" style="font-size:1rem">place</span> ${m.location}
                </div>
                ${
                  canJoin
                    ? `
                <a href="${m.daily_room_url}" target="_blank" class="join-call-btn">
                  <span class="material-icons">videocam</span> Join Call
                </a>`
                    : ""
                }

                ${
                  status !== "past"
                    ? `
                <div class="rsvp-section">
                  <div class="rsvp-label">Your attendance</div>
                  <div class="rsvp-btns">
                    <button class="rsvp-btn rsvp-inperson" data-mid="${m.id}" data-mode="in_person">
                      <span class="material-icons">place</span> In Person
                    </button>
                    <button class="rsvp-btn rsvp-online" data-mid="${m.id}" data-mode="online">
                      <span class="material-icons">videocam</span> Online
                    </button>
                    <button class="rsvp-btn rsvp-cant" data-mid="${m.id}" data-mode="cant_attend">
                      <span class="material-icons">cancel</span> Can't Go
                    </button>
                  </div>
                  <div class="rsvp-current" id="rsvp-status-${m.id}"></div>
                </div>`
                    : ""
                }

                ${
                  canDelete
                    ? `
                <button class="delete-meeting-btn" data-id="${m.id}" data-day="${m.meeting_day}" data-time="${cleanStart}">
                  <span class="material-icons">cancel</span> Cancel Meeting
                </button>`
                    : ""
                }
            `;

        if (status === "active" && activeEl) activeEl.appendChild(card);
        else if (status === "past" && pastEl) pastEl.appendChild(card);
        else if (upcomingEl) upcomingEl.appendChild(card);
      });

      // Attach RSVP handlers
      document.querySelectorAll(".rsvp-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const meetingId = btn.dataset.mid;
          const mode = btn.dataset.mode;
          const response = mode === "cant_attend" ? "cant_attend" : "accepted";

          document
            .querySelectorAll(`.rsvp-btn[data-mid="${meetingId}"]`)
            .forEach((b) => (b.disabled = true));

          try {
            const res = await fetch(`/api/suggest/${roomId}/respond`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Auth-Token": token,
              },
              body: JSON.stringify({ response, attendance_mode: mode }),
            });

            if (res.ok) {
              const labels = {
                in_person: "🟢 In Person",
                online: "🔵 Online",
                cant_attend: "❌ Can't Go",
              };
              const statusEl = document.getElementById(
                `rsvp-status-${meetingId}`,
              );
              if (statusEl) statusEl.textContent = `Saved: ${labels[mode]}`;
            }
          } catch (e) {
            console.error("RSVP error:", e);
          }

          document
            .querySelectorAll(`.rsvp-btn[data-mid="${meetingId}"]`)
            .forEach((b) => (b.disabled = false));
        });
      });

      // Load existing attendance for this user
      (async () => {
        try {
          const rsvpRes = await fetch(`/api/suggest/${roomId}/responses`, {
            headers: { "X-Auth-Token": token },
          });
          const rsvpData = await rsvpRes.json();
          if (rsvpData.responses) {
            const meRes = await fetch("/api/users/me", {
              headers: { "X-Auth-Token": token },
            });
            const me = await meRes.json();
            const myRsvp = rsvpData.responses.find(
              (r) => r.username === me.username,
            );
            if (myRsvp) {
              const labels = {
                in_person: "🟢 In Person",
                online: "🔵 Online",
                cant_attend: "❌ Can't Go",
              };
              document.querySelectorAll(".rsvp-current").forEach((el) => {
                el.textContent = `Current: ${labels[myRsvp.attendance_mode] || myRsvp.attendance_mode}`;
              });
            }
          }
        } catch (e) {
          console.error("Load RSVP error:", e);
        }
      })();

      // Attach delete handlers
      document.querySelectorAll(".delete-meeting-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const meetingId = btn.dataset.id;
          const day = btn.dataset.day;
          const time = btn.dataset.time;
          showDeleteModal(meetingId, day, time);
        });
      });
    })
    .catch((err) => console.error("Error loading history:", err));
}

// ─── DELETE MEETING MODAL ─────────────────────────────────────────
function showDeleteModal(meetingId, day, time) {
  const modal = document.getElementById("deleteMeetingModal");
  const msg = document.getElementById("deleteMeetingMsg");
  if (msg) msg.textContent = `Cancel the meeting on ${day} at ${time}?`;
  if (modal) modal.style.display = "flex";

  document.getElementById("confirmDeleteMeeting").onclick = async () => {
    modal.style.display = "none";
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
        headers: { "X-Auth-Token": token },
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to cancel meeting.");
        return;
      }
      loadMeetingHistory();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Something went wrong.");
    }
  };

  document.getElementById("cancelDeleteMeeting").onclick = () => {
    modal.style.display = "none";
  };
}

// Run
init();
