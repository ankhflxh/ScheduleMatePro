const form = document.querySelector("#registerForm");
const banner = document.querySelector("#registerBanner");
const errorModal = document.querySelector("#registerErrorModal");
const errorMessageBox = document.querySelector("#registerErrorMessage");
const errorOkBtn = document.querySelector("#registerErrorOk");

// Get the new elements from the banner
const resendBtn = document.querySelector("#resendLinkBtn");
const timerDisplay = document.querySelector("#countdownTimer");

const API_BASE = "";

// --- HELPER FUNCTIONS ---

function showBanner(text, type = "info") {
  // Reset banner display for a new message
  banner.className = `alert alert-${type}`;
  banner.textContent = text;
  banner.style.display = "block";

  // Hide the resend elements unless we are in the post-registration state
  resendBtn.style.display = "none";
  timerDisplay.textContent = "";
}

function showErrorModal(text) {
  if (!errorModal) {
    alert(text);
    return;
  }
  errorMessageBox.textContent = text;
  errorModal.style.display = "flex";
}

// --- CLIENT-SIDE VALIDATION ---

const validateForm = (username, password, confirmPassword) => {
  // 1. Username: at least 8 characters
  if (username.length < 8) {
    showBanner("Username must be at least 8 characters long.");
    return false;
  }

  // 2. Password: at least 8 characters
  if (password.length < 8) {
    showBanner("Password must be at least 8 characters long.");
    return false;
  }

  // 3. Password: at least 1 special character (non-alphanumeric/non-space)
  // The regex /[^\w\s]/ checks for anything that is NOT a word character (a-z, A-Z, 0-9, _) AND NOT a space.
  const specialCharRegex = /[^\w\s]/;
  if (!specialCharRegex.test(password)) {
    showBanner(
      "Password must contain at least one special character (e.g., !, @, #)."
    );
    return false;
  }

  // 4. Confirm Password Match
  if (password !== confirmPassword) {
    showBanner("Passwords do not match.");
    return false;
  }

  // All checks passed
  return true;
};

// --- RESEND TIMER LOGIC ---

function startResendTimer(duration) {
  let timer = duration;
  resendBtn.style.display = "block"; // Show the button
  resendBtn.disabled = true; // Ensure it's disabled

  const interval = setInterval(() => {
    timerDisplay.textContent = `(Resend available in ${timer}s)`;
    timer--;

    if (timer < 0) {
      clearInterval(interval);
      timerDisplay.textContent = "Verification link ready to resend.";
      resendBtn.disabled = false; // Enable the button
    }
  }, 1000);
}

// --- EVENT LISTENERS ---

// Listener for OK button on the modal
if (errorOkBtn) {
  errorOkBtn.addEventListener("click", () => {
    errorModal.style.display = "none";
  });
}

// Listener for Resend button
resendBtn.addEventListener("click", async () => {
  const email = document.querySelector("#email").value.trim();

  resendBtn.disabled = true;
  timerDisplay.textContent = "Sending...";

  try {
    const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      showBanner(
        "New verification email sent! Please check your inbox.",
        "success"
      );
      startResendTimer(10);
    } else {
      showBanner(
        data.error || "Failed to resend link. Please try again.",
        "error"
      );
      startResendTimer(10);
    }
  } catch (err) {
    showBanner("Network error while resending link.", "error");
    startResendTimer(10);
  }
});

// Listener for Form Submission (Merged logic)
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // 1. Get ALL input values
  const username = document.querySelector("#username").value.trim();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value.trim();
  const confirmPassword = document
    .querySelector("#confirmPassword")
    .value.trim();

  // 2. Client-side validation check
  if (!validateForm(username, password, confirmPassword)) {
    return; // Stop submission if validation fails (message is shown in showBanner)
  }

  // Disable button during submission
  const registerBtn = document.querySelector("#registerBtn");
  registerBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    // Read JSON data regardless of success/fail status
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.message === "verification_sent") {
      // Success: Show the message and start the timer UI
      banner.className = `alert alert-success`;
      banner.innerHTML = `
                <div>Registration received. Please check your email to verify.</div>
                <span id="countdownTimer"></span>
            `;
      // Re-select timerDisplay now that the innerHTML has changed
      const updatedTimerDisplay = document.querySelector("#countdownTimer");

      // Re-append button elements if they were removed (or just show them)
      resendBtn.style.display = "block";

      startResendTimer(30); // Start timer (using 30s as a realistic default)

      form.reset();
    } else {
      // Server Error: Use the specific error message from the backend
      showErrorModal(
        data.error || "Registration failed. Please check your inputs."
      );
    }
  } catch (err) {
    console.error("Network Error:", err);
    showErrorModal(
      "A network error occurred. Make sure the server is running."
    );
  } finally {
    registerBtn.disabled = false;
  }
});
