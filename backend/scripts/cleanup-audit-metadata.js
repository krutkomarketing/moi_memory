'use strict';

const prisma = require('../lib/prisma');

function stripMarkdownLinks(s) {
  if (typeof s !== 'string') return s;
  s = s.replace(/\[([^\]]+)\]\(mailto:[^\)]+\)/gi, '$1');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi, '$2');
  return s;
}

function normalizeKey(k) {
  if (typeof k !== 'string') return k;
  if (k.startsWith('[')) return k.slice(1);
  return k;
}

function normalizeJsonValue(v) {
  // 1) строка: пытаемся либо распарсить JSON, либо хотя бы почистить markdown
  if (typeof v === 'string') {
    const cleaned = stripMarkdownLinks(v);
    // если это похоже на JSON-строку — пробуем распарсить
    if (cleaned.trim().startsWith('{') || cleaned.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(cleaned);
        return normalizeJsonValue(parsed);
      } catch {
        return cleaned;
      }
    }
    return cleaned;
  }

  // 2) массив
  if (Array.isArray(v)) return v.map(normalizeJsonValue);

  // 3) объект
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, vv] of Object.entries(v)) {
      out[normalizeKey(k)] = normalizeJsonValue(vv);
    }
    return out;
  }

  // 4) остальное
  return v;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseArgs(argv) {
  const out = { apply: false, limit: 5000 };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.split('=')[1], 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('[cleanup:audit] mode:', args.apply ? 'APPLY' : 'DRY-RUN');

  const rows = await prisma.auditLog.findMany({
    take: Math.min(20000, args.limit),
    orderBy: { createdAt: 'desc' },
    select: { id: true, metadata: true, createdAt: true },
  });

  let scanned = 0;
  let candidates = 0;
  let updated = 0;

  for (const r of rows) {
    scanned += 1;
    if (r.metadata == null) continue;

    const normalized = normalizeJsonValue(r.metadata);
    if (deepEqual(normalized, r.metadata)) continue;

    candidates += 1;

    if (args.apply) {
      await prisma.auditLog.update({
        where: { id: r.id },
        data: { metadata: normalized },
      });
      updated += 1;
    }
  }

  console.log('[cleanup:audit] scanned:', scanned);
  console.log('[cleanup:audit] candidates needing normalization:', candidates);
  console.log('[cleanup:audit] updated:', updated);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('[cleanup:audit] fatal:', e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
