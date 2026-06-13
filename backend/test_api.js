const familyService = require('./services/familyService');

async function main() {
  const treeId = 'cmpx2xehh0000pa313hbd9znu';
  
  // Test with no actor (anonymous)
  console.log('Testing listClans anonymous:');
  try {
    const clans = await familyService.listClans(treeId, null);
    console.log(`Success! Found ${clans.length} clans.`);
  } catch (err) {
    console.error('Failed:', err.status, err.message);
  }

  // Test with some actor (non-owner)
  console.log('\nTesting listClans logged in (non-owner):');
  try {
    const clans = await familyService.listClans(treeId, { id: 'some-other-user-id', role: 'USER' });
    console.log(`Success! Found ${clans.length} clans.`);
  } catch (err) {
    console.error('Failed:', err.status, err.message);
  }

  // Test getTree
  console.log('\nTesting getTree anonymous:');
  try {
    const tree = await familyService.getTree(treeId, null);
    console.log(`Success! Nodes: ${tree.nodes.length}, Clans: ${tree.clans.length}, Connections: ${tree.connections.length}`);
  } catch (err) {
    console.error('Failed:', err.status, err.message);
  }
}

main().catch(console.error);
