/* ═══════════════════════════════════════════════
   PAGE TRANSITIONS — Dissolve / fade between pages
   Animate a smooth fade-to-black before navigation
   using GSAP for premium performance.
   Includes a premium cross-page shared element Flip transition.
   ═══════════════════════════════════════════════ */

(function () {
  const DURATION_OUT = 0.3; // seconds for fade out
  const DURATION_IN = 0.35; // seconds for fade in

  /* Check if this is a direct entry to family-tree.html without a tree parameter,
     where the user is logged in (meaning a client-side redirect will occur).
     We hold the overlay as black (faded out) during this phase to avoid page flash. */
  const urlParams = new URLSearchParams(window.location.search);
  const isTreeRedirectCandidate = 
    (window.location.pathname.endsWith('family-tree.html') || window.location.pathname.includes('/family-tree.html')) &&
    !urlParams.has('tree') &&
    (localStorage.getItem('memory_jwt') || localStorage.getItem('memory_user'));

  /* Create the overlay element with visible class (starts black/opaque) */
  const overlay = document.createElement('div');
  overlay.className = 'page-transition-overlay page-transition--visible';
  overlay.style.opacity = '1';
  overlay.style.display = 'block';

  function appendOverlay() {
    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      window.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(overlay);
      });
    }
  }
  appendOverlay();

  /* On page load: fade IN (fade out the black overlay to transparent) */
  let fadedIn = false;
  let flipTriggered = false;

  function fadeIn() {
    if (fadedIn) return;
    
    // If a Flip transition is active, we skip the automatic page load fade-in
    // and wait for window.triggerFlipTransition() to be called from the profile page renderer.
    if (sessionStorage.getItem('flip_avatar_active') === 'true' && !flipTriggered) {
      return;
    }

    if (!document.body) {
      requestAnimationFrame(fadeIn);
      return;
    }
    fadedIn = true;
    
    document.body.classList.add('page-loaded');
    
    if (typeof gsap !== 'undefined') {
      gsap.to(overlay, {
        opacity: 0,
        duration: DURATION_IN,
        ease: "power2.out",
        onComplete: () => {
          overlay.style.display = 'none';
          overlay.classList.remove('page-transition--visible');
        }
      });
    } else {
      overlay.style.opacity = '0';
      overlay.classList.remove('page-transition--visible');
      setTimeout(() => {
        overlay.style.display = 'none';
      }, DURATION_IN * 1000);
    }
  }

  /* On link click: fade OUT, then navigate */
  function fadeOut(href) {
    if (typeof gsap !== 'undefined') {
      overlay.style.display = 'block';
      gsap.fromTo(overlay, 
        { opacity: 0 },
        {
          opacity: 1,
          duration: DURATION_OUT,
          ease: "power2.in",
          onComplete: () => {
            window.location.href = href;
          }
        }
      );
    } else {
      overlay.style.display = 'block';
      overlay.classList.add('page-transition--visible');
      overlay.style.opacity = '1';
      setTimeout(() => {
        window.location.href = href;
      }, DURATION_OUT * 1000);
    }
  }

  /* Intercept internal link clicks */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');

    /* Skip: external links, anchors, javascript:, mailto:, new tab */
    if (!href) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('javascript:')) return;
    if (href.startsWith('mailto:')) return;
    if (href.startsWith('tel:')) return;
    if (href.startsWith('http') && !href.includes(window.location.hostname)) return;
    if (link.target === '_blank') return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;

    // If clicking a person card, capture avatar dimensions for Flip transition
    const card = link.closest('.person-card');
    if (card) {
      const img = card.querySelector('.person-card__photo img');
      if (img) {
        const rect = img.getBoundingClientRect();
        sessionStorage.setItem('flip_avatar_src', img.src);
        sessionStorage.setItem('flip_avatar_rect', JSON.stringify({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }));
        sessionStorage.setItem('flip_avatar_active', 'true');
      }
    }

    e.preventDefault();
    fadeOut(href);
  });

  /* Handle browser back/forward */
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      /* Page was restored from bfcache */
      if (typeof gsap !== 'undefined') {
        gsap.set(overlay, { opacity: 0 });
        overlay.style.display = 'none';
      } else {
        overlay.style.opacity = '0';
        overlay.style.display = 'none';
      }
      overlay.classList.remove('page-transition--visible');
      if (document.body) {
        document.body.classList.add('page-loaded');
      }
    }
  });

  /* Trigger fade-in on load (if not expecting a redirect or a Flip transition) */
  if (!isTreeRedirectCandidate) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      fadeIn();
    } else {
      window.addEventListener('DOMContentLoaded', fadeIn);
      window.addEventListener('load', fadeIn);
    }
  }

  /* Bulletproof safety fallback: force fade out after 1.8s no matter what */
  const safetyTimeout = setTimeout(() => {
    if (sessionStorage.getItem('flip_avatar_active') === 'true') {
      sessionStorage.removeItem('flip_avatar_active');
    }
    fadeIn();
  }, 1800);

  /* ── 5. Cross-Page Flip Transition ── */
  window.triggerFlipTransition = function () {
    if (flipTriggered) return;

    if (sessionStorage.getItem('flip_avatar_active') === 'true') {
      flipTriggered = true;

      const src = sessionStorage.getItem('flip_avatar_src');
      const startRectStr = sessionStorage.getItem('flip_avatar_rect');
      
      // Clear storage immediately to prevent loop
      sessionStorage.removeItem('flip_avatar_active');
      sessionStorage.removeItem('flip_avatar_src');
      sessionStorage.removeItem('flip_avatar_rect');

      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
      }

      if (!src || !startRectStr) {
        fadeIn();
        return;
      }

      const startRect = JSON.parse(startRectStr);
      const targetImg = document.querySelector('.person-header__photo img');
      
      if (!targetImg) {
        fadeIn();
        return;
      }

      // Hide target image initially
      targetImg.style.visibility = 'hidden';

      // Create a floating clone image on top of everything
      const clone = document.createElement('img');
      clone.src = src;
      clone.style.position = 'fixed';
      clone.style.left = startRect.left + 'px';
      clone.style.top = startRect.top + 'px';
      clone.style.width = startRect.width + 'px';
      clone.style.height = startRect.height + 'px';
      clone.style.objectFit = 'cover';
      clone.style.borderRadius = '10px';
      clone.style.zIndex = '999999';
      clone.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
      document.body.appendChild(clone);

      // Make sure overlay is fully dark
      overlay.style.display = 'block';
      overlay.style.opacity = '1';

      // Animate clone to target position after page layout stabilizes
      requestAnimationFrame(() => {
        setTimeout(() => {
          const endRect = targetImg.getBoundingClientRect();

          if (endRect.width === 0 || endRect.height === 0) {
            clone.remove();
            targetImg.style.visibility = 'visible';
            fadeIn();
            return;
          }

          const mainEl = document.querySelector('.person-page') || document.querySelector('main') || document.body;

          if (typeof gsap !== 'undefined') {
            const tl = gsap.timeline({
              onComplete: () => {
                targetImg.style.visibility = 'visible';
                clone.remove();
                overlay.style.display = 'none';
                overlay.classList.remove('page-transition--visible');
              }
            });

            // Fade out black overlay
            tl.to(overlay, {
              opacity: 0,
              duration: 0.55,
              ease: "power2.out"
            }, 0);

            // Fade in page text details
            tl.fromTo(mainEl,
              { opacity: 0 },
              { opacity: 1, duration: 0.45, ease: "power2.out" },
              0.05
            );

            // Fly avatar
            tl.to(clone, {
              left: endRect.left,
              top: endRect.top,
              width: endRect.width,
              height: endRect.height,
              borderRadius: '4px',
              boxShadow: 'none',
              duration: 0.65,
              ease: "power4.out"
            }, 0);
          } else {
            // GSAP fallback
            clone.remove();
            targetImg.style.visibility = 'visible';
            fadeIn();
          }
        }, 50); // slight timeout for layout calculation safety
      });
    } else {
      fadeIn();
    }
  };
})();
