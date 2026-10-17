// CineMatch – App-Shell (Punkt 1b)
// Navigiert durch die drei Schritte des 3-Schritte-Flows.
// Die Schrittplatten selbst füllen spätere Punkte (4–9) mit Inhalt.

const TOTAL_STEPS = 3;

const panels = Array.from(document.querySelectorAll(".step-panel"));
const dots = Array.from(document.querySelectorAll(".step-dot"));
const backBtn = document.getElementById("btn-back");
const nextBtn = document.getElementById("btn-next");
const counter = document.getElementById("step-counter");

let current = 1;

function render() {
  panels.forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.step) === current);
  });
  dots.forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.goto) === current);
  });
  backBtn.disabled = current === 1;
  nextBtn.disabled = current === TOTAL_STEPS;
  counter.textContent = `Schritt ${current} / ${TOTAL_STEPS}`;
}

function goTo(step) {
  current = Math.min(TOTAL_STEPS, Math.max(1, step));
  render();
}

backBtn.addEventListener("click", () => goTo(current - 1));
nextBtn.addEventListener("click", () => goTo(current + 1));
dots.forEach((dot) => {
  dot.addEventListener("click", () => goTo(Number(dot.dataset.goto)));
});

render();
