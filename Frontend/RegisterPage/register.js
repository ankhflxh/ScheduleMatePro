// File: Frontend/RegisterPage/register.js

const registerForm = document.getElementById("registerForm");
const registerAlert = document.getElementById("registerAlert");
const verificationModal = document.getElementById("verificationModal");
const goLoginButton = document.getElementById("sm-go-login");

// --- LOTTIE INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  const iconContainer = document.getElementById("lottie-register-icon");

  if (iconContainer && window.lottie) {
    window.lottie.loadAnimation({
      container: iconContainer,
      renderer: "svg",
      loop: true,
      autoplay: true,
      // Placeholder Lottie icon for "User" or "Registration"
      path: "https://lottie.host/79a83508-468e-4a6c-94cc-a83af1057e93/C0B6I4w2b5.json",
    });
  }
});
// --- END LOTTIE INITIALIZATION ---

// Helper function to display alerts (Error or Success banners)
function showBanner(message, type = "error") {
  registerAlert.textContent = message;
  registerAlert.className = `alert show ${type}`;
}

// Helper function to clear form inputs and remove error classes
function clearForm() {
  registerForm.reset();
  document.querySelectorAll(".input-error").forEach((el) => {
    el.classList.remove("input-error");
  });
}

// Helper for showing the verification modal
function showVerificationModal() {
  // Hide the main form container to focus on the modal
  document.querySelector(".auth-container").style.display = "none";
  verificationModal.hidden = false;
}

// Redirect to login page on modal button click
goLoginButton.onclick = () => {
  window.location.href = "../LoginPage/login.html";
};

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerAlert.classList.remove("show"); // Clear previous alert

  const firstName = document.getElementById("first_name").value.trim();
  const lastName = document.getElementById("last_name").value.trim();
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm_password").value;

  // Simple client-side validation
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
        first_name: firstName,
        last_name: lastName,
        username: username,
        email: email,
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle server-side errors (e.g., username/email already taken)
      showBanner(
        data.error || "Registration failed. Please try again.",
        "error"
      );
    } else {
      // Successful registration: show verification modal
      clearForm();
      showVerificationModal();
    }
  } catch (error) {
    console.error("Registration error:", error);
    showBanner("Network error. Please try again later.", "error");
  }
});
