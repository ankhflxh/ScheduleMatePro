// File: Frontend/RegisterPage/register.js

const registerForm = document.getElementById("registerForm");
const registerAlert = document.getElementById("registerAlert");
const verificationModal = document.getElementById("verificationModal");
const goLoginButton = document.getElementById("sm-go-login");

document.addEventListener("DOMContentLoaded", () => {
  // 1. Register Icon Animation (Top of form)
  const iconContainer = document.getElementById("lottie-register-icon");
  if (iconContainer && window.lottie) {
    window.lottie.loadAnimation({
      container: iconContainer,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "https://lottie.host/79a83508-468e-4a6c-94cc-a83af1057e93/C0B6I4w2b5.json",
    });
  }

  // 2. Background Animation (zpunet icon)
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
});

function showBanner(message, type = "error") {
  registerAlert.textContent = message;
  registerAlert.className = `alert show ${type}`;
}

function clearForm() {
  registerForm.reset();
  document.querySelectorAll(".input-error").forEach((el) => {
    el.classList.remove("input-error");
  });
}

function showVerificationModal() {
  document.querySelector(".auth-container").style.display = "none";
  verificationModal.hidden = false;
}

goLoginButton.onclick = () => {
  window.location.href = "../LoginPage/login.html";
};

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerAlert.classList.remove("show");

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm_password").value;

  if (password !== confirmPassword) {
    showBanner("Passwords do not match.", "error");
    document.getElementById("confirm_password").classList.add("input-error");
    return;
  }
  if (password.length < 8) {
    showBanner("Password must be at least 8 characters.", "error");
    document.getElementById("password").classList.add("input-error");
    return;
  }

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        email: email,
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showBanner(
        data.error || "Registration failed. Please try again.",
        "error"
      );
    } else {
      clearForm();
      showVerificationModal();
    }
  } catch (error) {
    console.error("Registration error:", error);
    showBanner("Network error. Please try again later.", "error");
  }
});
