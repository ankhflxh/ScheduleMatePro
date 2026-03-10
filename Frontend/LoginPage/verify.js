// File: Frontend/LoginPage/verify.js

document.addEventListener("DOMContentLoaded", () => {
  // 1. Load the Background Animation immediately
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

  // Redirect if they try to access this page directly without an email
  if (!email) {
    window.location.href = "login.html";
    return;
  }

  const form = document.getElementById("verifyForm");
  const alertBox = document.getElementById("verifyAlert");
  const verifyBtn = document.getElementById("verifyBtn");
  const resendBtn = document.getElementById("resendBtn");

  // Modal Elements
  const verifyModal = document.getElementById("verificationSuccessModal");
  const okBtn = document.getElementById("verifyOkBtn");
  let userToken = ""; // Store token temporarily until they click 'Go to Dashboard'

  function showBanner(msg, type = "error") {
    alertBox.textContent = msg;
    alertBox.className = `alert show ${type}`;
  }

  // 2. Handle OTP Submission
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

      // SUCCESS! Store the token but DO NOT redirect yet.
      userToken = data.token;

      // Show the Success Modal
      verifyModal.style.display = "flex";

      // Play the Success Lottie Animation inside the modal
      const successAnim = document.getElementById("lottie-success-animation");
      if (successAnim && window.lottie) {
        successAnim.innerHTML = ""; // Clear just in case
        window.lottie.loadAnimation({
          container: successAnim,
          renderer: "svg",
          loop: false, // Play only once!
          autoplay: true,
          path: "/Assets/success.json",
        });
      }
    } catch (err) {
      showBanner(err.message, "error");
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify Account";
    }
  });

  // 3. Handle 'Go to Dashboard' button click inside the Success Modal
  if (okBtn) {
    okBtn.addEventListener("click", () => {
      if (userToken) {
        localStorage.setItem("sm_token", userToken);
        window.location.href = "/Dashboard/dashboard.html";
      }
    });
  }

  // 4. Handle Resend Request
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
