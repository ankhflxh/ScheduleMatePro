// frontend/landingpage/landing.js

// ================= Typewriter =================
const text = "Get things done with our fast-tracking scheduling app!";
const typingTextElement = document.querySelector("#typing-text");
let index = 0;
const typingSpeed = 100;
let defaultRedirectTimer = null;
let typingTimer = null;

function typeText() {
  if (!typingTextElement) return;
  if (index < text.length) {
    typingTextElement.textContent += text.charAt(index);
    index++;
    typingTimer = setTimeout(typeText, typingSpeed);
  } else {
    typingTimer = setTimeout(clearText, 2000); // pause then loop
  }
}

function clearText() {
  if (!typingTextElement) return;
  typingTextElement.textContent = "";
  index = 0;
  typeText();
}

function startTypewriter() {
  typingTextElement && (typingTextElement.textContent = "");
  index = 0;
  typeText();
}

function stopTypewriter() {
  if (typingTimer) clearTimeout(typingTimer);
}

// ================= Helpers =================
function scheduleDefaultRedirect() {
  // NOTE: use /app/... so it works when served by the backend
  defaultRedirectTimer = setTimeout(() => {
    window.location.href = "/app/loginpage/login.html";
  }, 10000);
}

function cancelDefaultRedirect() {
  if (defaultRedirectTimer) clearTimeout(defaultRedirectTimer);
}

function showStatus(msg, kind = "info") {
  let el = document.getElementById("verifyStatus");
  if (!el) {
    el = document.createElement("div");
    el.id = "verifyStatus";
    el.style.marginTop = "1rem";
    el.style.fontSize = "1rem";
    el.style.padding = "0.75rem 1rem";
    el.style.borderRadius = "0.5rem";
    el.style.maxWidth = "32rem";
    el.style.lineHeight = "1.4";
    document.body.appendChild(el);
  }
  // basic styles
  el.style.background = "rgba(0,0,0,0.06)";
  el.style.border = "1px solid rgba(0,0,0,0.1)";
  el.style.color = "#222";
  if (kind === "success") {
    el.style.background = "rgba(46, 204, 113, 0.12)";
    el.style.border = "1px solid rgba(46, 204, 113, 0.35)";
    el.style.color = "#156d3a";
  } else if (kind === "error") {
    el.style.background = "rgba(231, 76, 60, 0.12)";
    el.style.border = "1px solid rgba(231, 76, 60, 0.35)";
    el.style.color = "#7f1d1d";
  }
  el.textContent = msg;
}

// ================= Verify flow =================
(function handleEmailVerify() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("verify");

  if (!token) {
    // normal landing behaviour
    startTypewriter();
    scheduleDefaultRedirect();
    return;
  }

  // If verifying, stop the normal behaviour
  stopTypewriter();
  cancelDefaultRedirect();

  showStatus("Verifying your email... please wait.");

  fetch("/api/verify?token=" + encodeURIComponent(token))
    .then((res) => {
      if (!res.ok) throw new Error("Verification failed");
      showStatus("Email verified! Redirecting to login…", "success");
      setTimeout(() => {
        window.location.replace("/app/loginpage/login.html?verified=1");
      }, 800);
    })
    .catch((err) => {
      console.error("[verify] error:", err);
      showStatus(
        "Verification failed. You can request a new link from the login page.",
        "error"
      );
      setTimeout(() => {
        window.location.replace(
          "/app/loginpage/login.html?error=" +
            encodeURIComponent(
              "Email verification failed. Try resending the link."
            )
        );
      }, 1200);
    });
})();
