(function () {
  var saved = localStorage.getItem("theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var theme = saved || (prefersDark ? "dark" : "light");
  if (theme === "dark") document.documentElement.classList.add("dark");
})();
