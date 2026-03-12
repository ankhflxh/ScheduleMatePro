// File: Frontend/LoginPage/verify.js

document.addEventListener("DOMContentLoaded", () => {
  // 1. Background Animation
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

  const params = new URLSearchParams(window.location.search);
  const email = params.get("email");

  if (!email) {
    window.location.href = "login.html";
    return;
  }

  const form = document.getElementById("verifyForm");
  const alertBox = document.getElementById("verifyAlert");
  const verifyBtn = document.getElementById("verifyBtn");
  const resendBtn = document.getElementById("resendBtn");
  const okBtn = document.getElementById("verifyOkBtn");

  function showBanner(msg, type = "error") {
    alertBox.textContent = msg;
    alertBox.className = `alert show ${type}`;
    alertBox.style.display = "block";
  }

  // 2. Verification Logic
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

      // Hide the form, show inline success state — no dark overlay
      document.getElementById("formState").style.display = "none";
      const successState = document.getElementById("successState");
      successState.style.display = "flex";

      const successAnim = document.getElementById("lottie-success-animation");
      if (successAnim && window.lottie) {
        successAnim.innerHTML = "";
        window.lottie.loadAnimation({
          container: successAnim,
          renderer: "svg",
          loop: false,
          autoplay: true,
          path: "/Assets/success.json",
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
      }
    } catch (err) {
      showBanner(err.message, "error");
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify Account";
    }
  });

  // Redirect to login page instead of dashboard
  if (okBtn) {
    okBtn.addEventListener("click", () => {
      window.location.href = "login.html";
    });
  }

  // 3. Resend Logic
  resendBtn.addEventListener("click", async () => {
    try {
      resendBtn.style.pointerEvents = "none";
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) showBanner("New code sent!", "success");
    } catch (err) {
      showBanner("Error resending code", "error");
    } finally {
      setTimeout(() => (resendBtn.style.pointerEvents = "auto"), 5000);
    }
  });
});
