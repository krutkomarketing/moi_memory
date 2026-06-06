/* ═══════════════════════════════════════════════
   GSAP EFFECTS & UI POLISH (Emil Kowalski inspired)
   ═══════════════════════════════════════════════ */

(function () {
  // Ensure gsap is loaded
  if (typeof gsap === 'undefined') {
    console.warn('GSAP is not loaded. Skipping custom animations.');
    return;
  }

  // Register GSAP Plugins
  if (typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }
  if (typeof ScrollSmoother !== 'undefined') {
    gsap.registerPlugin(ScrollSmoother);
  }
  if (typeof TextPlugin !== 'undefined') {
    gsap.registerPlugin(TextPlugin);
  }
  if (typeof ScrambleTextPlugin !== 'undefined') {
    gsap.registerPlugin(ScrambleTextPlugin);
  }
  if (typeof DrawSVGPlugin !== 'undefined') {
    gsap.registerPlugin(DrawSVGPlugin);
  }
  if (typeof Draggable !== 'undefined') {
    gsap.registerPlugin(Draggable);
  }
  if (typeof InertiaPlugin !== 'undefined') {
    gsap.registerPlugin(InertiaPlugin);
  }
  if (typeof Flip !== 'undefined') {
    gsap.registerPlugin(Flip);
  }

  // Initialize ScrollSmoother if wrapper exists
  let smoother;
  if (typeof ScrollSmoother !== 'undefined' && document.getElementById('smooth-wrapper')) {
    smoother = ScrollSmoother.create({
      wrapper: "#smooth-wrapper",
      content: "#smooth-content",
      smooth: 1.2,
      effects: true,
      smoothTouch: 0.1
    });
  }

  console.log('GSAP Effects successfully initialized.');

  // Scramble text effect on page load for hero eyebrow
  const eyebrow = document.querySelector('.hero__eyebrow');
  if (eyebrow && typeof ScrambleTextPlugin !== 'undefined') {
    gsap.fromTo(eyebrow, 
      { opacity: 0 },
      {
        opacity: 1,
        duration: 1.5,
        scrambleText: {
          text: eyebrow.textContent.trim(),
          chars: "словопамятьистория019*",
          revealDelay: 0.1,
          speed: 0.4
        },
        ease: "power2.out"
      }
    );
  }

  // Scramble text for about page title
  const aboutTitle = document.querySelector('.about-page h1');
  if (aboutTitle && typeof ScrambleTextPlugin !== 'undefined') {
    gsap.fromTo(aboutTitle,
      { opacity: 0 },
      {
        opacity: 1,
        duration: 1.8,
        scrambleText: {
          text: aboutTitle.textContent.trim(),
          chars: "абвгдежзийклмнопрст*",
          revealDelay: 0.1,
          speed: 0.3
        },
        ease: "power2.out"
      }
    );
  }

  // Scramble text for quote block
  const quotes = document.querySelectorAll('.footer__quote');
  if (quotes.length && typeof ScrambleTextPlugin !== 'undefined') {
    quotes.forEach(quote => {
      gsap.from(quote, {
        opacity: 0,
        scrollTrigger: {
          trigger: quote,
          start: "top 90%",
          onEnter: () => {
            gsap.to(quote, {
              opacity: 1,
              duration: 2.0,
              scrambleText: {
                text: "Пока мы помним — они живы.",
                chars: "памятьвечностьистория*",
                revealDelay: 0.05,
                speed: 0.5
              },
              onComplete: () => {
                quote.innerHTML = "Пока мы помним —<br/>они живы.";
              }
            });
          }
        }
      });
    });
  }

  /* ── 1. Tactile Button & Card Active Presses ── */
  // Instead of static translateY, use spring-like scale scaling on click!
  document.addEventListener('mousedown', (e) => {
    const pressable = e.target.closest('.btn, .person-card, .tree-node, .gallery-carousel__btn, .review-type-tab, .faq-item summary, .auth-modal__submit, .page-guard-box__btn');
    if (!pressable) return;
    
    gsap.to(pressable, {
      scale: 0.96,
      duration: 0.1,
      ease: "power2.out"
    });
  });

  document.addEventListener('mouseup', (e) => {
    const pressable = e.target.closest('.btn, .person-card, .tree-node, .gallery-carousel__btn, .review-type-tab, .faq-item summary, .auth-modal__submit, .page-guard-box__btn');
    if (!pressable) return;
    
    gsap.to(pressable, {
      scale: 1,
      duration: 0.25,
      ease: "elastic.out(1.2, 0.5)"
    });
  });

  /* ── 2. Reusable Modal Closing Transition ── */
  // This helper will be called by modal scripts (auth-ui.js, tree.js) before calling .remove()
  window.closeModalWithGSAP = function(modalEl, contentSelector) {
    const content = contentSelector ? modalEl.querySelector(contentSelector) : modalEl.firstElementChild;
    
    const tl = gsap.timeline({
      onComplete: () => {
        modalEl.remove();
      }
    });
    
    // Smooth backdrop fade out
    tl.to(modalEl, { 
      opacity: 0, 
      duration: 0.2, 
      ease: "power2.inOut" 
    });
    
    // Content scale down & fade out (starts from current state down to 0.95)
    if (content) {
      tl.to(content, { 
        scale: 0.94, 
        opacity: 0, 
        duration: 0.2, 
        ease: "power2.inOut" 
      }, "<");
    }
  };

  /* ── 3. FAQ Accordion Height Animations (faq.html) ── */
  const faqItems = document.querySelectorAll('details.faq-item');
  if (faqItems.length) {
    faqItems.forEach(details => {
      const summary = details.querySelector('summary');
      const answer = details.querySelector('.faq-answer');
      if (!summary || !answer) return;

      summary.addEventListener('click', (e) => {
        e.preventDefault(); // Stop native instant snap toggle
        
        const isOpen = details.hasAttribute('open');
        
        if (!isOpen) {
          // Open details
          details.setAttribute('open', '');
          // Calculate full auto height
          const fullHeight = answer.scrollHeight;
          
          gsap.fromTo(answer, 
            { height: 0, opacity: 0, paddingBottom: 0 },
            { 
              height: fullHeight, 
              opacity: 1, 
              paddingBottom: "1.1rem",
              duration: 0.35, 
              ease: "power3.out", 
              clearProps: "height,paddingBottom" 
            }
          );
        } else {
          // Close details
          const currentHeight = answer.scrollHeight;
          gsap.fromTo(answer,
            { height: currentHeight, opacity: 1 },
            {
              height: 0,
              opacity: 0,
              paddingBottom: 0,
              duration: 0.25,
              ease: "power2.inOut",
              onComplete: () => {
                details.removeAttribute('open');
              }
            }
          );
        }
      });
    });
  }

  /* ── 4. Scroll Trigger & Page Load Reveals ── */
  if (typeof ScrollTrigger !== 'undefined') {
    // 4a. Hero content fade-in with slight translate
    if (document.querySelector(".hero__inner")) {
      gsap.from(".hero__inner > *", {
        y: 24,
        opacity: 0,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out"
      });
    }

    if (document.querySelector(".hero__visual")) {
      gsap.from(".hero__visual", {
        scale: 0.98,
        opacity: 0,
        duration: 1.0,
        ease: "power3.out"
      }, "-=0.6");
    }

    // 4b. Stats counter animation (replaces custom intervals)
    const statNums = document.querySelectorAll('.stat__num');
    if (statNums.length) {
      statNums.forEach(numEl => {
        const target = parseInt(numEl.dataset.count, 10) || 0;
        
        numEl.textContent = "0"; 

        gsap.fromTo(numEl, 
          { textContent: 0 },
          {
            textContent: target,
            duration: 1.5,
            ease: "power2.out",
            snap: { textContent: 1 },
            scrollTrigger: {
              trigger: numEl,
              start: "top 90%",
              toggleActions: "play none none none"
            },
            onUpdate: function() {
              const labelEl = numEl.closest('.stat')?.querySelector('.stat__label');
              const currentVal = Math.round(numEl.textContent);
              numEl.textContent = currentVal;
              
              if (labelEl && window.plurals && window.plurals[numEl.dataset.stat] && typeof window.getPlural === 'function') {
                const [one, two, five] = window.plurals[numEl.dataset.stat];
                labelEl.textContent = window.getPlural(currentVal, one, two, five);
              }
            }
          }
        );
      });
    }

    // 4c. Showcase items reveal
    if (document.querySelector('.showcase__item')) {
      gsap.utils.toArray('.showcase__item').forEach(item => {
        gsap.from(item, {
          y: 36,
          opacity: 0,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: item,
            start: "top 85%",
            toggleActions: "play none none none"
          }
        });
      });
    }

    // 4d. Recently added cards grid stagger
    const lastAddedGrid = document.getElementById('last-added-grid');
    if (lastAddedGrid && lastAddedGrid.querySelector('.person-card')) {
      gsap.from(".last-added__grid > .person-card", {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: lastAddedGrid,
          start: "top 88%"
        }
      });
    }

    // 4e. Parallax polygons in hero
    if (document.querySelector(".hero")) {
      if (document.querySelector(".hero__polygon--1")) {
        gsap.to(".hero__polygon--1", {
          y: -30,
          ease: "none",
          scrollTrigger: {
            trigger: ".hero",
            start: "top top",
            end: "bottom top",
            scrub: true
          }
        });
      }
      if (document.querySelector(".hero__polygon--2")) {
        gsap.to(".hero__polygon--2", {
          y: 40,
          ease: "none",
          scrollTrigger: {
            trigger: ".hero",
            start: "top top",
            end: "bottom top",
            scrub: true
          }
        });
      }
    }

    // 4f. Candle Glow pulsation
    const halo = document.querySelector('.candle__halo');
    if (halo) {
      gsap.to(halo, {
        scale: 1.06,
        opacity: 0.85,
        duration: 1.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
    }
  }

  /* ── 5. Organic Candle Flame Flicker Loop ── */
  const flameOuter = document.querySelector('.flame--outer');
  const flameMiddle = document.querySelector('.flame--middle');
  if (flameOuter && flameMiddle) {
    function flickerFlame() {
      // Randomized values to simulate true fire physics instead of predictable CSS keyframes
      gsap.to(flameOuter, {
        scaleX: gsap.utils.random(0.92, 1.08),
        scaleY: gsap.utils.random(0.95, 1.05),
        skewX: gsap.utils.random(-1.5, 1.5),
        duration: gsap.utils.random(0.08, 0.15),
        ease: "sine.inOut",
        onComplete: flickerFlame
      });
      
      gsap.to(flameMiddle, {
        scaleX: gsap.utils.random(0.95, 1.05),
        scaleY: gsap.utils.random(0.97, 1.03),
        skewX: gsap.utils.random(-1, 1),
        duration: gsap.utils.random(0.06, 0.12),
        ease: "sine.inOut"
      });
    }
    flickerFlame();
  }

})();
