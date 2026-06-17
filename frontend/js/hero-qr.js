(function () {
  // Подстраховка автоплея для iOS: запускаем все приглушённые видео при первом тапе/клике
  const forcePlayAll = () => {
    document.querySelectorAll("video").forEach((video) => {
      if (video.paused && video.muted) {
        video.play().catch(() => {});
      }
    });
    document.removeEventListener("touchstart", forcePlayAll);
    document.removeEventListener("click", forcePlayAll);
  };
  document.addEventListener("touchstart", forcePlayAll, { passive: true });
  document.addEventListener("click", forcePlayAll, { passive: true });

  const v = document.getElementById("hero-qr-video");
  const box = document.getElementById("hero-canvas-container");
  if (!v) return;

  // Плавный авто-цикл, без вращения по нажатию.
  v.loop = true;
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");

  // Экономия: пауза, когда блок вне экрана.
  const target = box || v;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      });
    },
    { threshold: 0.2 }
  );
  observer.observe(target);

  // Подстраховка для автоплея (iOS/первый кадр).
  v.play().catch(() => {});
})();
