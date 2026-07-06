import { UncertaintyAccumulator } from './uncertainty.js';

// Wires up the editorial (Phase 5) DOM: scroll progress rail, the "sol" clock,
// reveal-on-scroll, hiding the scroll cue past the hero, and the MC Dropout
// accumulator. Pure DOM — independent of the 3D scene.
export function initEditorial() {
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  // Progress rail.
  const fill = document.getElementById('progress-fill');
  const cue = document.querySelector('.scroll-cue');
  const onScroll = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pct = max > 0 ? (doc.scrollTop / max) * 100 : 0;
    if (fill) fill.style.width = `${pct}%`;
    // Hide the scroll cue as soon as the user starts scrolling.
    const y = window.scrollY || doc.scrollTop;
    if (cue) cue.classList.toggle('is-hidden', y > window.innerHeight * 0.35);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // "Sol" mission clock — flavour telemetry, ticks up from landing.
  const solEl = document.getElementById('sol-clock');
  if (solEl) {
    const sol = 4127;
    let t = 0;
    const pad = (n) => String(n).padStart(2, '0');
    setInterval(() => {
      t += 1;
      const hh = pad(Math.floor(t / 3600) % 24);
      const mm = pad(Math.floor(t / 60) % 60);
      const ss = pad(t % 60);
      solEl.textContent = `SOL ${sol} · ${hh}:${mm}:${ss}`;
    }, 1000);
  }

  // Reveal-on-scroll.
  const reveals = document.querySelectorAll('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    reveals.forEach((el) => io.observe(el));
  }

  // Signature interactive.
  const uncSection = document.getElementById('uncertainty');
  if (uncSection) new UncertaintyAccumulator(uncSection);
}
