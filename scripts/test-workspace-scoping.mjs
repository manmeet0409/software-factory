import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve('data/factory.db');
const BASE_URL = 'http://localhost:44551';

async function run() {
  console.log('--- Step 1: Check Active Workspace ---');
  const wsRes = await fetch(`${BASE_URL}/api/workspace`);
  const wsData = await wsRes.json();
  console.log('Active workspace directory:', wsData.workspace?.directory);

  if (!wsData.workspace?.directory.toLowerCase().includes('test')) {
    console.log('Setting target directory to D:\\Projects\\test...');
    await fetch(`${BASE_URL}/api/workspace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: 'D:\\Projects\\test' }),
    });
  }

  console.log('\n--- Step 2: Clear previous sessions to start fresh ---');
  await fetch(`${BASE_URL}/api/sessions?clearAll=true`, { method: 'DELETE' });

  console.log('\n--- Step 3: Send chat prompt asking for working directory ---');
  const chatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What is your exact working directory and which project folder are you watching right now?' }),
  });
  const chatData = await chatRes.json();
  console.log('Initial reply received:', chatData.reply?.slice(0, 150));
  console.log('Session ID:', chatData.sessionId);

  let finalReply = chatData.reply || '';
  if (chatData.isPending && chatData.sessionId) {
    console.log('Awaiting final OpenCode response...');
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(`${BASE_URL}/api/chat?checkSession=${encodeURIComponent(chatData.sessionId)}&messageId=${encodeURIComponent(chatData.orchestratorMessage?.id || '')}`);
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        if (pollData.done && pollData.reply) {
          finalReply = pollData.reply;
          break;
        }
      }
    }
  }

  console.log('\n--- Final Orchestrator Response ---');
  console.log(finalReply);

  console.log('\n--- Step 4: Verify Session Location in SQLite ---');
  const db = new Database(DB_PATH);
  const sessionRow = db.prepare('SELECT * FROM agentSessions WHERE id = ?').get(chatData.sessionId);
  db.close();
  console.log('DB Session worktreeDir:', sessionRow?.worktreeDir);

  if (!sessionRow?.worktreeDir?.toLowerCase().includes('test')) {
    throw new Error(`Expected session worktreeDir to be D:\\Projects\\test, but got: ${sessionRow?.worktreeDir}`);
  }

  if (finalReply.toLowerCase().includes('software-factory') && !finalReply.toLowerCase().includes('test')) {
    throw new Error('Scope leaked! Orchestrator reported software-factory instead of target directory test!');
  }

  console.log('\n SUCCESS: Workspace scope verified! OpenCode session was launched in D:\\Projects\\test without leaking software-factory!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
