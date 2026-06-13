const prisma = require('./lib/prisma');

async function main() {
  const users = await prisma.user.findMany({
    include: {
      ownedProfiles: {
        select: {
          id: true,
          fullName: true,
          familyNodeId: true
        }
      }
    }
  });
  console.log('Users detail:', JSON.stringify(users, null, 2));

  const trees = await prisma.familyTree.findMany({
    select: {
      id: true,
      name: true,
      ownerId: true,
      visibility: true
    }
  });
  console.log('Trees detail:', JSON.stringify(trees, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
