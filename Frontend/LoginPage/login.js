// === ScheduleMate — Login ===
const API_BASE = "";

const els = {
  form: document.getElementById("loginForm"),
  identifier: document.getElementById("username"),
  password: document.getElementById("password"),
  btn: document.getElementById("loginBtn"),
  alertBox: document.getElementById("loginAlert"),
  idError: document.getElementById("loginIdError"),
  pwdError: document.getElementById("loginPwdError"),
  // New Elements
  verifyModal: document.getElementById("verificationSuccessModal"),
  verifyBtn: document.getElementById("verifyOkBtn"),
};

function showBanner(msg, type = "error") {
  if (!els.alertBox) return;
  els.alertBox.textContent = msg;
  els.alertBox.className = `alert ${type}`;
}

function clearFieldErrors() {
  if (els.idError) els.idError.textContent = "";
  if (els.pwdError) els.pwdError.textContent = "";
  if (els.alertBox) {
    els.alertBox.textContent = "";
    els.alertBox.className = "alert";
  }
}

function setSubmitting(b) {
  if (!els.btn) return;
  els.btn.disabled = b;
  els.btn.textContent = b ? "Signing in..." : "Login";
}

document.addEventListener("DOMContentLoaded", () => {
  // 1. Load Background Animation
  const bgContainer = document.getElementById("lottie-background");
  if (bgContainer && window.lottie) {
    window.lottie.loadAnimation({
      container: bgContainer,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/Assets/zpunet icon.json",
      rendererSettings: { preserveAspectRatio: "xMidYMid slice" },
    });
  }

  // 2. Handle URL Parameters (Verified Logic)
  const params = new URLSearchParams(window.location.search);
  const verified = params.get("verified");
  const errParam = params.get("error");

  if (verified === "1") {
    // SHOW THE LOCK ANIMATION MODAL
    if (els.verifyModal) {
      els.verifyModal.style.display = "flex";

      // Load the Lock Animation inside the modal
      const lockContainer = document.getElementById("lottie-lock-animation");
      if (lockContainer && window.lottie) {
        window.lottie.loadAnimation({
          container: lockContainer,
          renderer: "svg",
          loop: false, // Play once
          autoplay: true,
          path: "/Assets/Lock.json", // Ensure Lock.json is in Assets folder
        });
      }
    }
    // Fallback banner just in case
    showBanner("Account verified successfully.", "success");
  } else if (errParam) {
    try {
      showBanner(decodeURIComponent(errParam), "error");
    } catch {
      showBanner(String(errParam), "error");
    }
  }

  // Clean URL
  ["verified", "error"].forEach((k) => params.delete(k));
  const newQuery = params.toString();
  const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : "");
  window.history.replaceState({}, "", newUrl);
});

// Close verification modal
if (els.verifyBtn) {
  els.verifyBtn.onclick = () => {
    els.verifyModal.style.display = "none";
  };
}

// --- Login Submit Handler ---
els.form?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearFieldErrors();

  const identifier = (els.identifier?.value || "").trim();
  const password = els.password?.value || "";

  if (!identifier || !password) {
    showBanner("Email/username and password are required.", "error");
    return;
  }

  try {
    setSubmitting(true);
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      // Ensure path matches server.js
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showBanner(data?.message || "Login failed.", "error");
      return;
    }

    if (data?.token) localStorage.setItem("sm_token", data.token);
    if (data?.user) localStorage.setItem("sm_user", JSON.stringify(data.user));
    sessionStorage.setItem("justLoggedIn", "1");
    window.location.href = "/Dashboard/dashboard.html";
  } catch (e) {
    console.error("[login] network error:", e);
    showBanner("Network error. Please try again.", "error");
  } finally {
    setSubmitting(false);
  }
});
