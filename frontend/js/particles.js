/* ═══════════════════════════════════════════════
   PARTICLES — Chaotic dust on black background
   ═══════════════════════════════════════════════ */

(function () {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles = [];
  const COUNT = 110;

  /* Gold/amber palette to match site theme */
  const COLORS = [
    'rgba(200,168,75,',
    'rgba(226,201,126,',
    'rgba(138,112,53,',
    'rgba(255,240,190,',
    'rgba(180,140,60,',
  ];

  function rand(min, max) { return Math.random() * (max - min) + min; }

  class Particle {
    constructor() { this.reset(true); }

    reset(initial) {
      this.x  = rand(0, W);
      this.y  = initial ? rand(0, H) : rand(-20, H + 20);
      this.r  = rand(0.5, 2.4);
      this.vx = rand(-0.25, 0.25);
      this.vy = rand(-0.4, -0.05);
      this.alpha = rand(0.04, 0.55);
      this.alphaSpeed = rand(0.002, 0.006) * (Math.random() < 0.5 ? 1 : -1);
      this.alphaMin = rand(0.02, 0.1);
      this.alphaMax = rand(0.35, 0.65);
      this.color = COLORS[Math.floor(rand(0, COLORS.length))];
      /* occasional twinkle */
      this.twinkle = Math.random() < 0.18;
    }

    update() {
      this.x += this.vx + Math.sin(Date.now() * 0.0003 + this.y * 0.01) * 0.12;
      this.y += this.vy;

      this.alpha += this.alphaSpeed;
      if (this.alpha > this.alphaMax) { this.alpha = this.alphaMax; this.alphaSpeed *= -1; }
      if (this.alpha < this.alphaMin) { this.alpha = this.alphaMin; this.alphaSpeed *= -1; }

      if (this.twinkle) {
        this.alpha = this.alphaMin + (Math.sin(Date.now() * 0.003 + this.x) + 1) * 0.5 * (this.alphaMax - this.alphaMin);
      }

      if (this.y < -10 || this.x < -10 || this.x > W + 10) this.reset(false);
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color + this.alpha.toFixed(3) + ')';
      ctx.fill();
    }
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, () => new Particle());
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) { p.update(); p.draw(); }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => {
    resize();
    /* redistribute particles */
    for (const p of particles) { if (Math.random() < 0.4) p.reset(true); }
  });

  init();
  loop();
})();
