'use strict';
const prisma = require('./lib/prisma');

(async () => {
    console.log('═══ Backfill SPOUSE mirrors ═══');

    const allSpouse = await prisma.familyConnection.findMany({
        where: { type: 'SPOUSE' },
        select: { id: true, fromNodeId: true, toNodeId: true, startDate: true, endDate: true, notes: true },
    });
    console.log('Найдено SPOUSE-связей:', allSpouse.length);

    const existing = new Set(allSpouse.map(c => `${c.fromNodeId}::${c.toNodeId}`));
    const needMirror = allSpouse.filter(c => !existing.has(`${c.toNodeId}::${c.fromNodeId}`));
    console.log('Без зеркала:', needMirror.length);

    let created = 0;
    for (const c of needMirror) {
        try {
            await prisma.familyConnection.create({
                data: {
                    fromNodeId: c.toNodeId,
                    toNodeId: c.fromNodeId,
                    type: 'SPOUSE',
                    startDate: c.startDate,
                    endDate: c.endDate,
                    notes: c.notes,
                },
            });
            created++;
        } catch (err) {
            if (err.code === 'P2002') {
                // уже есть — race condition, пропускаем
            } else {
                console.error('Ошибка при создании зеркала для', c.id, ':', err.message);
            }
        }
    }

    console.log(`✅ Создано зеркал: ${created} из ${needMirror.length}`);

    const total = await prisma.familyConnection.count({ where: { type: 'SPOUSE' } });
    console.log('Всего SPOUSE-связей теперь:', total);

    const all = await prisma.familyConnection.findMany({
        where: { type: 'SPOUSE' },
        select: { fromNodeId: true, toNodeId: true },
    });
    const set = new Set(all.map(c => `${c.fromNodeId}::${c.toNodeId}`));
    const asymmetric = all.filter(c => !set.has(`${c.toNodeId}::${c.fromNodeId}`));
    if (asymmetric.length === 0) {
        console.log('✅ Все SPOUSE-связи симметричны');
    } else {
        console.error('❌ Остались асимметричные:', asymmetric.length);
        console.error('Примеры:', asymmetric.slice(0, 3));
    }

    await prisma.$disconnect();
})().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
