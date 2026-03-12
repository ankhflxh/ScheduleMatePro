// File: Frontend/Dashboard/dashboard.js

// --- PUSH NOTIFICATION KEY ---
const publicVapidKey =
  "BIfzy3VGRoVGr4y3_1zUPwv2e224h0KR2KA7rAYgBnXge42f_8PTVFAWY7vCmKXWrqh8j9HwUc_kTNJ0GfDePsc";

// --- DOM ELEMENTS & MODALS ---
const roomsContainer = document.querySelector("#my-rooms");
const meetingsList = document.querySelector("#my-meetings");
const noRoomsMsg = document.querySelector("#no-rooms-message");
const noMeetingsMsg = document.querySelector("#no-meetings-message");
const createForm = document.querySelector("#create-room-form");
const joinForm = document.querySelector("#join-room-form");
const roomNameError = document.getElementById("roomNameError");

const infoModal = document.getElementById("infoModal");
const infoTitle = document.getElementById("infoModalTitle");
const infoBody = document.getElementById("infoModalBody");
const infoOkBtn = document.getElementById("infoModalOk");

function showModal(title, message) {
  if (infoTitle && infoBody && infoModal) {
    infoTitle.textContent = title;
    infoBody.textContent = message;
    infoModal.style.display = "grid";
  }
}
if (infoOkBtn) infoOkBtn.onclick = () => (infoModal.style.display = "none");

function isRoomNameValid(name) {
  return /^[A-Za-z]{4,}$/.test(name);
}
const createRoomNameInput = document.getElementById("create-room-name");
if (createRoomNameInput) {
  createRoomNameInput.addEventListener("input", () => {
    roomNameError.style.display = "none";
  });
}

// --- AUTH & INIT ---
const token = localStorage.getItem("sm_token");

if (!token) {
  window.location.href = "/LoginPage/login.html";
} else {
  fetch("/api/users/me", {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Session expired");
      return res.json();
    })
    .then((user) => {
      const userId = user.user_id || user.id;
      window.SLOTIFY_USER_ID = userId; // Used later by Push Notifications!

      const titleEl = document.getElementById("dashboard-title");
      const nameToDisplay = user.username || user.user_username || "User";
      const displayName =
        nameToDisplay.charAt(0).toUpperCase() + nameToDisplay.slice(1);

      if (titleEl) {
        titleEl.textContent = `${displayName}'s Dashboard`;
      }

      const isFirstVisit = !user.has_seen_tour;
      TourManager.init(isFirstVisit, displayName);

      loadRooms(userId);
      loadMeetings(userId);
      checkSubscriptionStatus();
      checkForJoinCode(); // Auto-detect join code from shared link
    })
    .catch((err) => {
      console.error("Dashboard Load Error:", err);
      if (err.message === "Session expired") {
        localStorage.removeItem("sm_token");
        window.location.href = "/LoginPage/login.html";
      }
    });
}

// --- CORE DASHBOARD FUNCTIONS ---
function isUpcoming(dayName, endTimeStr) {
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
  const meetingDayIndex = days.indexOf(dayName);

  if (meetingDayIndex === -1) return true;
  if (currentDayIndex === meetingDayIndex) {
    const [hours, minutes] = endTimeStr.split(":");
    const meetingEndTimeToday = new Date();
    meetingEndTimeToday.setHours(hours, minutes, 0);
    return now < meetingEndTimeToday;
  }
  if (meetingDayIndex > currentDayIndex) return true;
  return false;
}

