// server/scripts/link-cover-photos.js
// v3: все варианты имени файла + диагностика свободных файлов

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const prisma = require('../lib/prisma');

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
const EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png'];

function mimeFromFormat(fmt) {
  return ({ jpeg:'image/jpeg', jpg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', avif:'image/avif' })
    [(fmt||'').toLowerCase()] || 'application/octet-stream';
}

// генерим кандидаты имени файла для slug "morozov-vasily" + fullName "Морозов Василий Петрович"
function candidatesForSlug(slug) {
  if (!slug) return [];
  const parts = slug.split('-').filter(Boolean);
  const variants = new Set();

  // как есть
  variants.add(slug);
  variants.add(slug.replace(/-/g, '_'));
  variants.add(slug.replace(/-/g, ''));

  // обратный порядок (firstname-lastname → lastname-firstname и наоборот)
  if (parts.length >= 2) {
    const rev = [...parts].reverse().join('-');
    variants.add(rev);
    variants.add(rev.replace(/-/g, '_'));
    variants.add(rev.replace(/-/g, ''));
    // только первое слово (например только lastname)
    variants.add(parts[0]);
    variants.add(parts[parts.length - 1]);
  }
  return [...variants];
}

function findFileForSlug(slug, usedFiles) {
  const variants = candidatesForSlug(slug);
  // exact-match
  for (const base of variants) {
    for (const ext of EXTENSIONS) {
      const fname = base + ext;
      const p = path.join(UPLOADS_DIR, fname);
      if (fs.existsSync(p)) {
        usedFiles.add(fname);
        return p;
      }
    }
  }
  // substring-match — берём любой файл, в имени которого встречается lastname или firstname
  const allFiles = fs.readdirSync(UPLOADS_DIR).filter(f => EXTENSIONS.includes(path.extname(f).toLowerCase()));
  for (const part of variants) {
    if (part.length < 4) continue; // не матчим "и" или "ан"
    const m = allFiles.find(f => f.toLowerCase().includes(part.toLowerCase()) && !usedFiles.has(f));
    if (m) {
      usedFiles.add(m);
      return path.join(UPLOADS_DIR, m);
    }
  }
  return null;
}

async function ensureMediaForFile(filePath, ownerId) {
  const filename = path.basename(filePath);
  const url = `/uploads/${filename}`;
  const existing = await prisma.media.findFirst({ where: { url } });
  if (existing) return { media: existing, created: false };

  const stat = fs.statSync(filePath);
  let width=null, height=null, mimeType='application/octet-stream';
  try {
    const m = await sharp(filePath).metadata();
    width = m.width||null; height = m.height||null; mimeType = mimeFromFormat(m.format);
  } catch(e) { console.log(`[warn] sharp ${filename}: ${e.message}`); }

  const media = await prisma.media.create({
    data: { kind:'IMAGE', url, originalName:filename, mimeType, sizeBytes:stat.size, width, height, uploadedById: ownerId||null },
  });
  return { media, created: true };
}

async function main() {
  if (!fs.existsSync(UPLOADS_DIR)) throw new Error(`uploads/ не найдена: ${UPLOADS_DIR}`);

  const allFilesAtStart = fs.readdirSync(UPLOADS_DIR).filter(f => EXTENSIONS.includes(path.extname(f).toLowerCase()));
  console.log(`[info] всего файлов-картинок в uploads/: ${allFilesAtStart.length}`);

  const usedFiles = new Set();

  // ── PROFILES ──
  const profiles = await prisma.profile.findMany({
    select: { id:true, slug:true, fullName:true, ownerId:true, coverPhotoId:true },
    orderBy: { fullName: 'asc' },
  });
  console.log(`[info] profiles в БД: ${profiles.length}`);

  let pLinked=0, pNoop=0, pNoFile=0, mediaCreated=0;
  const profileToMediaId = new Map();
  const unmatchedProfiles = [];

  for (const p of profiles) {
    if (p.coverPhotoId) {
      profileToMediaId.set(p.id, p.coverPhotoId);
      pNoop++; continue;
    }
    const filePath = findFileForSlug(p.slug, usedFiles);
    if (!filePath) {
      unmatchedProfiles.push(`${p.slug} (${p.fullName})`);
      pNoFile++; continue;
    }
    const { media, created } = await ensureMediaForFile(filePath, p.ownerId);
    if (created) mediaCreated++;
    profileToMediaId.set(p.id, media.id);
    await prisma.profile.update({ where: { id: p.id }, data: { coverPhotoId: media.id } });
    pLinked++;
    console.log(`[ok-profile] ${p.slug} → ${path.basename(filePath)}`);
  }

  // ── FAMILY NODES (из связанного Profile) ──
  const nodes = await prisma.familyNode.findMany({
    where: { photoId: null },
    select: { id:true, firstName:true, lastName:true, profile:{ select:{ id:true, coverPhotoId:true } } },
  });
  let fnLinked=0;
  for (const n of nodes) {
    if (!n.profile) continue;
    const mediaId = n.profile.coverPhotoId || profileToMediaId.get(n.profile.id);
    if (!mediaId) continue;
    await prisma.familyNode.update({ where: { id: n.id }, data: { photoId: mediaId } });
    fnLinked++;
  }

  // ── FAMILY NODES (по firstname в имени файла, если без Profile) ──
  const orphanNodes = await prisma.familyNode.findMany({
    where: { photoId: null, profile: null },
    select: { id:true, firstName:true, lastName:true },
  });
  let fnByFile = 0;
  for (const n of orphanNodes) {
    if (!n.firstName) continue;
    // Транслитерация русского → латиница (грубая, для самых частых букв)
    const t = translit((n.firstName + ' ' + (n.lastName||'')).trim().toLowerCase());
    const tParts = t.split(/\s+/).filter(Boolean);
    if (!tParts.length) continue;
    const variants = [
      tParts.join('_'),
      tParts.join('-'),
      [...tParts].reverse().join('_'),
      [...tParts].reverse().join('-'),
      tParts[0],
    ];
    let foundPath = null, foundName = null;
    outer: for (const v of variants) {
      for (const ext of EXTENSIONS) {
        const fname = v + ext;
        const p = path.join(UPLOADS_DIR, fname);
        if (fs.existsSync(p) && !usedFiles.has(fname)) {
          foundPath = p; foundName = fname; break outer;
        }
      }
    }
    if (!foundPath) {
      // substring-match
      const allFiles = fs.readdirSync(UPLOADS_DIR).filter(f => EXTENSIONS.includes(path.extname(f).toLowerCase()));
      const m = allFiles.find(f => !usedFiles.has(f) && variants.some(v => v.length>=4 && f.toLowerCase().includes(v)));
      if (m) { foundPath = path.join(UPLOADS_DIR, m); foundName = m; }
    }
    if (!foundPath) continue;
    usedFiles.add(foundName);
    const { media, created } = await ensureMediaForFile(foundPath, null);
    if (created) mediaCreated++;
    await prisma.familyNode.update({ where: { id: n.id }, data: { photoId: media.id } });
    fnByFile++;
    console.log(`[ok-node] ${n.firstName} ${n.lastName||''} → ${foundName}`);
  }

  await prisma.$disconnect();

  // ── Диагностика ──
  const allFilesNow = fs.readdirSync(UPLOADS_DIR).filter(f => EXTENSIONS.includes(path.extname(f).toLowerCase()));
  const unused = allFilesNow.filter(f => !usedFiles.has(f));

  console.log('\n=== ИТОГ ===');
  console.log(`Media создано:                      ${mediaCreated}`);
  console.log(`Profile.coverPhotoId выставлено:    ${pLinked}`);
  console.log(`Profile уже имели coverPhotoId:     ${pNoop}`);
  console.log(`Profile без файла:                  ${pNoFile}`);
  console.log(`FamilyNode.photoId (через Profile): ${fnLinked}`);
  console.log(`FamilyNode.photoId (по имени файла): ${fnByFile}`);

  if (unmatchedProfiles.length) {
    console.log(`\n=== Profile БЕЗ файла (${unmatchedProfiles.length}) ===`);
    unmatchedProfiles.forEach(s => console.log('  ' + s));
  }
  if (unused.length) {
    console.log(`\n=== Файлы в uploads/ КОТОРЫЕ НИКТО НЕ ВЗЯЛ (${unused.length}) ===`);
    unused.forEach(f => console.log('  ' + f));
  }
}

function translit(s) {
  const map = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',
    к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
    х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  };
  return s.split('').map(c => map[c] !== undefined ? map[c] : c).join('');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });