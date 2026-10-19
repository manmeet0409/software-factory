import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'http://localhost:44551';
const db = new Database('data/factory.db');

async function main() {
  console.log('--- 1. Setting up Wall Pins for Orchestrator vs User ---');
  const now = Math.floor(Date.now() / 1000);
  const orchPinId = uuidv4();
  const userPinId = uuidv4();

  // 1. Create Orchestrator pin
  db.prepare(`
    INSERT INTO wallPins (id, title, description, category, module, tags, createdBy, createdAt, archived)
    VALUES (?, 'Orchestrator Architecture Rule', 'Rule created during chat turn', 'fact', 'core', '["test"]', 'orchestrator', ?, 0)
  `).run(orchPinId, now);

  // 2. Create User pin
  db.prepare(`
    INSERT INTO wallPins (id, title, description, category, module, tags, createdBy, createdAt, archived)
    VALUES (?, 'Human Protected Fact', 'Important fact pinned by human developer', 'lesson', 'core', '["human"]', 'user', ?, 0)
  `).run(userPinId, now);

  // 3. Create simulated chat message turn containing the orchestrator pin
  const userMsgId = uuidv4();
  const orchMsgId = uuidv4();

  db.prepare(`
    INSERT INTO chatMessages (id, sender, text, timestamp, ticketCreated, promptMsgId, sessionId, pairMessageId, wallPinIds)
    VALUES (?, 'user', 'Remember to use Turbopack for builds', ?, 0, 'mock_prompt', 'mock_sess', ?, ?)
  `).run(userMsgId, now, orchMsgId, JSON.stringify([orchPinId]));

  db.prepare(`
    INSERT INTO chatMessages (id, sender, text, timestamp, ticketCreated, promptMsgId, sessionId, pairMessageId, wallPinIds)
    VALUES (?, 'orchestrator', 'Pinned rule to The Wall: Orchestrator Architecture Rule', ?, 0, 'mock_prompt', 'mock_sess', ?, ?)
  `).run(orchMsgId, now, userMsgId, JSON.stringify([orchPinId]));

  console.log('Created test pins:');
  console.log('- Orchestrator pin ID:', orchPinId);
  console.log('- User pin ID:', userPinId);

  // 4. Test Revert via API
  console.log('\n--- 2. Executing Revert via POST /api/chat/revert ---');
  const revertRes = await fetch(`${BASE_URL}/api/chat/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userMessageId: userMsgId,
      orchestratorMessageId: orchMsgId,
      wallPinIds: [orchPinId, userPinId], // Send both IDs to verify safety filter
    }),
  });

  const revertData = await revertRes.json();
  console.log('Revert response status:', revertRes.status);
  console.log('Revert response payload:', revertData);

  if (!revertRes.ok || !revertData.success) {
    throw new Error(`Revert failed: ${JSON.stringify(revertData)}`);
  }

  // 5. Verify database state
  console.log('\n--- 3. Verifying Database Safety & Integrity ---');
  const orchPinCheck = db.prepare('SELECT id FROM wallPins WHERE id = ?').get(orchPinId);
  const userPinCheck = db.prepare('SELECT id FROM wallPins WHERE id = ?').get(userPinId);
  const userMsgCheck = db.prepare('SELECT id FROM chatMessages WHERE id = ?').get(userMsgId);

  console.log('Orchestrator pin exists after undo?:', !!orchPinCheck);
  console.log('User pin exists after undo?:', !!userPinCheck);
  console.log('Chat message exists after undo?:', !!userMsgCheck);

  if (orchPinCheck) {
    throw new Error('FAILED: Orchestrator pin was NOT removed on undo!');
  }

  if (!userPinCheck) {
    throw new Error('FAILED: User pin was accidentally removed! Target should ONLY be orchestrator pins.');
  }

  if (userMsgCheck) {
    throw new Error('FAILED: Chat message turn was not purged on undo!');
  }

  // Cleanup the user pin
  db.prepare('DELETE FROM wallPins WHERE id = ?').run(userPinId);

  console.log('\n✅ All Wall undo safety and target restrictions PASSED perfectly!');
}

main().catch((err) => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
