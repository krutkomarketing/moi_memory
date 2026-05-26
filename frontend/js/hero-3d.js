/* ═══════════════════════════════════════════════
   HERO 3D PLAQUE — Interactive Gold QR Plaque in Hero
   Uses Three.js, OrbitControls, and QRious
   ═══════════════════════════════════════════════ */

(function () {
  let scene, camera, renderer, controls;
  let plateMesh, particlesMesh;
  let textures = {};
  
  const currentMetal = 'gold';
  const currentRoughness = 0.18;
  const currentEtchDepth = 0.65;
  const qrText = window.location.href; // Plaque points to the current site!
  const autoRotate = true;

  let isDraggingPlate = false;
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotationX = -0.25; // Tilted slightly back to catch the top light
  let targetRotationY = -0.45; // Tilted to the left (right side further away)

  const metalsConfig = {
      gold: { 
          color: '#c8a84b',
          darkEtch: '#0d0d0d', // Deep black enamel
          roughness: 0.18, 
          metalness: 1.0 
      }
  };

  const canvasColor = document.createElement('canvas');
  const canvasRough = document.createElement('canvas');
  const canvasBump = document.createElement('canvas');
  const size = 1024;
  canvasColor.width = canvasRough.width = canvasBump.width = size;
  canvasColor.height = canvasRough.height = canvasBump.height = size;

  function init() {
      init3D();
      
      const loader = document.getElementById('hero-canvas-loader');
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
      const container = document.getElementById('hero-canvas-container');
      if (!container) return;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x080808, 0.018);

      // Camera adjusted for vertical hero container
      camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.set(0, 0.8, 8.8); 

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
      controls.enableZoom = false; // No zoom in hero to prevent breaking layout
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.target.set(0, 0.8, 0);

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

      // Orbs particles in background
      const particlesCount = 40;
      const particlesGeo = new THREE.BufferGeometry();
      const posArray = new Float32Array(particlesCount * 3);
      const scaleArray = new Float32Array(particlesCount);
      
      for(let i = 0; i < particlesCount; i++) {
          posArray[i*3] = (Math.random() - 0.5) * 8;     
          posArray[i*3+1] = Math.random() * 8 - 3;       
          posArray[i*3+2] = (Math.random() - 0.5) * 6;   
          scaleArray[i] = Math.random() * 0.4 + 0.4;
      }
      
      particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      particlesGeo.setAttribute('aScale', new THREE.BufferAttribute(scaleArray, 1));
      
      const particleCanvas = document.createElement('canvas');
      particleCanvas.width = 64; particleCanvas.height = 64;
      const pCtx = particleCanvas.getContext('2d');
      const pGrad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      pGrad.addColorStop(0, 'rgba(226, 201, 126, 0.5)');
      pGrad.addColorStop(0.3, 'rgba(200, 168, 75, 0.15)');
      pGrad.addColorStop(1, 'rgba(138, 112, 53, 0)');
      pCtx.fillStyle = pGrad;
      pCtx.beginPath(); pCtx.arc(32, 32, 32, 0, Math.PI * 2); pCtx.fill();
      const particleTexture = new THREE.CanvasTexture(particleCanvas);

      const particlesMat = new THREE.PointsMaterial({
          size: 1.0,
          map: particleTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.5
      });
      
      particlesMesh = new THREE.Points(particlesGeo, particlesMat);
      scene.add(particlesMesh);

      // Plate geometry
      const plateGeometry = new THREE.BoxGeometry(4.0, 4.0, 0.12);

      generatePlateTextures();

      const faceMaterial = new THREE.MeshStandardMaterial({
          map: textures.color,
          roughnessMap: textures.rough,
          bumpMap: textures.bump,
          bumpScale: 0.025, // Embossed 3D height
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
      plateMesh.position.y = 0.8;
      
      // Start with initial rotation
      plateMesh.rotation.x = targetRotationX;
      plateMesh.rotation.y = targetRotationY;
      scene.add(plateMesh);

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

      // Base color gradient
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

      // Base Bump
      ctxBump.fillStyle = '#808080';
      ctxBump.fillRect(0, 0, size, size);

      // QRious code generation
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
      window.addEventListener('resize', onWindowResize);

      const container = document.getElementById('hero-canvas-container');
      if (container) {
          container.addEventListener('pointerdown', (e) => {
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

  function onWindowResize() {
      const container = document.getElementById('hero-canvas-container');
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
                  positions[i] = (Math.random() - 0.5) * 8;
              }
          }
          particlesMesh.geometry.attributes.position.needsUpdate = true;
          particlesMesh.rotation.y += 0.0002;
      }

      if (plateMesh) {
          if (!isDraggingPlate && autoRotate) {
              const idealRotation = -0.45 + Math.sin(time * 0.0005) * 0.15;
              targetRotationY += (idealRotation - targetRotationY) * 0.015; 
          }
          plateMesh.rotation.y += (targetRotationY - plateMesh.rotation.y) * 0.08;
          plateMesh.rotation.x += (targetRotationX - plateMesh.rotation.x) * 0.08;
      }

      if (controls) {
          controls.update(); 
      }
      if (renderer && scene && camera) {
          renderer.render(scene, camera);
      }
  }

  init();
})();