function loadRooms(userId) {
  fetch(`/api/rooms/me?userId=${userId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((rooms) => {
      if (roomsContainer) roomsContainer.innerHTML = "";
      if (!rooms || rooms.length === 0) {
        if (roomsContainer) roomsContainer.style.display = "none";
        if (noRoomsMsg) noRoomsMsg.style.display = "flex";
        return;
      }
      if (roomsContainer) roomsContainer.style.display = "grid";
      if (noRoomsMsg) noRoomsMsg.style.display = "none";
      rooms.forEach((room) => {
        const card = document.createElement("div");
        card.className = "room-card";
        const roomName = room.room_name || room.name;
        const roomId = room.room_id || room.id;
        const codeDisplay = room.code
          ? `Code: <span style="font-family:monospace; background:#edf2f7; padding:2px 5px; border-radius:4px;">${room.code}</span>`
          : "";
        card.innerHTML = `
          <div class="room-name">${roomName}</div>
          <div class="card-actions">
            <button class="btn-share share-room-btn" data-room-id="${roomId}" data-room-name="${roomName}" data-room-code="${room.code}" title="Share room code">
              <span class="material-icons">share</span>
            </button>
            <a href="/Rooms/EnterRooms/enterrooms.html?roomId=${roomId}" class="btn-enter">
              Enter Room <span class="material-icons" style="font-size:1.2rem">arrow_forward</span>
            </a>
          </div>`;
        if (roomsContainer) roomsContainer.appendChild(card);
      });
    })
    .catch(console.error);
}

function loadMeetings(userId) {
  fetch(`/api/meetings/me?userId=${userId}`, {
    headers: { "X-Auth-Token": token },
  })
    .then((res) => res.json())
    .then((meetings) => {
      if (meetingsList) meetingsList.innerHTML = "";
      const upcomingMeetings = meetings.filter(
        (m) =>
          m.meeting_day && m.end_time && isUpcoming(m.meeting_day, m.end_time),
      );
      if (!upcomingMeetings.length) {
        if (noMeetingsMsg) noMeetingsMsg.style.display = "flex";
        return;
      }
      if (noMeetingsMsg) noMeetingsMsg.style.display = "none";
      upcomingMeetings.forEach((m) => {
        const div = document.createElement("div");
        div.className = "meeting-item";
        const cleanStart = m.start_time ? m.start_time.substring(0, 5) : "";
        div.innerHTML = `
          <div class="meeting-time">${m.meeting_day} @ ${cleanStart}</div>
          <div class="meeting-info">Room: ${m.room_name}</div>
          <div class="meeting-loc"><span class="material-icons" style="font-size:1rem">place</span> ${m.location}</div>
        `;
        if (meetingsList) meetingsList.appendChild(div);
      });
    })
    .catch(console.error);
}

// --- FORM EVENT LISTENERS ---
if (createForm) {
  createForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("create-room-name");
    const name = nameInput.value.trim();
    if (!isRoomNameValid(name)) {
      roomNameError.textContent =
        "Name must be 4+ letters, no numbers/symbols.";
      roomNameError.style.display = "block";
      return;
    }
    fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      body: JSON.stringify({ name }),
    })
      .then((res) => res.json())
      .then((room) => {
        if (room.error) throw new Error(room.error);
        showModal("Success", `Room "${room.name}" created! Code: ${room.code}`);
        nameInput.value = "";
        loadRooms(window.SLOTIFY_USER_ID);
      })
      .catch((err) => showModal("Error", err.message));
  });
}

if (joinForm) {
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const codeInput = document.getElementById("join-room-code");
    const code = codeInput.value.trim();
    fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      body: JSON.stringify({ inviteCode: code }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        showModal("Joined!", "You have successfully joined the room.");
        codeInput.value = "";
        loadRooms(window.SLOTIFY_USER_ID);
      })
      .catch((err) => showModal("Error", err.message));
  });
}

// --- JOIN VIA LINK ---
let pendingJoinCode = null;
let pendingRoomName = null;

async function checkForJoinCode() {
  const params = new URLSearchParams(window.location.search);
  // Check URL param first, then fall back to sessionStorage (set by login.js)
  const code =
    params.get("joinCode") || sessionStorage.getItem("pendingJoinCode");
  if (!code) return;

  // Clear both so refreshing doesn't re-trigger
  window.history.replaceState({}, document.title, window.location.pathname);
  sessionStorage.removeItem("pendingJoinCode");

  // Look up the room name from the code so the modal feels personal
  try {
    const res = await fetch(`/api/rooms/lookup?code=${code}`, {
      headers: { "X-Auth-Token": token },
    });
    const data = await res.json();
    if (data.error || !data.name) {
      showModal("Invalid Code", "This room code doesn't exist or has expired.");
      return;
    }
    pendingJoinCode = code;
    pendingRoomName = data.name;
    document.getElementById("joinLinkTitle").textContent =
      `Join "${data.name}"?`;
    document.getElementById("joinLinkBody").textContent =
      `You've been invited to join the room "${data.name}". Would you like to join?`;
    document.getElementById("joinLinkModal").style.display = "grid";
  } catch (err) {
    showModal("Error", "Could not look up that room. Please try again.");
  }
}

