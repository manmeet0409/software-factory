import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve('data/factory.db');
const BASE_URL = 'http://localhost:44551';

function getSessionCount() {
  const db = new Database(DB_PATH);
  const row = db.prepare('SELECT count(*) as count FROM agentSessions').get();
  db.close();
  return row ? row.count : 0;
}

async function run() {
  console.log('--- Step 1: Clear All Sessions ---');
  const clearRes = await fetch(`${BASE_URL}/api/sessions?clearAll=true`, { method: 'DELETE' });
  const clearData = await clearRes.json();
  console.log('DELETE /api/sessions?clearAll=true response:', clearData);
  
  let count = getSessionCount();
  console.log(`Agent sessions in DB after Clear All: ${count}`);
  if (count !== 0) {
    throw new Error(`Expected 0 sessions, got ${count}`);
  }

  console.log('\n--- Step 2: Trigger "New Chat" without sending a message ---');
  const newChatRes = await fetch(`${BASE_URL}/api/chat`, { method: 'DELETE' });
  const newChatData = await newChatRes.json();
  console.log('DELETE /api/chat response:', newChatData);

  count = getSessionCount();
  console.log(`Agent sessions in DB after New Chat (lazy expectation = 0): ${count}`);
  if (count !== 0) {
    throw new Error(`Expected 0 sessions after New Chat, got ${count}`);
  }

  console.log('\n--- Step 3: Send first message ("Ping lazy session") ---');
  const chatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Ping lazy session' }),
  });
  const chatData = await chatRes.json();
  console.log('POST /api/chat response received, sessionId:', chatData.sessionId);

  count = getSessionCount();
  console.log(`Agent sessions in DB after first prompt (expected >= 1): ${count}`);
  if (count === 0) {
    throw new Error(`Expected at least 1 session after first message, got 0`);
  }

  console.log('\n--- Step 4: Click New Chat again, verify active session retired and not duplicated ---');
  await fetch(`${BASE_URL}/api/chat`, { method: 'DELETE' });
  const countAfterSecondNewChat = getSessionCount();
  console.log(`Agent sessions in DB after second New Chat: ${countAfterSecondNewChat}`);
  if (countAfterSecondNewChat !== count) {
    throw new Error(`Session count changed unexpectedly on New Chat! Expected ${count}, got ${countAfterSecondNewChat}`);
  }

  console.log('\n--- Step 5: Test Clear All Sessions again ---');
  await fetch(`${BASE_URL}/api/sessions?clearAll=true`, { method: 'DELETE' });
  count = getSessionCount();
  console.log(`Agent sessions in DB after final Clear All: ${count}`);
  if (count !== 0) {
    throw new Error(`Expected 0 sessions after final Clear All, got ${count}`);
  }

  console.log('\n SUCCESS: All lazy session creation and clear-all assertions passed!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
