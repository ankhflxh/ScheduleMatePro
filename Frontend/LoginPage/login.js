// === ScheduleMate — Login (robust) ===
const API_BASE = ""; // same-origin. If hosting FE elsewhere, set "http://localhost:5174"

const els = {
  form: document.getElementById("loginForm"),
  identifier: document.getElementById("username"), // username OR email
  password: document.getElementById("password"),
  btn: document.getElementById("loginBtn"),
  alertBox: document.getElementById("loginAlert"),
  // optional inline errors if you have them in HTML
  idError: document.getElementById("loginIdError"),
  pwdError: document.getElementById("loginPwdError"),
};

// tiny helpers
function showBanner(msg, type = "error") {
  if (!els.alertBox) return;
  els.alertBox.textContent = msg;
  els.alertBox.className = `alert ${type}`; // .alert.success / .alert.error
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

// show verified / error messages from URL
document.addEventListener("DOMContentLoaded", () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const verified = params.get("verified");
    const errParam = params.get("error");
    if (verified === "1") {
      showBanner(
        "Your email has been verified. You can now log in.",
        "success"
      );
    } else if (errParam) {
      try {
        showBanner(decodeURIComponent(errParam), "error");
      } catch {
        showBanner(String(errParam), "error");
      }
    }
    // clean URL
    ["verified", "error"].forEach((k) => params.delete(k));
    const newQuery = params.toString();
    const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : "");
    window.history.replaceState({}, "", newUrl);
  } catch (e) {
    console.error("[login banner] error:", e);
  }
});

// submit handler
els.form?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearFieldErrors();

  const identifier = (els.identifier?.value || "").trim();
  const password = els.password?.value || "";

  if (!identifier || !password) {
    if (!identifier && els.idError)
      els.idError.textContent = "Enter email or username.";
    if (!password && els.pwdError)
      els.pwdError.textContent = "Enter your password.";
    showBanner("Email/username and password are required.", "error");
    return;
  }

  try {
    setSubmitting(true);
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // show server field errors if provided
      if (data?.errors) {
        if (els.idError) els.idError.textContent = data.errors.identifier || "";
        if (els.pwdError) els.pwdError.textContent = data.errors.password || "";
      }
      showBanner(data?.message || "Login failed.", "error");
      return;
    }

    // success: store session & go dashboard
    if (data?.token) localStorage.setItem("sm_token", data.token);
    if (data?.user) localStorage.setItem("sm_user", JSON.stringify(data.user));
    sessionStorage.setItem("justLoggedIn", "1");
    window.location.href = "/app/Dashboard/dashboard.html";
  } catch (e) {
    console.error("[login] network error:", e);
    showBanner("Network error. Please try again.", "error");
  } finally {
    setSubmitting(false);
  }
});

console.log("[login.js] ready");