window.closeJoinLinkModal = () => {
  document.getElementById("joinLinkModal").style.display = "none";
  pendingJoinCode = null;
  pendingRoomName = null;
};

window.confirmJoinViaLink = async () => {
  if (!pendingJoinCode) return;
  try {
    const res = await fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      body: JSON.stringify({ inviteCode: pendingJoinCode }),
    });
    const data = await res.json();
    window.closeJoinLinkModal();
    if (data.error) {
      // "Already in room" is still a success state
      if (data.error.toLowerCase().includes("already")) {
        showModal(
          "Already a Member",
          `You're already in "${pendingRoomName || "this room"}"!`,
        );
      } else {
        showModal("Error", data.error);
      }
    } else {
      showModal("Welcome! 🎉", `You have now joined "${pendingRoomName}"!`);
      loadRooms(window.SLOTIFY_USER_ID);
    }
  } catch (err) {
    showModal("Error", "Something went wrong. Please try again.");
  }
};

// --- SHARE MODAL ---
let shareTargetCode = "";
let shareTargetName = "";
let shareTargetLink = "";

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".share-room-btn");
  if (btn) {
    window.openShareModal(btn.dataset.roomName, btn.dataset.roomCode);
  }
});

window.openShareModal = (roomName, code) => {
  shareTargetCode = code;
  shareTargetName = roomName;
  document.getElementById("shareModalRoomName").textContent = roomName;
  document.getElementById("shareModalCode").textContent = code;

  // Build the deep link so the recipient can tap and join directly
  const joinLink = `https://schedulematepro.onrender.com/LoginPage/login.html?joinCode=${code}`;
  shareTargetLink = joinLink;

  // Generate QR code using qrcode library (toCanvas API)
  const qrContainer = document.getElementById("qrCodeContainer");
  qrContainer.innerHTML = "";
  const canvas = document.createElement("canvas");
  qrContainer.appendChild(canvas);
  QRCode.toCanvas(
    canvas,
    joinLink,
    {
      width: 160,
      margin: 2,
      color: { dark: "#1e293b", light: "#ffffff" },
    },
    (err) => {
      if (err) console.error("QR generation failed:", err);
    },
  );

  document.getElementById("shareModal").style.display = "grid";
};

window.closeShareModal = () => {
  document.getElementById("shareModal").style.display = "none";
};

window.copyRoomCode = () => {
  navigator.clipboard.writeText(shareTargetCode).then(() => {
    showModal("Copied!", `Room code "${shareTargetCode}" copied to clipboard.`);
    window.closeShareModal();
  });
};

window.nativeShare = async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Join my room on ScheduleMate Pro!",
        text: `Hey! Join my room "${shareTargetName}" on ScheduleMate Pro.\n\nRoom Code: ${shareTargetCode}\n\nTap the link to open the app and enter the code:\n${shareTargetLink}`,
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        showModal("Error", "Could not open share sheet.");
      }
    }
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(shareTargetCode).then(() => {
      showModal(
        "Copied!",
        "Sharing isn't supported in this browser, so the code has been copied to your clipboard instead.",
      );
      window.closeShareModal();
    });
  }
};

