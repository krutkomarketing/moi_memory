/* ═══════════════════════════════════════════════
   PARTICLES — Warm candle embers rising slowly
   Golden sparks with soft glow, evoking the warmth
   of a memorial candle in the darkness.
   ═══════════════════════════════════════════════ */

(function () {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles = [];
  const COUNT = 90;

  /* Warm ember palette — gold, amber, soft orange */
  const COLORS = [
    { r: 212, g: 175, b: 55  },  // gold
    { r: 226, g: 201, b: 126 },  // light gold
    { r: 255, g: 200, b: 80  },  // warm amber
    { r: 200, g: 140, b: 50  },  // deep amber
    { r: 255, g: 230, b: 160 },  // pale flame
    { r: 180, g: 120, b: 40  },  // dark ember
  ];

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  class Ember {
    constructor() { this.reset(true); }

    resetColor(isLight) {
      this.isLightThemeColor = isLight;
      if (isLight) {
        /* Golden/bronze/warm amber colors for white theme */
        this.color = pick([
          { r: 197, g: 160, b: 89 },  // rich gold
          { r: 176, g: 137, b: 63 },  // deep gold
          { r: 218, g: 180, b: 110 }, // warm gold
          { r: 140, g: 105, b: 40 },  // dark gold/amber
          { r: 160, g: 120, b: 50 },  // bronze
        ]);
        /* Light theme background is white, so increase opacity/alpha to make particles visible */
        this.alphaMin = rand(0.08, 0.22);
        this.alphaMax = this.isBig ? rand(0.6, 0.9) : rand(0.4, 0.75);
      } else {
        /* Cosmic white / silver / soft blue for dark theme */
        this.color = pick([
          { r: 255, g: 255, b: 255 }, // white
          { r: 240, g: 245, b: 255 }, // icy blue-white
          { r: 245, g: 240, b: 235 }, // soft warm white
          { r: 220, g: 225, b: 235 }, // dim silver
          { r: 200, g: 210, b: 225 }, // steel blue
        ]);
        this.alphaMin = rand(0.02, 0.12);
        this.alphaMax = this.isBig ? rand(0.45, 0.75) : rand(0.25, 0.6);
      }
      this.alpha = rand(this.alphaMin, this.alphaMax);
    }

    reset(initial) {
      this.x = rand(0, W);
      this.y = initial ? rand(0, H) : H + rand(10, 60);

      /* Size: mix of tiny sparks and rare larger embers */
      this.isBig = Math.random() < 0.08;
      this.r = this.isBig ? rand(2.5, 4.5) : rand(0.4, 2.2);

      /* Slow upward drift like candle ash */
      this.vx = rand(-0.15, 0.15);
      this.vy = rand(-0.6, -0.1);

      /* Unique horizontal wave */
      this.waveAmp = rand(0.05, 0.25);
      this.waveFreq = rand(0.0004, 0.0012);
      this.waveOffset = rand(0, Math.PI * 2);

      /* Glow radius (shadow blur) */
      this.glowSize = this.isBig ? rand(14, 28) : rand(4, 12);

      const isLight = document.documentElement.classList.contains('theme-light');
      this.resetColor(isLight);

      /* Some embers twinkle rapidly */
      this.twinkle = Math.random() < 0.15;
      this.twinkleSpeed = rand(0.003, 0.007);
      this.alphaSpeed = rand(0.002, 0.008) * (Math.random() < 0.5 ? 1 : -1);

      /* Lifespan — embers fade out near top */
      this.life = 1.0;
    }

    update() {
      /* Gentle wave motion */
      const wave = Math.sin(Date.now() * this.waveFreq + this.waveOffset) * this.waveAmp;
      this.x += this.vx + wave;
      this.y += this.vy;

      /* Dynamic theme switch response */
      const isLight = document.documentElement.classList.contains('theme-light');
      if (this.isLightThemeColor !== isLight) {
        this.resetColor(isLight);
      }

      /* Alpha breathing */
      if (this.twinkle) {
        this.alpha = this.alphaMin +
          (Math.sin(Date.now() * this.twinkleSpeed + this.x) + 1) * 0.5 *
          (this.alphaMax - this.alphaMin);
      } else {
        this.alpha += this.alphaSpeed;
        if (this.alpha > this.alphaMax) { this.alpha = this.alphaMax; this.alphaSpeed *= -1; }
        if (this.alpha < this.alphaMin) { this.alpha = this.alphaMin; this.alphaSpeed *= -1; }
      }

      /* Fade out near top of screen */
      const topFade = this.y / (H * 0.2);
      this.life = Math.min(1, topFade);

      /* Recycle if off-screen or fully faded */
      if (this.y < -20 || this.x < -20 || this.x > W + 20 || this.life <= 0) {
        this.reset(false);
      }
    }

    draw() {
      const a = this.alpha * this.life;
      if (a < 0.01) return;

      const { r, g, b } = this.color;

      ctx.save();

      /* Soft glow via shadow */
      ctx.shadowBlur = this.glowSize * a * 2;
      ctx.shadowColor = `rgba(${r},${g},${b},${(a * 0.7).toFixed(3)})`;

      /* Main ember dot */
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.fill();

      /* Big embers get an extra outer glow ring */
      if (this.isBig && a > 0.2) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${(a * 0.06).toFixed(3)})`;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, () => new Ember());
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) { p.update(); p.draw(); }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => {
    resize();
    for (const p of particles) { if (Math.random() < 0.4) p.reset(true); }
  });

  init();
  loop();
})();
