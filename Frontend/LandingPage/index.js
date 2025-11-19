// File: Frontend/LandingPage/index.js

document.addEventListener("DOMContentLoaded", () => {
  // ----------------------------------------------------
  // LOTTIE ANIMATION INITIALIZATION
  // ----------------------------------------------------
  const animationContainer = document.getElementById(
    "lottie-schedule-animation"
  );

  if (animationContainer && window.lottie) {
    window.lottie.loadAnimation({
      container: animationContainer, // the DOM element that will contain the animation
      renderer: "svg",
      loop: true,
      autoplay: true,
      // UPDATED: Reference the local Agenda.json file.
      // Ensure you have placed this file in Frontend/Assets/
      path: "../Assets/Agenda.json",
    });
  }

  // ----------------------------------------------------
  // OLD SPLASH SCREEN/TYPEWRITER LOGIC REMOVED
  // ----------------------------------------------------
});
