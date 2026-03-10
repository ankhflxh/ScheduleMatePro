// File: Frontend/LoginPage/verify.js

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email");

  // Redirect to login if they try to access this page without an email parameter
  if (!email) {
    window.location.href = "login.html";
    return;
  }

  const form = document.getElementById("verifyForm");
  const alertBox = document.getElementById("verifyAlert");
  const verifyBtn = document.getElementById("verifyBtn");
  const resendBtn = document.getElementById("resendBtn");

  function showBanner(msg, type = "error") {
    alertBox.textContent = msg;
    alertBox.className = `alert show ${type}`;
  }

  // Handle OTP Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const otp = document.getElementById("otpCode").value.trim();

    try {
      verifyBtn.disabled = true;
      verifyBtn.textContent = "Verifying...";

      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      // Success! Save token and instantly redirect to Dashboard
      localStorage.setItem("sm_token", data.token);
      window.location.href = "/Dashboard/dashboard.html";
    } catch (err) {
      showBanner(err.message, "error");
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify Account";
    }
  });

  // Handle Resend Request
  resendBtn.addEventListener("click", async () => {
    try {
      resendBtn.textContent = "Sending...";
      resendBtn.style.pointerEvents = "none";

      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showBanner("A new code has been sent to your email.", "success");

      // Prevent spam clicking for 15 seconds
      setTimeout(() => {
        resendBtn.textContent = "Resend Code";
        resendBtn.style.pointerEvents = "auto";
      }, 15000);
    } catch (err) {
      showBanner(err.message, "error");
      resendBtn.textContent = "Resend Code";
      resendBtn.style.pointerEvents = "auto";
    }
  });
});
