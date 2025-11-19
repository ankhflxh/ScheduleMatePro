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
      // UPDATED PATH: Using a forward slash at the start for a root-relative path
      // is often safer if the 'Frontend' directory is served as the root.
      // Check your Assets folder location and adjust path if necessary.
      path: "/Assets/Agenda.json",
    });
  }

  // ----------------------------------------------------
  // OLD SPLASH SCREEN/TYPEWRITER LOGIC REMOVED
  // ----------------------------------------------------
});
