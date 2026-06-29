/* ============================================================
   CSS Department Voting — presentational interactions.
   Purely cosmetic: drifting background blobs, scroll-reveal,
   ballot progress ring, and a cursor-follow card spotlight.
   Reads nothing from app state; never mutates app logic.
   ============================================================ */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ---- drifting teal background blobs ---------------------- */
/* Injected so all pages share the Xodespace atmosphere without
   editing markup. Skipped when the user prefers reduced motion. */
function initBackgroundBlobs() {
  if (reduceMotion || document.querySelector(".bg-blobs")) return;

  const layer = document.createElement("div");
  layer.className = "bg-blobs";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = '<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>';
  document.body.prepend(layer);
}

/* ---- cursor-follow spotlight on glass cards -------------- */
/* Targets opt-in [data-spot] elements; desktop pointers only. */
function initCardSpotlight() {
  if (!finePointer) return;
  const cards = document.querySelectorAll("[data-spot]");
  if (!cards.length) return;

  cards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  });
}

/* ---- scroll reveal -------------------------------------- */
function initScrollReveal() {
  const targets = document.querySelectorAll("[data-reveal]");
  if (!targets.length) return;

  if (reduceMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );

  targets.forEach((el) => observer.observe(el));
}

/* ---- ballot progress ring ------------------------------- */
/* Mirrors the "<x> of <y> races selected" text into a conic ring.
   Listens for text changes so it stays in sync without touching
   the ballot's own progress logic. */
function initProgressRing() {
  const label = document.querySelector("#ballot-progress");
  const ring = document.querySelector("[data-progress-ring]");
  if (!label || !ring) return;

  const sync = () => {
    const match = /(\d+)\s+of\s+(\d+)/i.exec(label.textContent || "");
    if (!match) return;
    const done = Number(match[1]);
    const total = Number(match[2]) || 1;
    const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
    ring.style.setProperty("--p", String(pct));
    const out = ring.querySelector("[data-progress-value]");
    if (out) out.textContent = `${pct}%`;
  };

  sync();
  new MutationObserver(sync).observe(label, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

/* ---- nav shrink on scroll ------------------------------- */
function initNavShrink() {
  const nav = document.querySelector("#site-nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("shrink", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function start() {
  initBackgroundBlobs();
  initScrollReveal();
  initProgressRing();
  initCardSpotlight();
  initNavShrink();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
