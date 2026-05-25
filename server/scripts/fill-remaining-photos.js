// server/scripts/fill-remaining-photos.js
// Дозаполняет Profile.coverPhotoId и FamilyNode.photoId рандомными файлами из uploads/.
// Запуск: cd ~/projects/site/server && node scripts/fill-remaining-photos.js

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

async function ensureMedia(filename, ownerId) {
  const url = `/uploads/${filename}`;
  const existing = await prisma.media.findFirst({ where: { url } });
  if (existing) return { media: existing, created: false };

  const filePath = path.join(UPLOADS_DIR, filename);
  const stat = fs.statSync(filePath);
  let width=null, height=null, mimeType='application/octet-stream';
  try {
    const m = await sharp(filePath).metadata();
    width = m.width||null; height = m.height||null; mimeType = mimeFromFormat(m.format);
  } catch {}
  const media = await prisma.media.create({
    data: { kind:'IMAGE', url, originalName:filename, mimeType, sizeBytes:stat.size, width, height, uploadedById: ownerId||null },
  });
  return { media, created: true };
}

async function main() {
  const allFiles = fs.readdirSync(UPLOADS_DIR).filter(f => EXTENSIONS.includes(path.extname(f).toLowerCase()));
  // какие файлы УЖЕ заняты (есть Media с этим url)
  const usedMedias = await prisma.media.findMany({ select: { url: true } });
  const usedFilenames = new Set(usedMedias.map(m => path.basename(m.url)));
  const free = allFiles.filter(f => !usedFilenames.has(f));

  console.log(`[info] всего файлов в uploads/: ${allFiles.length}`);
  console.log(`[info] уже привязано к Media:   ${usedMedias.length}`);
  console.log(`[info] свободных файлов:        ${free.length}`);

  // shuffle
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  let pool = [...free];
  const takeOne = () => {
    if (pool.length === 0) pool = [...free]; // переиспользуем если кончатся
    return pool.shift();
  };

  // ── PROFILES без coverPhotoId ──
  const profiles = await prisma.profile.findMany({
    where: { coverPhotoId: null },
    select: { id:true, slug:true, fullName:true, ownerId:true },
  });
  console.log(`\n[info] Profile без cover: ${profiles.length}`);

  let pSet = 0;
  for (const p of profiles) {
    const fname = takeOne();
    if (!fname) break;
    const { media } = await ensureMedia(fname, p.ownerId);
    await prisma.profile.update({ where: { id: p.id }, data: { coverPhotoId: media.id } });
    pSet++;
    console.log(`[ok] ${p.slug} → ${fname}`);
  }

  // ── FamilyNode без photoId ──
  const nodes = await prisma.familyNode.findMany({
    where: { photoId: null },
    select: { id:true, firstName:true, lastName:true, profile:{ select:{ coverPhotoId:true } } },
  });
  console.log(`\n[info] FamilyNode без photoId: ${nodes.length}`);

  let nFromProfile = 0, nRandom = 0;
  for (const n of nodes) {
    // если есть связанный Profile с фото — берём оттуда
    if (n.profile?.coverPhotoId) {
      await prisma.familyNode.update({ where: { id: n.id }, data: { photoId: n.profile.coverPhotoId } });
      nFromProfile++;
      continue;
    }
    const fname = takeOne();
    if (!fname) break;
    const { media } = await ensureMedia(fname, null);
    await prisma.familyNode.update({ where: { id: n.id }, data: { photoId: media.id } });
    nRandom++;
  }

  await prisma.$disconnect();

  console.log('\n=== ИТОГ ===');
  console.log(`Profile.coverPhotoId выставлено:       ${pSet}`);
  console.log(`FamilyNode.photoId (от Profile):       ${nFromProfile}`);
  console.log(`FamilyNode.photoId (рандомный файл):   ${nRandom}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });