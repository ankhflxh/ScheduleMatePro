const form = document.querySelector("#registerForm");
const banner = document.querySelector("#registerBanner");
const errorModal = document.querySelector("#registerErrorModal");
const errorMessageBox = document.querySelector("#registerErrorMessage");
const errorOkBtn = document.querySelector("#registerErrorOk");

// The original button/timer elements in register.html are now IGNORED
// in favor of dynamically created ones to prevent DOM detachment issues.
// We keep a reference to the email input for the resend function.
const emailInput = document.querySelector("#email");

const API_BASE = ""; // Same-origin, no base URL needed

// --- HELPER FUNCTIONS ---

/**
 * Shows the registration error modal.
 * @param {string} text - The error message to display.
 */
function showErrorModal(text) {
  if (!errorModal) {
    alert(text);
    return;
  }
  errorMessageBox.textContent = text;
  errorModal.style.display = "flex";
}

/**
 * Client-side validation. Returns true if valid, false otherwise (and shows banner message).
 */
const validateForm = (username, password, confirmPassword) => {
  // Clear any old banner messages first
  banner.style.display = "none";

  // 1. Username: at least 8 characters
  if (username.length < 8) {
    banner.className = `alert`;
    banner.textContent = "Username must be at least 8 characters long.";
    banner.style.display = "block";
    return false;
  }

  // 2. Password: at least 8 characters
  if (password.length < 8) {
    banner.className = `alert`;
    banner.textContent = "Password must be at least 8 characters long.";
    banner.style.display = "block";
    return false;
  }

  // 3. Password: at least 1 special character
  const specialCharRegex = /[^\w\s]/;
  if (!specialCharRegex.test(password)) {
    banner.className = `alert`;
    banner.textContent =
      "Password must contain at least one special character (e.g., !, @, #).";
    banner.style.display = "block";
    return false;
  }

  // 4. Confirm Password Match
  if (password !== confirmPassword) {
    banner.className = `alert`;
    banner.textContent = "Passwords do not match.";
    banner.style.display = "block";
    return false;
  }

  return true;
};

/**
 * Logic to handle the resend button click event.
 */
const resendButtonClickHandler = async (resendBtn, timerDisplay) => {
  const email = emailInput.value.trim();

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
      // Success response for resend
      timerDisplay.innerHTML = `<div>New verification email sent!</div>`;
      startResendTimer(10, resendBtn, timerDisplay); // Shorter timer for resend
    } else {
      // Error response for resend
      timerDisplay.innerHTML = `<div>${
        data.error || "Failed to resend link."
      }</div>`;
      startResendTimer(10, resendBtn, timerDisplay);
    }
  } catch (err) {
    timerDisplay.innerHTML = "Network error while resending link.";
    startResendTimer(10, resendBtn, timerDisplay);
  }
};

/**
 * Starts the countdown timer for the resend button.
 * @param {number} duration - The starting duration in seconds.
 * @param {HTMLElement} resendButton - The dynamically created button element.
 * @param {HTMLElement} timerElement - The dynamically created timer span element.
 */
function startResendTimer(duration, resendButton, timerElement) {
  let timer = duration;
  resendButton.disabled = true; // Ensure it's disabled

  const interval = setInterval(() => {
    timerElement.textContent = `(Resend available in ${timer}s)`;
    timer--;

    if (timer < 0) {
      clearInterval(interval);
      timerElement.textContent = "Verification link ready to resend.";
      resendButton.disabled = false; // Enable the button

      // Re-attach the click handler to the newly enabled button
      resendButton.onclick = () =>
        resendButtonClickHandler(resendButton, timerElement);
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

// Listener for Form Submission (The main logic block)
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // 1. Get ALL input values
  const username = document.querySelector("#username").value.trim();
  const email = emailInput.value.trim(); // Use global reference for email
  const password = document.querySelector("#password").value.trim();
  const confirmPassword = document
    .querySelector("#confirmPassword")
    .value.trim();

  // 2. Client-side validation check
  if (!validateForm(username, password, confirmPassword)) {
    return;
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
      // --- SUCCESS UI UPDATE (The FIX) ---

      // 1. Set the banner class
      banner.className = `alert alert-success`;

      // 2. Define the COMPLETE new structure and overwrite innerHTML
      banner.innerHTML = `
          <div>Registration received. Please check your email to verify.</div>
          <span id="dynamicTimerDisplay"></span>
          <button id="dynamicResendBtn" class="auth-button" disabled>
              Resend Verification Link
          </button>
      `;
      banner.style.display = "block"; // Ensure the banner is visible

      // 3. Select the newly created elements from the DOM
      const dynamicResendBtn = document.querySelector("#dynamicResendBtn");
      const dynamicTimerDisplay = document.querySelector(
        "#dynamicTimerDisplay"
      );

      // 4. Start the timer with the new elements
      startResendTimer(30, dynamicResendBtn, dynamicTimerDisplay);

      form.reset();
    } else {
      // Server Error: Use the specific error message from the backend
      showErrorModal(
        data.error ||
          "Registration failed. Please check your inputs and try again."
      );
    }
  } catch (err) {
    console.error("Network Error:", err);
    showErrorModal(
      "A network error occurred. Ensure the backend server is running and accessible."
    );
  } finally {
    registerBtn.disabled = false;
  }
});
