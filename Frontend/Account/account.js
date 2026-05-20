// File: Account/account.js
const token = localStorage.getItem("sm_token");
if (!token) window.location.href = "/LoginPage/login.html";

const GET_H = { headers: { "X-Auth-Token": token } };
let userData = {};

// ── LOAD USER DATA ────────────────────────────────────────────────
async function loadUser() {
  const res = await fetch("/api/users/me", GET_H);
  if (!res.ok) {
    window.location.href = "/LoginPage/login.html";
    return;
  }
  userData = await res.json();

  document.getElementById("avatarCircle").textContent =
    userData.user_username[0].toUpperCase();
  document.getElementById("displayUsername").textContent =
    userData.user_username;
  document.getElementById("displayEmail").textContent = userData.email;
  document.getElementById("usernameVal").textContent = userData.user_username;
  document.getElementById("emailVal").textContent = userData.email;
}
loadUser();

// ── MODAL ─────────────────────────────────────────────────────────
let currentMode = null;

function openModal(mode) {
  currentMode = mode;
  const titles = {
    username: "Change Username",
    email: "Change Email",
    password: "Change Password",
  };
  document.getElementById("modalTitle").textContent = titles[mode];
  document.getElementById("modalError").style.display = "none";

  const fields = document.getElementById("modalFields");
  if (mode === "username") {
    fields.innerHTML = `<input class="modal-input" id="f1" type="text" placeholder="New username" value="${userData.user_username}" maxlength="30" />`;
  } else if (mode === "email") {
    fields.innerHTML = `<input class="modal-input" id="f1" type="email" placeholder="New email" value="${userData.email}" />`;
  } else {
    fields.innerHTML = `
      <input class="modal-input" id="f0" type="password" placeholder="Current password" />
      <input class="modal-input" id="f1" type="password" placeholder="New password (min 8 chars)" />
      <input class="modal-input" id="f2" type="password" placeholder="Confirm new password" />`;
  }

  document.getElementById("editModal").style.display = "flex";
  setTimeout(() => document.getElementById("f1")?.focus(), 100);
}

function closeModal() {
  document.getElementById("editModal").style.display = "none";
  currentMode = null;
}

function showModalError(msg) {
  const el = document.getElementById("modalError");
  el.textContent = msg;
  el.style.display = "block";
}

document.getElementById("modalSaveBtn").addEventListener("click", async () => {
  const saveBtn = document.getElementById("modalSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    let body = {};
    if (currentMode === "username") {
      const val = document.getElementById("f1").value.trim();
      if (val.length < 3) {
        showModalError("Username must be at least 3 characters.");
        return;
      }
      body = { username: val };
    } else if (currentMode === "email") {
      const val = document.getElementById("f1").value.trim();
      if (!val.includes("@")) {
        showModalError("Enter a valid email address.");
        return;
      }
      body = { email: val };
    } else {
      const current = document.getElementById("f0").value;
      const next = document.getElementById("f1").value;
      const confirm = document.getElementById("f2").value;
      if (next.length < 8) {
        showModalError("Password must be at least 8 characters.");
        return;
      }
      if (next !== confirm) {
        showModalError("Passwords don't match.");
        return;
      }
      body = { currentPassword: current, newPassword: next };
    }

    const res = await fetch("/api/auth/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      showModalError(data.error || "Update failed.");
      return;
    }

    closeModal();
    loadUser();
  } catch (err) {
    showModalError("Something went wrong. Please try again.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }
});

// ── LOGOUT ────────────────────────────────────────────────────────
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("sm_token");
  window.location.href = "/LoginPage/login.html";
});

// ── DELETE ACCOUNT ────────────────────────────────────────────────
document.getElementById("deleteBtn").addEventListener("click", () => {
  document.getElementById("deletePassword").value = "";
  document.getElementById("deleteError").style.display = "none";
  document.getElementById("deleteModal").style.display = "flex";
});

document
  .getElementById("confirmDeleteBtn")
  .addEventListener("click", async () => {
    const password = document.getElementById("deletePassword").value;
    const errEl = document.getElementById("deleteError");
    const btn = document.getElementById("confirmDeleteBtn");

    if (!password) {
      errEl.textContent = "Please enter your password.";
      errEl.style.display = "block";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Deleting...";

    try {
      const res = await fetch("/api/auth/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Auth-Token": token },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || "Deletion failed.";
        errEl.style.display = "block";
        return;
      }

      localStorage.removeItem("sm_token");
      window.location.href = "/LoginPage/login.html";
    } catch (err) {
      errEl.textContent = "Something went wrong.";
      errEl.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Delete Forever";
    }
  });

// ── iCAL LINKS ────────────────────────────────────────────────────
let icalLinks = []; // { url, label }[]

async function loadIcalLinks() {
  try {
    const res = await fetch("/api/ical/links", GET_H);
    const data = await res.json();
    icalLinks = data.links || [];
    renderIcalLinks();
  } catch (e) {
    console.error("Failed to load iCal links:", e);
  }
}
loadIcalLinks();

function renderIcalLinks() {
  const list = document.getElementById("icalLinksList");
  if (!list) return;
  if (icalLinks.length === 0) {
    list.innerHTML = "<p class='no-ical'>No calendars added yet.</p>";
    return;
  }
  list.innerHTML = icalLinks
    .map(
      (l, i) => `
    <div class="ical-link-row">
      <span class="material-icons ical-icon">event</span>
      <div class="ical-link-info">
        <span class="ical-link-label">${l.label || "Calendar"}</span>
        <span class="ical-link-url">${l.url.length > 45 ? l.url.slice(0, 45) + "…" : l.url}</span>
      </div>
      <button class="ical-remove-btn" onclick="removeIcalLink(${i})">
        <span class="material-icons">delete</span>
      </button>
    </div>
  `,
    )
    .join("");
}

async function saveIcalLinks() {
  await fetch("/api/ical/links", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ links: icalLinks }),
  });
}

window.removeIcalLink = async function (idx) {
  icalLinks.splice(idx, 1);
  renderIcalLinks();
  await saveIcalLinks();
};

document.getElementById("addIcalBtn")?.addEventListener("click", () => {
  document.getElementById("icalLabel").value = "";
  document.getElementById("icalUrl").value = "";
  document.getElementById("icalError").style.display = "none";
  document.getElementById("icalModal").style.display = "flex";
  setTimeout(() => document.getElementById("icalLabel")?.focus(), 100);
});

document.getElementById("icalSaveBtn")?.addEventListener("click", async () => {
  const label = document.getElementById("icalLabel").value.trim();
  const url = document.getElementById("icalUrl").value.trim();
  const errEl = document.getElementById("icalError");

  if (!label) {
    errEl.textContent = "Please enter a name.";
    errEl.style.display = "block";
    return;
  }
  if (!url.startsWith("http")) {
    errEl.textContent = "Please enter a valid URL.";
    errEl.style.display = "block";
    return;
  }

  icalLinks.push({ url, label });
  renderIcalLinks();
  await saveIcalLinks();
  document.getElementById("icalModal").style.display = "none";
});
