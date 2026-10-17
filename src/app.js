// CineMatch – App-Shell (Punkt 1b)
// Navigiert durch die drei Schritte des 3-Schritte-Flows.
// Die Schrittplatten füllen die jeweiligen Plan-Punkte mit Inhalt.

import { initStep1 } from "./ui/step1.js";
import { initStep2 } from "./ui/step2.js";

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
  if (current === 2) initStep2(); // lazy: erst beim Betritt von Schritt 2 (idempotent)
}

backBtn.addEventListener("click", () => goTo(current - 1));
nextBtn.addEventListener("click", () => goTo(current + 1));
dots.forEach((dot) => {
  dot.addEventListener("click", () => goTo(Number(dot.dataset.goto)));
});

initStep1(); // Schritt-1-UI: Name + Genre-Pills mit Auto-Save (Plan-Punkt 4)

render();
