// File: Frontend/LoginPage/login.js

const API_BASE = ""; // Keep empty if serving from the same domain (localhost:5000)

// Helper: Show banners
function showBanner(msg, type = "error") {
  const alertBox = document.getElementById("loginAlert");
  if (alertBox) {
    alertBox.textContent = msg;
    alertBox.className = `alert show ${type}`;
  }
}

// Helper: Loading State
function setSubmitting(isLoading) {
  const btn = document.getElementById("loginBtn");
  if (btn) {
    btn.disabled = isLoading;
    btn.textContent = isLoading ? "Signing in..." : "Sign In";
  }
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

  // 2. Handle "Verified" URL param
  const params = new URLSearchParams(window.location.search);
  if (params.get("verified") === "1") {
    const verifyModal = document.getElementById("verificationSuccessModal");
    if (verifyModal) {
      verifyModal.style.display = "flex";

      // UPDATED: Target the new success container
      const successAnim = document.getElementById("lottie-success-animation");
      if (successAnim && window.lottie) {
        window.lottie.loadAnimation({
          container: successAnim,
          renderer: "svg",
          loop: false, // Play once for success ticks
          autoplay: true,
          path: "/Assets/success.json", // UPDATED: Points to success.json
        });
      }

      // Close button logic
      const okBtn = document.getElementById("verifyOkBtn");
      if (okBtn) okBtn.onclick = () => (verifyModal.style.display = "none");
    }
  }

  // Clean URL
  if (window.history.replaceState) {
    const url = new URL(window.location);
    url.searchParams.delete("verified");
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url);
  }

  // 3. SECURE SUBMIT HANDLER
  const form = document.getElementById("loginForm");

  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault(); // <--- CRITICAL: STOPS PAGE RELOAD

      // Clear previous errors
      showBanner("", "");

      const identifierInput = document.getElementById("username");
      const passwordInput = document.getElementById("password");

      const identifier = identifierInput ? identifierInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";

      if (!identifier || !password) {
        showBanner("Please enter both username/email and password.", "error");
        return;
      }

      try {
        setSubmitting(true);

        // Perform Login
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.message || "Login failed.");
        }

        // Success: Save Token
        if (data.token) {
          localStorage.setItem("sm_token", data.token);
          sessionStorage.setItem("justLoggedIn", "1");

          // Redirect to Dashboard
          window.location.href = "/Dashboard/dashboard.html";
        } else {
          throw new Error("Server response missing token.");
        }
      } catch (err) {
        console.error("Login Error:", err);
        let msg = err.message;
        if (msg === "Failed to fetch")
          msg = "Cannot connect to server. Is it running?";
        showBanner(msg, "error");
      } finally {
        setSubmitting(false);
      }
    });
  } else {
    console.error("CRITICAL: Login Form not found in DOM.");
  }
});
