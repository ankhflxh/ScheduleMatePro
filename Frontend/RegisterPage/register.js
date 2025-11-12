const form = document.querySelector("#registerForm");
const banner = document.querySelector("#registerBanner");
const errorModal = document.querySelector("#registerErrorModal");
const errorMessageBox = document.querySelector("#registerErrorMessage");
const errorOkBtn = document.querySelector("#registerErrorOk");

// ✅ correct base URL
const API_BASE = "";

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.querySelector("#username").value.trim();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await res.json(); // now it really is JSON

    if (res.ok && data.message === "verification_sent") {
      showBanner(
        "Registration received. Please check your email to verify.",
        "success"
      );
      form.reset();
    } else {
      showErrorModal(data.error || "Registration failed");
    }
  } catch (err) {
    console.error(err);
    showErrorModal("Network error. Make sure the server is running.");
  }
});

function showBanner(text, type = "info") {
  banner.textContent = text;
  banner.style.display = "block";
}

function showErrorModal(text) {
  if (!errorModal) {
    alert(text);
    return;
  }
  errorMessageBox.textContent = text;
  errorModal.style.display = "flex";
}

if (errorOkBtn) {
  errorOkBtn.addEventListener("click", () => {
    errorModal.style.display = "none";
  });
}
