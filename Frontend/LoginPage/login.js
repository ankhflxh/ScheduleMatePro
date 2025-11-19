// === ScheduleMate — Login (robust) ===
const API_BASE = "";

const els = {
  form: document.getElementById("loginForm"),
  identifier: document.getElementById("username"),
  password: document.getElementById("password"),
  btn: document.getElementById("loginBtn"),
  alertBox: document.getElementById("loginAlert"),
  idError: document.getElementById("loginIdError"),
  pwdError: document.getElementById("loginPwdError"),
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
  // 1. Background Animation (zpunet icon)
  const bgContainer = document.getElementById("lottie-background");
  if (bgContainer && window.lottie) {
    window.lottie.loadAnimation({
      container: bgContainer,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/Assets/zpunet icon.json", // Ensure this file exists in Assets
      rendererSettings: {
        preserveAspectRatio: "xMidYMid slice",
      },
    });
  }

  // 2. Handle URL Parameters (Verified/Error)
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
    ["verified", "error"].forEach((k) => params.delete(k));
    const newQuery = params.toString();
    const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : "");
    window.history.replaceState({}, "", newUrl);
  } catch (e) {
    console.error("[login banner] error:", e);
  }
});

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
      if (data?.errors) {
        if (els.idError) els.idError.textContent = data.errors.identifier || "";
        if (els.pwdError) els.pwdError.textContent = data.errors.password || "";
      }
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

console.log("[login.js] ready");
