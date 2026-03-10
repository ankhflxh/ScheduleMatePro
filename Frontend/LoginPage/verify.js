// File: Frontend/LoginPage/verify.js

document.addEventListener("DOMContentLoaded", () => {
  // 1. Background Animation Init
  const bgContainer = document.getElementById("lottie-background");
  if (bgContainer && window.lottie) {
    window.lottie.loadAnimation({
      container: bgContainer,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/Assets/zpunet icon.json", // Ensure this path is correct
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
  const verifyModal = document.getElementById("verificationSuccessModal");
  const okBtn = document.getElementById("verifyOkBtn");

  let userToken = "";

  function showBanner(msg, type = "error") {
    alertBox.textContent = msg;
    alertBox.className = `alert show ${type}`;
    alertBox.style.display = "block";
  }

  // 2. Handle OTP Verification
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const otp = document.getElementById("otpCode").value.trim();

    try {
      verifyBtn.disabled = true;
      verifyBtn.innerHTML = `<span class="spinner"></span> Verifying...`;

      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid Code");

      userToken = data.token;

      // Display Success Modal
      verifyModal.style.display = "flex";
      setTimeout(() => verifyModal.classList.add("show"), 10);

      // Trigger Success Lottie
      const successAnim = document.getElementById("lottie-success-animation");
      if (successAnim && window.lottie) {
        successAnim.innerHTML = "";
        window.lottie.loadAnimation({
          container: successAnim,
          renderer: "svg",
          loop: false,
          autoplay: true,
          path: "/Assets/success.json", // Matches your uploaded files
        });
      }
    } catch (err) {
      showBanner(err.message, "error");
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify & Continue";
    }
  });

  // 3. Navigate to Dashboard
  if (okBtn) {
    okBtn.addEventListener("click", () => {
      if (userToken) {
        localStorage.setItem("sm_token", userToken);
        window.location.href = "/Dashboard/dashboard.html";
      }
    });
  }

  // 4. Resend Logic
  resendBtn.addEventListener("click", async () => {
    try {
      resendBtn.style.pointerEvents = "none";
      resendBtn.textContent = "Sending...";

      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      showBanner("A fresh code is on its way!", "success");

      setTimeout(() => {
        resendBtn.textContent = "Resend Code";
        resendBtn.style.pointerEvents = "auto";
      }, 30000); // 30s cooldown to prevent spam
    } catch (err) {
      showBanner(err.message, "error");
      resendBtn.textContent = "Resend Code";
      resendBtn.style.pointerEvents = "auto";
    }
  });
});
