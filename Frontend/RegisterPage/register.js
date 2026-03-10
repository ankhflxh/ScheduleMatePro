// File: Frontend/RegisterPage/register.js

function showBanner(msg, type = "error") {
  const alertBox = document.getElementById("registerAlert");
  if (alertBox) {
    alertBox.textContent = msg;
    alertBox.className = `alert show ${type}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // 1. Load Background Animation (I put this back!)
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

  // 2. Handle Form Submission
  const form = document.getElementById("registerForm");

  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      showBanner("", ""); // Clear any previous errors

      // Grab all the input values
      const username = document.getElementById("username").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const confirmPassword = document.getElementById("confirmPassword").value;
      const btn = document.getElementById("registerBtn");

      // Validate Passwords Match
      if (password !== confirmPassword) {
        return showBanner("Passwords do not match.", "error");
      }

      // Validate Password Length
      if (password.length < 8) {
        return showBanner("Password must be at least 8 characters.", "error");
      }

      try {
        // Show loading state
        btn.disabled = true;
        btn.textContent = "Creating Account...";

        // Send data to your updated backend (No phone number!)
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || "Registration failed.");
        }

        // SUCCESS! Redirect to the OTP Verification page with their email in the URL
        window.location.href = `/LoginPage/verify.html?email=${encodeURIComponent(email)}`;
      } catch (err) {
        let msg = err.message;
        if (msg === "Failed to fetch") msg = "Cannot connect to server.";
        showBanner(msg, "error");
      } finally {
        // Reset button state if it failed
        btn.disabled = false;
        btn.textContent = "Sign Up";
      }
    });
  }
});
