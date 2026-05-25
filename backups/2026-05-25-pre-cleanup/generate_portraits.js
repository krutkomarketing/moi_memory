const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const artDir = 'C:\\Users\\ivan-\\.gemini\\antigravity\\brain\\e54c01d6-d0a5-4258-9841-edbe623f2f57';

// 13 Unique portraits generator
async function main() {
  console.log('Starting portrait generation...');

  // Step 1: Copy Gen 1 files to clean names
  const files = fs.readdirSync(artDir);
  const gen1Names = [
    'fedor_morozov',
    'olga_morozova',
    'nikolay_volkov_sr',
    'klavdia_volkova',
    'mikhail_sokolov',
    'natalia_sokolova'
  ];

  const gen1Paths = {};

  for (const name of gen1Names) {
    const matchedFile = files.find(f => f.startsWith(name + '_') && f.endsWith('.png'));
    if (!matchedFile) {
      throw new Error(`Could not find generated file for: ${name}`);
    }
    const srcPath = path.join(artDir, matchedFile);
    const destPath = path.join(artDir, `${name}.png`);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied Gen 1: ${matchedFile} -> ${name}.png`);
    gen1Paths[name] = destPath;
  }

  // Step 2: Define the Radial Mask for smooth face blending
  const radialMask = Buffer.from(`
    <svg width="450" height="450">
      <defs>
        <radialGradient id="fade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="white" stop-opacity="1"/>
          <stop offset="60%" stop-color="white" stop-opacity="0.95"/>
          <stop offset="85%" stop-color="white" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="225" cy="225" r="225" fill="url(#fade)" />
    </svg>
  `);

  // Step 3: Define Gen 2 specifications
  const gen2Specs = [
    {
      name: 'aleksey_morozov',
      parent: 'fedor_morozov',
      crop: { left: 300, top: 150, width: 420, height: 420 },
      flip: true,
      modulate: { brightness: 1.05, saturation: 1.1, hue: 15 }, // Shift hue for unique look
      placement: { top: 220, left: 287 }, // Centered face placement
      bgSvg: `
        <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0b132b" />
              <stop offset="100%" stop-color="#1c2541" />
            </linearGradient>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#3a506b" stroke-width="1" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width="1024" height="1024" fill="url(#bg)" />
          <rect width="1024" height="1024" fill="url(#grid)" />
          
          <!-- Radio Physics Schematics -->
          <path d="M 50 400 Q 250 150 450 400 T 850 400" fill="none" stroke="#5bc0be" stroke-width="3" opacity="0.4"/>
          <path d="M 50 450 Q 250 250 450 450 T 850 450" fill="none" stroke="#6fffe9" stroke-width="1" opacity="0.2"/>
          <circle cx="250" cy="275" r="8" fill="#6fffe9" opacity="0.6"/>
          <circle cx="650" cy="525" r="8" fill="#5bc0be" opacity="0.6"/>
          <line x1="250" y1="275" x2="250" y2="400" stroke="#6fffe9" stroke-dasharray="5,5" opacity="0.5" />
          <line x1="650" y1="400" x2="650" y2="525" stroke="#5bc0be" stroke-dasharray="5,5" opacity="0.5" />
          
          <!-- Text and Frames -->
          <text x="512" y="80" fill="#6fffe9" font-family="'Courier New', Courier, monospace" font-size="32" font-weight="bold" text-anchor="middle" letter-spacing="4">НИИ РАДИОФИЗИКИ АН СССР</text>
          <text x="512" y="120" fill="#a5ffd6" font-family="'Courier New', Courier, monospace" font-size="20" text-anchor="middle" opacity="0.8">ЛАБОРАТОРИЯ МИКРОЭЛЕКТРОНИКИ</text>
          
          <!-- Card Info Label -->
          <rect x="262" y="850" width="500" height="110" rx="10" fill="#1c2541" stroke="#5bc0be" stroke-width="2" />
          <text x="512" y="890" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">Морозов Алексей Федорович</text>
          <text x="512" y="920" fill="#a5ffd6" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">Радиофизик • 1938–2012 гг.</text>
          <text x="512" y="945" fill="#5bc0be" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" opacity="0.7">Личное дело № М-742/90</text>
        </svg>
      `,
      fgSvg: null
    },
    {
      name: 'tatiana_morozova',
      parent: 'olga_morozova',
      crop: { left: 300, top: 150, width: 420, height: 420 },
      flip: true,
      modulate: { brightness: 1.02, saturation: 1.15, hue: -10 },
      placement: { top: 220, left: 287 },
      bgSvg: `
        <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#2b1108" />
              <stop offset="50%" stop-color="#4d2212" />
              <stop offset="100%" stop-color="#1f0a04" />
            </linearGradient>
          </defs>
          <rect width="1024" height="1024" fill="url(#bg)" />
          
          <!-- Music Elements -->
          <path d="M-100 350 C300 150, 700 550, 1124 350 L1124 450 C700 650, 300 250, -100 450 Z" fill="#bfa15f" opacity="0.15"/>
          <path d="M-100 370 C300 170, 700 570, 1124 370" fill="none" stroke="#bfa15f" stroke-width="2" opacity="0.3"/>
          <path d="M-100 390 C300 190, 700 590, 1124 390" fill="none" stroke="#bfa15f" stroke-width="2" opacity="0.3"/>
          <path d="M-100 410 C300 210, 700 610, 1124 410" fill="none" stroke="#bfa15f" stroke-width="2" opacity="0.3"/>
          
          <!-- Piano Keys at Bottom -->
          <rect x="0" y="700" width="1024" height="100" fill="#fcfaf2" stroke="#222" stroke-width="2"/>
          <!-- Piano Key Lines -->
          ${Array.from({length: 24}, (_, i) => `<line x1="${(i+1)*42.6}" y1="700" x2="${(i+1)*42.6}" y2="800" stroke="#333" stroke-width="2"/>`).join('')}
          <!-- Black Keys -->
          ${[0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22].map(idx => `<rect x="${(idx+1)*42.6 - 12}" y="700" width="24" height="60" fill="#111" />`).join('')}

          <text x="512" y="80" fill="#e5c158" font-family="'Times New Roman', Georgia, serif" font-size="34" font-style="italic" font-weight="bold" text-anchor="middle" letter-spacing="2">ГОСУДАРСТВЕННАЯ КОНСЕРВАТОРИЯ</text>
          <text x="512" y="120" fill="#d4af37" font-family="'Times New Roman', Georgia, serif" font-size="22" text-anchor="middle" opacity="0.8">КАФЕДРА ИСТОРИИ МУЗЫКИ</text>
          
          <!-- Card Info Label -->
          <rect x="262" y="840" width="500" height="110" rx="10" fill="#2b1108" stroke="#d4af37" stroke-width="2" />
          <text x="512" y="880" fill="#ffffff" font-family="Georgia, serif" font-size="26" font-weight="bold" text-anchor="middle">Морозова Татьяна Михайловна</text>
          <text x="512" y="910" fill="#d4af37" font-family="Georgia, serif" font-size="18" text-anchor="middle">Музыковед • 1942–2018 гг.</text>
          <text x="512" y="935" fill="#bfa15f" font-family="Georgia, serif" font-size="14" text-anchor="middle" opacity="0.7">Личный архив М-942</text>
        </svg>
      `,
      fgSvg: null
    },
    {
      name: 'sofia_morozova',
      parent: 'natalia_sokolova',
      crop: { left: 300, top: 150, width: 420, height: 420 },
      flip: false,
      modulate: { brightness: 1.05, saturation: 1.05, hue: 0 },
      placement: { top: 220, left: 287 },
      bgSvg: `
        <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dotgrid" width="25" height="25" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.5" fill="#4ea8de" opacity="0.3"/>
            </pattern>
          </defs>
          <!-- Blueprint background -->
          <rect width="1024" height="1024" fill="#003566" />
          <rect width="1024" height="1024" fill="url(#dotgrid)" />
          
          <!-- Technical Drawing Details -->
          <circle cx="512" cy="430" r="280" fill="none" stroke="#4ea8de" stroke-width="2" opacity="0.4" stroke-dasharray="10,5"/>
          <circle cx="512" cy="430" r="240" fill="none" stroke="#4ea8de" stroke-width="1" opacity="0.3"/>
          <line x1="150" y1="430" x2="874" y2="430" stroke="#4ea8de" stroke-width="1.5" opacity="0.4"/>
          <line x1="512" y1="100" x2="512" y2="760" stroke="#4ea8de" stroke-width="1.5" opacity="0.4"/>
          
          <!-- Gear Outlines -->
          <path d="M 800 200 C 850 200, 850 300, 900 300" fill="none" stroke="#4ea8de" stroke-width="2" opacity="0.4"/>
          <circle cx="850" cy="250" r="40" fill="none" stroke="#4ea8de" stroke-width="2" opacity="0.4"/>
          <circle cx="850" cy="250" r="15" fill="none" stroke="#4ea8de" stroke-width="2" opacity="0.4"/>

          <!-- Text and Frames -->
          <text x="512" y="80" fill="#ffffff" font-family="'Courier New', Courier, monospace" font-size="32" font-weight="bold" text-anchor="middle" letter-spacing="3">МИНСКИЙ ТРАКТОРНЫЙ ЗАВОД</text>
          <text x="512" y="120" fill="#4ea8de" font-family="'Courier New', Courier, monospace" font-size="20" text-anchor="middle">ОТДЕЛ ГЛАВНОГО КОНСТРУКТОРА</text>
          
          <!-- Card Info Label -->
          <rect x="262" y="840" width="500" height="110" rx="8" fill="#001d3d" stroke="#4ea8de" stroke-width="2" />
          <text x="512" y="880" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">Морозова Софья Федоровна</text>
          <text x="512" y="910" fill="#4ea8de" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">Инженер-конструктор • 1940–2015 гг.</text>
          <text x="512" y="935" fill="#ffffff" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" opacity="0.6">МТЗ им. В.И. Ленина • Заводской архив</text>
        </svg>
      `,
      fgSvg: null
    },
    {
      name: 'nikolay_volkov_jr',
      parent: 'nikolay_volkov_sr',
      crop: { left: 300, top: 150, width: 420, height: 420 },
      flip: true,
      modulate: { brightness: 1.03, saturation: 1.15, hue: -5 },
      placement: { top: 220, left: 287 },
      bgSvg: `
        <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sunset" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#141a29" />
              <stop offset="60%" stop-color="#2a3342" />
              <stop offset="100%" stop-color="#402820" />
            </linearGradient>
          </defs>
          <rect width="1024" height="1024" fill="url(#sunset)" />
          
          <!-- Road Perspective Lines -->
          <polygon points="512,350 514,350 550,750 474,750" fill="#2d3748" opacity="0.8"/>
          <line x1="512" y1="350" x2="512" y2="750" stroke="#f6ad55" stroke-width="4" stroke-dasharray="20,15" opacity="0.8" />
          <line x1="512" y1="350" x2="200" y2="750" stroke="#a0aec0" stroke-width="2" opacity="0.5" />
          <line x1="512" y1="350" x2="824" y2="750" stroke="#a0aec0" stroke-width="2" opacity="0.5" />

          <!-- Warning Striped Border -->
          <g opacity="0.25">
            <line x1="0" y1="650" x2="1024" y2="650" stroke="#f6ad55" stroke-width="20" stroke-dasharray="40,20"/>
          </g>

          <text x="512" y="80" fill="#f6ad55" font-family="Arial, sans-serif" font-size="34" font-weight="black" text-anchor="middle" letter-spacing="2">МИНТРАНССТРОЙ СССР</text>
          <text x="512" y="120" fill="#e2e8f0" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" opacity="0.8">УПРАВЛЕНИЕ СТРОИТЕЛЬСТВА АВТОДОРОГ</text>
          
          <!-- Card Info Label -->
          <rect x="262" y="840" width="500" height="110" rx="8" fill="#1a202c" stroke="#f6ad55" stroke-width="2" />
          <text x="512" y="880" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">Волков Николай Николаевич мл.</text>
          <text x="512" y="910" fill="#f6ad55" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">Инженер-дорожник • 1941–2010 гг.</text>
          <text x="512" y="935" fill="#a0aec0" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" opacity="0.7">Участок автодороги М-1 • Минск</text>
        </svg>
      `,
      fgSvg: null
    },
    {
      name: 'valentina_volkova',
      parent: 'klavdia_volkova',
      crop: { left: 300, top: 150, width: 420, height: 420 },
      flip: false,
      modulate: { brightness: 1.05, saturation: 1.1, hue: 10 },
      placement: { top: 220, left: 287 },
      bgSvg: `
        <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="chalkboard" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#143624" />
              <stop offset="100%" stop-color="#2d5a27" />
            </linearGradient>
          </defs>
          <rect width="1024" height="1024" fill="url(#chalkboard)" />
          
          <!-- Chalk drawings -->
          <text x="150" y="250" fill="#ffffff" font-family="'Courier New', Courier, monospace" font-size="80" font-weight="bold" opacity="0.15" transform="rotate(-10, 150, 250)">А Б В Г</text>
          <text x="820" y="250" fill="#ffffff" font-family="'Courier New', Courier, monospace" font-size="80" font-weight="bold" opacity="0.15" transform="rotate(15, 820, 250)">1 2 3 4</text>
          
          <!-- A math formula -->
          <text x="150" y="550" fill="#ffffff" font-family="sans-serif" font-size="45" opacity="0.12" transform="rotate(5, 150, 550)">2 + 2 = 4</text>
          <text x="800" y="550" fill="#ffffff" font-family="sans-serif" font-size="45" opacity="0.12" transform="rotate(-5, 800, 550)">Мама мыла раму</text>
          
          <!-- Blackboard wood frame outline -->
          <rect x="20" y="20" width="984" height="780" fill="none" stroke="#684a23" stroke-width="24" opacity="0.8" rx="10"/>
          <rect x="30" y="30" width="964" height="760" fill="none" stroke="#f0e6d2" stroke-width="2" opacity="0.2" rx="6"/>

          <text x="512" y="90" fill="#f0e6d2" font-family="'Courier New', Courier, monospace" font-size="34" font-weight="bold" text-anchor="middle">НАРОДНОЕ ОБРАЗОВАНИЕ БССР</text>
          <text x="512" y="130" fill="#a3b899" font-family="sans-serif" font-size="20" text-anchor="middle" opacity="0.9">УЧИТЕЛЬ НАЧАЛЬНЫХ КЛАССОВ</text>
          
          <!-- Card Info Label -->
          <rect x="262" y="840" width="500" height="110" rx="8" fill="#143624" stroke="#a3b899" stroke-width="2" />
          <text x="512" y="880" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">Волкова Валентина Петровна</text>
          <text x="512" y="910" fill="#a3b899" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">Педагог • 1946–2018 гг.</text>
          <text x="512" y="935" fill="#f0e6d2" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" opacity="0.7">Средняя общеобразовательная школа</text>
        </svg>
      `,
      fgSvg: null
    },
    {
      name: 'vladimir_sokolov',
      parent: 'mikhail_sokolov',
      crop: { left: 300, top: 220, width: 400, height: 400 }, // Crop lower down to avoid army hat
      flip: false,
      modulate: { brightness: 1.05, saturation: 1.05, hue: 5 },
      placement: { top: 220, left: 287 },
      bgSvg: `
        <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="metallic" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1e2022" />
              <stop offset="100%" stop-color="#3b3e40" />
            </linearGradient>
            <pattern id="steel" width="10" height="10" patternUnits="userSpaceOnUse">
              <line x1="0" y1="10" x2="10" y2="0" stroke="#2b2d2f" stroke-width="1.5" opacity="0.4"/>
            </pattern>
          </defs>
          <rect width="1024" height="1024" fill="url(#metallic)" />
          <rect width="1024" height="1024" fill="url(#steel)" />
          
          <!-- Industrial MAZ Truck Graphic Details -->
          <circle cx="512" cy="430" r="260" fill="none" stroke="#686d76" stroke-width="4" opacity="0.3"/>
          <path d="M 280 430 L 744 430 M 512 200 L 512 660" stroke="#686d76" stroke-width="2" opacity="0.2"/>
          
          <!-- MAZ stylized grill bars -->
          <g stroke="#686d76" stroke-width="3" opacity="0.25">
            <line x1="300" y1="620" x2="724" y2="620" />
            <line x1="300" y1="640" x2="724" y2="640" />
            <line x1="300" y1="660" x2="724" y2="660" />
          </g>

          <text x="512" y="80" fill="#e8e8e8" font-family="'Courier New', Courier, monospace" font-size="32" font-weight="black" text-anchor="middle" letter-spacing="4">МИНСКИЙ АВТОМОБИЛЬНЫЙ ЗАВОД</text>
          <text x="512" y="120" fill="#9ba4b5" font-family="'Courier New', Courier, monospace" font-size="20" text-anchor="middle">ИНЖЕНЕРНО-КОНСТРУКТОРСКИЙ ОТДЕЛ</text>
          
          <!-- Card Info Label -->
          <rect x="262" y="840" width="500" height="110" rx="8" fill="#1e2022" stroke="#9ba4b5" stroke-width="2" />
          <text x="512" y="880" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">Соколов Владимир Михайлович</text>
          <text x="512" y="910" fill="#9ba4b5" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">Инженер-технолог МАЗ • 1945–2015 гг.</text>
          <text x="512" y="935" fill="#ffffff" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" opacity="0.5">Личное дело № МАЗ-5511</text>
        </svg>
      `,
      fgSvg: null
    },
    {
      name: 'irina_sokolova',
      parent: 'natalia_sokolova',
      crop: { left: 300, top: 150, width: 420, height: 420 },
      flip: true,
      modulate: { brightness: 1.05, saturation: 1.05, hue: -5 },
      placement: { top: 220, left: 287 },
      bgSvg: `
        <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="clinicBg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#eaf4f4" />
              <stop offset="100%" stop-color="#c7f9cc" />
            </linearGradient>
          </defs>
          <rect width="1024" height="1024" fill="url(#clinicBg)" />
          
          <!-- Medical symbols -->
          <path d="M 512 430 L 512 430" />
          <!-- Heartbeat ECG line -->
          <path d="M 50 480 L 300 480 L 330 430 L 360 530 L 390 470 L 420 490 L 450 480 L 974 480" fill="none" stroke="#80ed99" stroke-width="4" opacity="0.5" />
          
          <!-- Red cross silhouette in bg -->
          <g fill="#57cc99" opacity="0.08">
            <rect x="442" y="330" width="140" height="200" rx="10"/>
            <rect x="412" y="360" width="200" height="140" rx="10"/>
          </g>

          <text x="512" y="80" fill="#38a3a5" font-family="Arial, sans-serif" font-size="32" font-weight="bold" text-anchor="middle" letter-spacing="2">МИНИСТЕРСТВО ЗДРАВООХРАНЕНИЯ БССР</text>
          <text x="512" y="120" fill="#22577a" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" opacity="0.8">1-Я ГОРОДСКАЯ КЛИНИЧЕСКАЯ БОЛЬНИЦА</text>
          
          <!-- Card Info Label -->
          <rect x="262" y="840" width="500" height="110" rx="8" fill="#22577a" stroke="#38a3a5" stroke-width="2" />
          <text x="512" y="880" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">Соколова Ирина Васильевна</text>
          <text x="512" y="910" fill="#c7f9cc" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">Врач-терапевт • 1948–2020 гг.</text>
          <text x="512" y="935" fill="#80ed99" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" opacity="0.8">Медицинский архив • Раздел Т-12</text>
        </svg>
      `,
      fgSvg: `
        <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
          <!-- White doctor coat silhouette overlay over the bottom of the face -->
          <path d="M 287 640 L 737 640 L 700 800 L 324 800 Z" fill="none" />
          <!-- We can draw the coat collar -->
          <path d="M 380 580 L 512 660 L 644 580 L 670 750 L 350 750 Z" fill="#ffffff" stroke="#cbd5e0" stroke-width="2" />
          <path d="M 512 660 L 512 750" stroke="#cbd5e0" stroke-width="2" />
          <!-- Red cross badge -->
          <rect x="390" y="660" width="20" height="20" fill="#ffffff" stroke="#e53e3e" stroke-width="1"/>
          <path d="M 400 663 L 400 677 M 393 670 L 407 670" stroke="#e53e3e" stroke-width="3"/>
          
          <!-- Stethoscope around neck -->
          <path d="M 430 520 C 430 640, 594 640, 594 520" fill="none" stroke="#4a5568" stroke-width="6" opacity="0.8" />
          <path d="M 512 610 L 512 650" fill="none" stroke="#4a5568" stroke-width="5" opacity="0.8" />
          <circle cx="512" cy="655" r="14" fill="#a0aec0" stroke="#4a5568" stroke-width="2" />
        </svg>
      `
    }
  ];

  // Step 4: Render Gen 2 portraits
  for (const spec of gen2Specs) {
    console.log(`Generating Gen 2: ${spec.name}...`);
    const parentPath = gen1Paths[spec.parent];
    if (!parentPath) {
      throw new Error(`Parent path not found for: ${spec.parent}`);
    }

    // A. Crop, process, and mask face
    const cropOptions = spec.crop;
    let facePipeline = sharp(parentPath)
      .extract(cropOptions)
      .resize(450, 450);

    if (spec.flip) {
      facePipeline = facePipeline.flop();
    }

    if (spec.modulate) {
      facePipeline = facePipeline.modulate(spec.modulate);
    }

    // Mask with radial alpha gradient
    const maskedFace = await facePipeline
      .composite([{ input: radialMask, blend: 'dest-in' }])
      .toBuffer();

    // B. Build background and base composite
    const bgBuffer = Buffer.from(spec.bgSvg);
    let outputPipeline = sharp(bgBuffer)
      .composite([
        { input: maskedFace, top: spec.placement.top, left: spec.placement.left }
      ]);

    // C. Add foreground overlay if present
    if (spec.fgSvg) {
      const fgBuffer = Buffer.from(spec.fgSvg);
      // Re-composite
      const tempBuffer = await outputPipeline.toBuffer();
      outputPipeline = sharp(tempBuffer).composite([{ input: fgBuffer }]);
    }

    // D. Final output destination
    const outPath = path.join(artDir, `${spec.name}.png`);
    await outputPipeline.toFile(outPath);
    console.log(`Generated Gen 2 portrait: ${outPath}`);
  }

  console.log('All portraits generated successfully!');
}

main().catch(err => {
  console.error('Error during generation:', err);
  process.exit(1);
});
