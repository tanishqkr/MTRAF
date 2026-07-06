// MC Dropout uncertainty accumulator — the signature interactive from the first
// prototype (kept per PLAN.md, visuals rebuilt). Concept: each pixel is scored
// T=30 times with different neurons dropped. The running MEAN across the first
// `t` passes is the traversability estimate; the running STD is the uncertainty.
// Scrub/play T=1→30 and watch the map stabilise while high-variance zones (where
// the model disagrees with itself) glow. Mirrors the real `trav_std` signal.

const GRID_W = 28;
const GRID_H = 16;
const T_MAX = 30;

export class UncertaintyAccumulator {
  constructor(root) {
    this.canvas = root.querySelector('#uncertainty-canvas');
    this.slider = root.querySelector('#unc-slider');
    this.readout = root.querySelector('#unc-readout');
    this.playBtn = root.querySelector('#unc-play');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this._seed();
    this._bind();
    this.draw(1);
  }

  // Deterministic field: a mostly-traversable scene with one clear hazard
  // cluster, plus 30 noisy "dropout passes" around the true values.
  _seed() {
    let s = 7;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    this.truth = [];
    for (let y = 0; y < GRID_H; y++) {
      const row = [];
      for (let x = 0; x < GRID_W; x++) {
        let base = 0.58 + Math.sin(x * 0.35) * 0.16 + Math.cos(y * 0.4) * 0.12;
        // hazard cluster (a big rock) — consistently dangerous, low variance
        const dx = x - 20;
        const dy = y - 5;
        if (Math.hypot(dx, dy) < 3.2) base = 0.08 + rand() * 0.05;
        row.push(Math.max(0.03, Math.min(0.95, base + (rand() - 0.5) * 0.08)));
      }
      this.truth.push(row);
    }

    // Higher noise near score transitions → those pixels stay uncertain longer.
    this.passes = [];
    for (let t = 0; t < T_MAX; t++) {
      const field = [];
      for (let y = 0; y < GRID_H; y++) {
        const row = [];
        for (let x = 0; x < GRID_W; x++) {
          const edge = Math.abs(this.truth[y][x] - 0.5); // near 0.5 = ambiguous
          const spread = 0.14 + (0.25 - Math.min(0.25, edge)) * 1.6;
          row.push(
            Math.max(0, Math.min(1, this.truth[y][x] + (rand() - 0.5) * spread)),
          );
        }
        field.push(row);
      }
      this.passes.push(field);
    }
  }

  // Traversability colour ramp: green (safe) → ochre → rust (hazard).
  _scoreColor(v) {
    let r;
    let g;
    let b;
    if (v > 0.65) {
      const k = (v - 0.65) / 0.35;
      r = 127 - k * 30;
      g = 191 - k * 40;
      b = 127 - k * 80;
    } else if (v > 0.35) {
      const k = (0.65 - v) / 0.3;
      r = 140 + k * 90;
      g = 150 - k * 20;
      b = 70;
    } else {
      const k = v / 0.35;
      r = 190 - k * 40;
      g = 60 - k * 20;
      b = 40;
    }
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }

  draw(t) {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cw = w / GRID_W;
    const ch = h / GRID_H;
    ctx.clearRect(0, 0, w, h);

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        let sum = 0;
        for (let i = 0; i < t; i++) sum += this.passes[i][y][x];
        const mean = sum / t;

        let varSum = 0;
        for (let i = 0; i < t; i++) {
          const d = this.passes[i][y][x] - mean;
          varSum += d * d;
        }
        const std = Math.sqrt(varSum / t);

        // Base: mean traversability score.
        ctx.fillStyle = this._scoreColor(mean);
        ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1);

        // Overlay: cyan uncertainty, opacity ∝ std across the passes so far.
        ctx.fillStyle = `rgba(76,224,210,${Math.min(0.6, std * 1.5)})`;
        ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1);
      }
    }
  }

  _setT(t) {
    this.slider.value = String(t);
    this.draw(t);
    this.readout.textContent = `PASS ${String(t).padStart(2, '0')} / ${T_MAX}`;
  }

  _bind() {
    this.slider.addEventListener('input', () => {
      this._stop();
      this._setT(parseInt(this.slider.value, 10));
    });

    this.playBtn.addEventListener('click', () => {
      if (this.timer) {
        this._stop();
        return;
      }
      this.playBtn.textContent = '❚❚';
      let t = parseInt(this.slider.value, 10);
      if (t >= T_MAX) t = 1;
      this._setT(t);
      this.timer = setInterval(() => {
        t += 1;
        if (t > T_MAX) {
          this._stop();
          return;
        }
        this._setT(t);
      }, 150);
    });
  }

  _stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.playBtn.textContent = '▶';
  }
}