// --- TOUR & CHATBOT MANAGER ---
const TourManager = {
  step: 0,
  autoCloseTimer: null,

  init: function (isFirstVisit, username) {
    const bubble = document.getElementById("guide-bubble");
    const toggle = document.getElementById("guide-toggle");
    const avatar = document.getElementById("amara-avatar");
    const title = document.querySelector("#guide-text-content h3");
    const text = document.querySelector("#guide-text-content p");
    const actions = document.getElementById("guide-actions");
    const chatOptions = document.getElementById("chat-options");

    if (isFirstVisit) {
      avatar.style.display = "block";
      bubble.style.display = "block";
      toggle.style.display = "none";
      actions.style.display = "flex";
      chatOptions.style.display = "none";

      title.textContent = `Hi ${username}!`;
      text.innerHTML = `I am Amara and I will love to show you what I have built just to make navigation easy for you but feel free to skip. You could always visit me at the corner of the screen if you have any questions and I will be delighted to help cause it gets lonely 😞. Okay so let's get started!`;
    } else {
      avatar.style.display = "none";
      bubble.style.display = "none";
      toggle.style.display = "flex";
    }
  },

  startTour: function () {
    this.step = 0;
    if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
    document.getElementById("tour-overlay").classList.add("active");
    this.nextStep();
  },

  nextStep: function () {
    this.step++;
    this.clearHighlights();

    const title = document.querySelector("#guide-text-content h3");
    const text = document.querySelector("#guide-text-content p");
    const actions = document.getElementById("guide-actions");

    if (this.step === 1) {
      // TOUR STEP 1: NOTIFICATIONS FIRST
      this.highlight(".notification-banner");
      title.textContent = "1. Enable Notifications 🔔";
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isIOS) {
        text.innerHTML = `This is <strong>really important!</strong> To receive meeting reminders, install the app first. Tap <strong>Share</strong> <span class="material-icons" style="font-size:1em; vertical-align:middle;">ios_share</span> then <strong>'Add to Home Screen'</strong>, open it from your home screen and tap <strong>Enable Meeting Reminders</strong>. Without this you won't be notified when meetings are starting!`;
      } else {
        text.innerHTML = `Don't skip this! Tap <strong>"Enable Meeting Reminders"</strong> above and allow notifications. This is how you'll know when a meeting is <strong>confirmed</strong>, <strong>starting soon</strong>, or when your <strong>schedule has been updated</strong>.`;
      }
      this.setNextBtn("Next");
    } else if (this.step === 2) {
      this.highlight(".create-card");
      title.textContent = "2. Create Rooms";
      text.textContent =
        "Start here! Create a secure room for your team or class. You'll get a unique code to share.";
      this.setNextBtn("Next");
    } else if (this.step === 3) {
      this.highlight(".join-card");
      title.textContent = "3. Join Rooms";
      text.textContent =
        "Received a code? Enter it here to join an existing schedule instantly.";
      this.setNextBtn("Next");
    } else if (this.step === 4) {
      this.highlight(".rooms-section");
      title.textContent = "4. Your Hub";
      text.textContent =
        "All your joined rooms appear here. Click 'Enter Room' to vote on times or view notes.";
      this.setNextBtn("Next");
    } else if (this.step === 5) {
      this.highlight(".meetings-section");
      title.textContent = "5. Upcoming";
      text.textContent =
        "Never miss a beat. Your finalized meetings for the week will appear right here.";
      this.setNextBtn("Finish");
    } else {
      this.endTour();
    }
  },

  highlight: function (selector) {
    const el = document.querySelector(selector);
    if (el) {
      el.classList.add("tour-highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },

  clearHighlights: function () {
    document.querySelectorAll(".tour-highlight").forEach((el) => {
      el.classList.remove("tour-highlight");
    });
  },

  setNextBtn: function (text) {
    const actions = document.getElementById("guide-actions");
    actions.innerHTML = `
      <button onclick="TourManager.nextStep()" class="guide-btn primary">${text}</button>
      <button onclick="TourManager.endTour()" class="guide-btn secondary">Stop</button>
    `;
  },

  endTour: function () {
    this.clearHighlights();
    document.getElementById("tour-overlay").classList.remove("active");

    fetch("/api/users/tour-complete", {
      method: "POST",
      headers: { "X-Auth-Token": token },
    }).catch(console.error);

    const title = document.querySelector("#guide-text-content h3");
    const text = document.querySelector("#guide-text-content p");
    const actions = document.getElementById("guide-actions");
    const chatOptions = document.getElementById("chat-options");

    title.textContent = "I'm here to help!";
    text.textContent = "Click me anytime if you get stuck.";

    actions.style.display = "none";
    chatOptions.style.display = "none";

    this.autoCloseTimer = setTimeout(() => {
      document.getElementById("guide-bubble").style.display = "none";
      document.getElementById("amara-avatar").style.display = "none";
      document.getElementById("guide-toggle").style.display = "flex";
    }, 3000);
  },

  toggleChat: function (e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }

    const bubble = document.getElementById("guide-bubble");
    const toggle = document.getElementById("guide-toggle");
    const avatar = document.getElementById("amara-avatar");
    const actions = document.getElementById("guide-actions");
    const chatOptions = document.getElementById("chat-options");
    const overlay = document.getElementById("tour-overlay");

    if (overlay.classList.contains("active")) return;

    if (bubble.style.display === "none") {
      avatar.style.display = "block";
      bubble.style.display = "block";
      toggle.style.display = "none";

      document.querySelector("#guide-text-content h3").textContent =
        "Help Center";
      document.querySelector("#guide-text-content p").textContent =
        "How can Amara help you today?";
      actions.style.display = "none";
      chatOptions.style.display = "flex";
    } else {
      avatar.style.display = "none";
      bubble.style.display = "none";
      toggle.style.display = "flex";
    }
  },

  answer: function (topic) {
    const text = document.querySelector("#guide-text-content p");

    if (topic === "notifications") {
      text.innerHTML = `Enabling notifications means you'll get <strong>push alerts</strong> directly to your phone — no need to check the app manually! You'll be notified when a <strong>meeting is confirmed</strong>, when one is <strong>starting in 30 or 5 minutes</strong>, when a <strong>new note</strong> is added, and when the <strong>meeting schedule is updated</strong>. Without it, you could miss important updates from your group.`;
    } else if (topic === "install") {
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isIOS) {
        text.innerHTML = `<strong>iOS Instructions:</strong><br>1. Tap the <strong>Share</strong> button <span class="material-icons" style="font-size:1em; vertical-align:middle;">ios_share</span> below.<br>2. Scroll down and tap <strong>'Add to Home Screen'</strong>.<br>3. Open the app from your home screen to enable push notifications.`;
      } else {
        text.innerHTML = `<strong>Android / Chrome:</strong><br>Tap the menu dots (⋮) and select <strong>'Install App'</strong> or click the Install icon in your address bar. Once installed, notifications can be enabled.`;
      }
    } else if (topic === "overview") {
      text.textContent =
        "It's easy! Create a room, invite friends, vote on availability, and let the app find the perfect meeting time.";
    } else if (topic === "availability") {
      text.textContent =
        "Go into any room and click 'My Availability'. You can select multiple time slots that work for you.";
    } else if (topic === "notes") {
      text.textContent =
        "Click the 'Notes' card inside a room. You can write messages, to-do lists, and upload images to share.";
    } else if (topic === "leave") {
      text.textContent =
        "On the Dashboard, click the 'Trash Can' icon on any room card to leave. If you are the creator, this deletes the room.";
    } else if (topic === "edit") {
      text.textContent =
        "Yes! You can update your availability anytime. Just go back to the room and click 'Edit Mine'.";
    }
  },

  resetChat: function () {
    document.querySelector("#guide-text-content p").textContent =
      "How can Amara help you today?";
  },
};

