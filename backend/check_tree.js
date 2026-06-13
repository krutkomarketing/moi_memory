const prisma = require('./lib/prisma');

async function main() {
  const treeId = 'cmpx2xehh0000pa313hbd9znu';
  console.log('Checking tree:', treeId);
  const tree = await prisma.familyTree.findUnique({
    where: { id: treeId },
    include: {
      _count: { select: { nodes: true, clans: true } }
    }
  });
  console.log('Tree details:', JSON.stringify(tree, null, 2));
}

main().catch(err => {
  console.error(err);
}).finally(async () => {
  await prisma.$disconnect();
});
