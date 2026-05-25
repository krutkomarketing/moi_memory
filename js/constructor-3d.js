/* ═══════════════════════════════════════════════
   3D CONSTRUCTOR — Live metal QR plaque preview
   Uses Three.js, OrbitControls, and QRious
   ═══════════════════════════════════════════════ */

(function () {
  // Global variables within this closure
  let scene, camera, renderer, controls;
  let plateMesh, laserLine, particlesMesh;
  let textures = {};
  
  let currentMetal = 'gold';
  let currentRoughness = 0.15;
  let currentEtchDepth = 0.65;
  let qrText = "https://example.com/memory";
  let autoRotate = true;
  let isLaserEngraving = false;
  let laserProgress = 0;

  let isDraggingPlate = false;
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotationX = -0.25; 
  let targetRotationY = -0.45; // Tilted to the left (right side further away)

  const metalsConfig = {
      gold: { 
          color: '#c8a84b',
          darkEtch: '#0d0d0d', // Deep black enamel
          roughness: 0.18, 
          metalness: 1.0 
      },
      bronze: { 
          color: '#8a7035',
          darkEtch: '#0a0a0a',
          roughness: 0.22, 
          metalness: 0.95 
      },
      silver: { 
          color: '#e0dfdb',
          darkEtch: '#0f0f0f',
          roughness: 0.15, 
          metalness: 1.0 
      }
  };

  const canvasColor = document.createElement('canvas');
  const canvasRough = document.createElement('canvas');
  const canvasBump = document.createElement('canvas');
  const size = 1024;
  canvasColor.width = canvasRough.width = canvasBump.width = size;
  canvasColor.height = canvasRough.height = canvasBump.height = size;

  // Initialize
  function init() {
      init3D();
      updateMetalUI();
      
      const loader = document.getElementById('canvas-loader');
      if (loader) {
          setTimeout(() => {
              loader.classList.add('is-hidden');
          }, 800);
      }
  }

  function adjustColorBrightness(hex, percent) {
      const num = parseInt(hex.replace("#",""), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = (num >> 8 & 0x00FF) + amt,
      B = (num & 0x0000FF) + amt;
      return "#" + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
  }

  function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
  }

  function init3D() {
      const container = document.getElementById('canvas-container');
      if (!container) return;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x080808, 0.018);

      camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.set(0, 0.2, 6.5); 

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = false;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; 
      renderer.toneMappingExposure = 1.15;
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 3.5;
      controls.maxDistance = 14;
      controls.target.set(0, 0, 0);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
      scene.add(ambientLight);

      // Main light from top-left
      const mainLight = new THREE.DirectionalLight(0xfff0d4, 2.5);
      mainLight.position.set(-15, 15, 10); 
      mainLight.castShadow = false;
      scene.add(mainLight);

      // Fill light from bottom-right to soften shadows
      const fillLight = new THREE.DirectionalLight(0xc8a84b, 1.5); 
      fillLight.position.set(15, -10, 10);
      scene.add(fillLight);
      
      // Broad front light to evenly illuminate the QR code
      const frontLight = new THREE.DirectionalLight(0xffffff, 2.0);
      frontLight.position.set(0, 0, 15);
      scene.add(frontLight);

      const studioEnvTexture = createStudioEnvironment(renderer);
      scene.environment = studioEnvTexture;



      // Orbs particles
      const particlesCount = 60;
      const particlesGeo = new THREE.BufferGeometry();
      const posArray = new Float32Array(particlesCount * 3);
      const scaleArray = new Float32Array(particlesCount);
      
      for(let i = 0; i < particlesCount; i++) {
          posArray[i*3] = (Math.random() - 0.5) * 12;     
          posArray[i*3+1] = Math.random() * 12 - 4;       
          posArray[i*3+2] = (Math.random() - 0.5) * 8;   
          scaleArray[i] = Math.random() * 0.5 + 0.5;
      }
      
      particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      particlesGeo.setAttribute('aScale', new THREE.BufferAttribute(scaleArray, 1));
      
      const particleCanvas = document.createElement('canvas');
      particleCanvas.width = 64; particleCanvas.height = 64;
      const pCtx = particleCanvas.getContext('2d');
      const pGrad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      pGrad.addColorStop(0, 'rgba(226, 201, 126, 0.6)');
      pGrad.addColorStop(0.3, 'rgba(200, 168, 75, 0.2)');
      pGrad.addColorStop(1, 'rgba(138, 112, 53, 0)');
      pCtx.fillStyle = pGrad;
      pCtx.beginPath(); pCtx.arc(32, 32, 32, 0, Math.PI * 2); pCtx.fill();
      const particleTexture = new THREE.CanvasTexture(particleCanvas);

      const particlesMat = new THREE.PointsMaterial({
          size: 1.2,
          map: particleTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.6
      });
      
      particlesMesh = new THREE.Points(particlesGeo, particlesMat);
      scene.add(particlesMesh);

      const plateGeometry = new THREE.BoxGeometry(4.0, 4.0, 0.12);

      generatePlateTextures();

      const faceMaterial = new THREE.MeshStandardMaterial({
          map: textures.color,
          roughnessMap: textures.rough,
          bumpMap: textures.bump,
          bumpScale: 0.025, // Increased height for realistic raised look
          metalness: metalsConfig[currentMetal].metalness,
          roughness: currentRoughness,
          envMap: studioEnvTexture,
          envMapIntensity: 2.2 
      });

      const sideMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(metalsConfig[currentMetal].color),
          roughness: currentRoughness + 0.05,
          metalness: metalsConfig[currentMetal].metalness,
          envMap: studioEnvTexture,
          envMapIntensity: 1.5
      });

      plateMesh = new THREE.Mesh(plateGeometry, [
          sideMaterial, sideMaterial, sideMaterial, sideMaterial, faceMaterial, sideMaterial
      ]);
      plateMesh.castShadow = false;
      plateMesh.receiveShadow = false;
      plateMesh.position.y = 0.0; 
      scene.add(plateMesh);

      const laserGeo = new THREE.CylinderGeometry(0.01, 0.01, 4.3, 8);
      const laserMat = new THREE.MeshBasicMaterial({
          color: 0xffeaa0, 
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending
      });
      laserLine = new THREE.Mesh(laserGeo, laserMat);
      laserLine.rotation.z = Math.PI / 2;
      scene.add(laserLine);

      setupUIEvents();
      animate();
  }

  function createStudioEnvironment(renderer) {
      const envCanvas = document.createElement('canvas');
      envCanvas.width = 1024;
      envCanvas.height = 512;
      const ctx = envCanvas.getContext('2d');

      ctx.fillStyle = '#050505'; 
      ctx.fillRect(0, 0, 1024, 512);

      let grad1 = ctx.createRadialGradient(250, 120, 10, 250, 120, 350);
      grad1.addColorStop(0, '#ffffff');
      grad1.addColorStop(0.2, 'rgba(245, 239, 224, 0.8)');
      grad1.addColorStop(0.6, 'rgba(200, 168, 75, 0.15)');
      grad1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, 1024, 512);

      let grad2 = ctx.createRadialGradient(750, 380, 20, 750, 380, 400);
      grad2.addColorStop(0, '#e2c97e');
      grad2.addColorStop(0.4, 'rgba(200, 168, 75, 0.4)');
      grad2.addColorStop(0.8, 'rgba(138, 112, 53, 0.05)');
      grad2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, 1024, 512);

      const envTexture = new THREE.CanvasTexture(envCanvas);
      envTexture.mapping = THREE.EquirectangularReflectionMapping;
      return envTexture;
  }

  function drawPlaqueDesign(ctx, qrCanvas, mode, mConfig, bumpDepthVal) {
      const qrImgData = qrCanvas.getContext('2d').getImageData(0, 0, qrCanvas.width, qrCanvas.height);
      const tempQrCanvas = document.createElement('canvas');
      tempQrCanvas.width = qrCanvas.width;
      tempQrCanvas.height = qrCanvas.height;
      const tCtx = tempQrCanvas.getContext('2d');
      tCtx.putImageData(qrImgData, 0, 0);
      
      tCtx.globalCompositeOperation = 'source-in';
      
      // Calculate drawing size: add a small padding (3.5% on each side) to make it look like a physical plate
      const padding = size * 0.035;
      const qrDrawSize = size - (padding * 2);

      if (mode === 'color') {
          tCtx.fillStyle = mConfig.darkEtch || '#0d0d0d';
          tCtx.fillRect(0, 0, tempQrCanvas.width, tempQrCanvas.height);
          ctx.drawImage(tempQrCanvas, padding, padding, qrDrawSize, qrDrawSize);

      } else if (mode === 'rough') {
          tCtx.fillStyle = 'rgb(38, 38, 38)';
          tCtx.fillRect(0, 0, tempQrCanvas.width, tempQrCanvas.height);
          ctx.drawImage(tempQrCanvas, padding, padding, qrDrawSize, qrDrawSize);

      } else if (mode === 'bump') {
          tCtx.fillStyle = 'rgb(120, 120, 120)';
          tCtx.fillRect(0, 0, tempQrCanvas.width, tempQrCanvas.height);
          ctx.drawImage(tempQrCanvas, padding, padding, qrDrawSize, qrDrawSize);
      }
  }

  function generatePlateTextures() {
      const ctxColor = canvasColor.getContext('2d');
      const ctxRough = canvasRough.getContext('2d');
      const ctxBump = canvasBump.getContext('2d');

      const mConfig = metalsConfig[currentMetal];

      // 1. Fill base maps
      // Base Color
      let gradient = ctxColor.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, adjustColorBrightness(mConfig.color, -8));
      gradient.addColorStop(0.4, adjustColorBrightness(mConfig.color, 8));
      gradient.addColorStop(0.6, adjustColorBrightness(mConfig.color, -2));
      gradient.addColorStop(1, adjustColorBrightness(mConfig.color, -10));
      ctxColor.fillStyle = gradient;
      ctxColor.fillRect(0, 0, size, size);

      // Base Roughness
      const baseRoughnessColor = Math.round(currentRoughness * 255);
      ctxRough.fillStyle = `rgb(${baseRoughnessColor}, ${baseRoughnessColor}, ${baseRoughnessColor})`;
      ctxRough.fillRect(0, 0, size, size);

      // Base Bump (gray background)
      ctxBump.fillStyle = '#808080';
      ctxBump.fillRect(0, 0, size, size);

      // 2. Generate QR code on a temporary canvas
      const qrGenSize = 800;
      const tempQrCanvas = document.createElement('canvas');
      new QRious({
          element: tempQrCanvas,
          value: qrText,
          size: qrGenSize,
          padding: 0,
          backgroundAlpha: 0,
          foreground: '#000000',
          level: 'H' 
      });

      const qrCtx = tempQrCanvas.getContext('2d');
      const rawImg = qrCtx.getImageData(0, 0, qrGenSize, qrGenSize);
      const d = rawImg.data;
      let minX = qrGenSize, minY = qrGenSize, maxX = 0, maxY = 0;
      
      for (let y = 0; y < qrGenSize; y++) {
          for (let x = 0; x < qrGenSize; x++) {
              const idx = (y * qrGenSize + x) * 4;
              if (d[idx] < 128 && d[idx+3] > 128) { 
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
              } else {
                  d[idx+3] = 0; // Make white/light background transparent
              }
          }
      }
      
      qrCtx.putImageData(rawImg, 0, 0);

      if (minX > maxX || minY > maxY) {
          minX = 0; minY = 0; maxX = qrGenSize - 1; maxY = qrGenSize - 1;
      }

      const finalQrCanvas = document.createElement('canvas');
      finalQrCanvas.width = size;
      finalQrCanvas.height = size;
      const fCtx = finalQrCanvas.getContext('2d');
      fCtx.imageSmoothingEnabled = false;
      fCtx.clearRect(0, 0, size, size); 
      
      fCtx.drawImage(
          tempQrCanvas, 
          minX, minY, (maxX - minX) + 1, (maxY - minY) + 1, 
          0, 0, size, size 
      );

      const finalQrImgData = fCtx.getImageData(0, 0, size, size);
      const pixels = finalQrImgData.data;

      // Draw standard layout onto maps
      drawPlaqueDesign(ctxColor, finalQrCanvas, 'color', mConfig);
      drawPlaqueDesign(ctxRough, finalQrCanvas, 'rough', mConfig);
      
      const bumpDepthVal = Math.min(255, 128 + Math.round(currentEtchDepth * 110));
      drawPlaqueDesign(ctxBump, finalQrCanvas, 'bump', mConfig, bumpDepthVal);

      // Blur bump map for smooth beveled edges
      const tempBumpCanvas = document.createElement('canvas');
      tempBumpCanvas.width = size;
      tempBumpCanvas.height = size;
      const tempBumpCtx = tempBumpCanvas.getContext('2d');
      tempBumpCtx.drawImage(canvasBump, 0, 0);

      ctxBump.clearRect(0, 0, size, size);
      ctxBump.filter = 'blur(3px)';
      ctxBump.drawImage(tempBumpCanvas, 0, 0);
      ctxBump.filter = 'none';

      if (textures.color) {
          textures.color.needsUpdate = true;
          textures.rough.needsUpdate = true;
          textures.bump.needsUpdate = true;
      } else {
          textures.color = new THREE.CanvasTexture(canvasColor);
          textures.rough = new THREE.CanvasTexture(canvasRough);
          textures.bump = new THREE.CanvasTexture(canvasBump);
      }
  }

  function setupUIEvents() {
      const qrInput = document.getElementById('qr-input');
      if (qrInput) {
          qrInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') triggerEngravingSequence();
          });
      }

      const roughnessSlider = document.getElementById('roughness-slider');
      const roughnessVal = document.getElementById('roughness-val');
      if (roughnessSlider && roughnessVal) {
          roughnessSlider.oninput = function() {
              currentRoughness = parseFloat(this.value);
              roughnessVal.innerText = `${Math.round(currentRoughness * 100)}%`;
              
              generatePlateTextures();
              if (plateMesh) {
                  plateMesh.material[0].roughness = currentRoughness;
                  plateMesh.material[0].needsUpdate = true;
              }
          };
      }

      const etchSlider = document.getElementById('etch-slider');
      const etchVal = document.getElementById('etch-val');
      if (etchSlider && etchVal) {
          etchSlider.oninput = function() {
              currentEtchDepth = parseFloat(this.value);
              etchVal.innerText = `${Math.round(currentEtchDepth * 100)}%`;
              generatePlateTextures();
          };
      }

      const autoRotateCheck = document.getElementById('autorotate-check');
      if (autoRotateCheck) {
          autoRotateCheck.onchange = function() {
              autoRotate = this.checked;
          };
      }

      const laserBtn = document.getElementById('laser-btn');
      if (laserBtn) {
          laserBtn.onclick = triggerEngravingSequence;
      }

      window.addEventListener('resize', onWindowResize);

      const container = document.getElementById('canvas-container');
      if (container) {
          container.addEventListener('pointerdown', (e) => {
              if (isLaserEngraving) return; 
              isDraggingPlate = true;
              previousMousePosition = { x: e.clientX, y: e.clientY };
              
              if (plateMesh) {
                  targetRotationX = plateMesh.rotation.x;
                  targetRotationY = plateMesh.rotation.y;
              }
          });
      }

      window.addEventListener('pointermove', (e) => {
          if (isDraggingPlate && plateMesh) {
              const deltaX = e.clientX - previousMousePosition.x;
              const deltaY = e.clientY - previousMousePosition.y;
              
              targetRotationY += deltaX * 0.008; 
              targetRotationX += deltaY * 0.008; 
              
              targetRotationX = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, targetRotationX));
              targetRotationY = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, targetRotationY));

              previousMousePosition = { x: e.clientX, y: e.clientY };
          }
      });

      window.addEventListener('pointerup', () => {
          isDraggingPlate = false;
      });
  }

  window.setMetal = function(metalKey) {
      currentMetal = metalKey;
      updateMetalUI();

      const config = metalsConfig[metalKey];
      currentRoughness = config.roughness;

      const roughnessSlider = document.getElementById('roughness-slider');
      const roughnessVal = document.getElementById('roughness-val');
      if (roughnessSlider && roughnessVal) {
          roughnessSlider.value = currentRoughness;
          roughnessVal.innerText = `${Math.round(currentRoughness * 100)}%`;
      }

      generatePlateTextures();
      
      if (plateMesh) {
          plateMesh.material[0].metalness = config.metalness;
          plateMesh.material[0].roughness = currentRoughness;
          plateMesh.material[0].needsUpdate = true;

          plateMesh.material[1].color.set(config.color);
          plateMesh.material[1].metalness = config.metalness;
          plateMesh.material[1].roughness = currentRoughness + 0.05;
          plateMesh.material[1].needsUpdate = true;
      }

      targetRotationY += 0.35;
  };

  function updateMetalUI() {
      document.querySelectorAll('.metal-btn').forEach(btn => {
          btn.classList.remove('metal-btn--active');
      });
      const activeBtn = document.getElementById(`btn-${currentMetal}`);
      if (activeBtn) {
          activeBtn.classList.add('metal-btn--active');
      }
  }

  function triggerEngravingSequence() {
      const qrInput = document.getElementById('qr-input');
      if (!qrInput) return;
      const inputVal = qrInput.value;
      if (inputVal.trim() === '') return;
      
      qrText = inputVal;
      startLaserAnimation();
      
      setTimeout(() => {
          generatePlateTextures();
      }, 600);
  }

  function startLaserAnimation() {
      if (isLaserEngraving) return;
      isLaserEngraving = true;
      isDraggingPlate = false; 
      laserProgress = -2.2; 
      
      if (laserLine) {
          laserLine.material.opacity = 1.0;
      }
      
      targetRotationX = 0;
      targetRotationY = 0;
  }

  function onWindowResize() {
      const container = document.getElementById('canvas-container');
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function animate(time = 0) {
      requestAnimationFrame(animate);

      if (particlesMesh) {
          const positions = particlesMesh.geometry.attributes.position.array;
          
          for(let i = 0; i < positions.length; i += 3) {
              positions[i + 1] += 0.003;
              positions[i] += Math.sin(time * 0.0005 + positions[i+1]) * 0.002;
              
              if (positions[i + 1] > 8) {
                  positions[i + 1] = -6 - Math.random() * 2;
                  positions[i] = (Math.random() - 0.5) * 12;
              }
          }
          particlesMesh.geometry.attributes.position.needsUpdate = true;
          particlesMesh.rotation.y += 0.0002;
      }

      if (plateMesh) {
          if (!isLaserEngraving) {
              if (autoRotate && !isDraggingPlate) {
                  const idealRotation = -0.45 + Math.sin(time * 0.0005) * 0.15;
                  targetRotationY += (idealRotation - targetRotationY) * 0.015; 
              }
              plateMesh.rotation.y += (targetRotationY - plateMesh.rotation.y) * 0.08;
              plateMesh.rotation.x += (targetRotationX - plateMesh.rotation.x) * 0.08;
          } else {
              plateMesh.rotation.y += (0 - plateMesh.rotation.y) * 0.15;
              plateMesh.rotation.x += (0 - plateMesh.rotation.x) * 0.15;
          }
      }

      if (isLaserEngraving && laserLine) {
          laserProgress += 0.045;
          laserLine.position.y = -laserProgress + 0.8; 
          laserLine.position.z = 0.11 + Math.sin(time * 0.15) * 0.005;

          if (laserProgress > 2.2) {
              laserLine.material.opacity -= 0.08;
              if (laserLine.material.opacity <= 0) {
                  isLaserEngraving = false;
                  laserLine.material.opacity = 0;
              }
          }
      }

      if (controls) {
          controls.update(); 
      }
      if (renderer && scene && camera) {
          renderer.render(scene, camera);
      }
  }

  // Run on load
  init();
})();