// ----------------------------------------------------------------
// --- WEB PUSH NOTIFICATION SETUP --------------------------------
// ----------------------------------------------------------------

// Helper to show/hide banner based on whether THIS user has an active subscription
async function checkSubscriptionStatus() {
  const banner = document.querySelector(".notification-banner");
  if (!banner) return;

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      banner.style.display = "block";
      return;
    }

    const currentUserId = window.SLOTIFY_USER_ID;
    const res = await fetch("/api/notifications/check-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        userId: currentUserId,
      }),
    });

    const data = await res.json();

    if (data.subscribed) {
      banner.style.display = "none";
    } else {
      await subscription.unsubscribe();
      banner.style.display = "block";
    }
  } catch (err) {
    console.warn("Could not verify subscription status:", err);
    banner.style.display = "block";
  }
}

async function setupPushNotifications() {
  if ("serviceWorker" in navigator && "PushManager" in window) {
    try {
      console.log("Registering Service Worker...");
      const register = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      console.log("Service Worker Registered!");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showModal(
          "Notifications Blocked",
          "You won't get meeting reminders unless you allow notifications in your browser settings.",
        );
        return;
      }

      console.log("Registering Push...");
      const subscription = await register.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      });
      console.log("Push Registered!");

      const currentUserId = window.SLOTIFY_USER_ID;

      await fetch("/api/notifications/subscribe", {
        method: "POST",
        body: JSON.stringify({
          subscription: subscription,
          userId: currentUserId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Hide banner after successful subscription
      const banner = document.querySelector(".notification-banner");
      if (banner) banner.style.display = "none";

      showModal(
        "Success!",
        "Notifications are enabled. You will now receive meeting reminders!",
      );
    } catch (err) {
      console.error("Error setting up push notifications:", err);
      showModal(
        "Error",
        "Could not enable notifications. Check console for details.",
      );
    }
  } else {
    showModal(
      "Unsupported",
      "Push notifications are not supported in this browser.",
    );
  }
}

// Helper function to convert the string VAPID key into a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
