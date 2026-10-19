import fs from 'fs';

const BASE_URL = 'http://localhost:44551';
const EXTERNAL_CREATE_PATH = 'D:/Projects/test_2/hello_g.md';
const EXTERNAL_EDIT_PATH = 'D:/Projects/test_2/target_to_edit.txt';

// Clean test files
if (fs.existsSync(EXTERNAL_CREATE_PATH)) fs.unlinkSync(EXTERNAL_CREATE_PATH);
fs.writeFileSync(EXTERNAL_EDIT_PATH, 'Original content in test_2', 'utf-8');

async function sendChatAndWait(message) {
  console.log(`\n--- Sending Chat: "${message}" ---`);
  const chatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  const chatData = await chatRes.json();
  let finalReply = chatData.reply || '';

  if (chatData.isPending && chatData.sessionId) {
    console.log('Polling for response from session:', chatData.sessionId);
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(
        `${BASE_URL}/api/chat?checkSession=${encodeURIComponent(chatData.sessionId)}&messageId=${encodeURIComponent(
          chatData.orchestratorMessage?.id || ''
        )}`
      );
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        if (pollData.done && pollData.reply) {
          finalReply = pollData.reply;
          break;
        }
      }
    }
  }

  return finalReply;
}

async function run() {
  console.log('=== Step 1: Ensure workspace is D:\\Projects\\test ===');
  await fetch(`${BASE_URL}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory: 'D:\\Projects\\test' }),
  });

  console.log('Resetting sessions to start clean...');
  await fetch(`${BASE_URL}/api/sessions?clearAll=true`, { method: 'DELETE' });

  console.log('\n=== Step 2: Test External File Creation via Web UI Chat ===');
  const createReply = await sendChatAndWait('Please create a file D:/Projects/test_2/hello_g.md with content Hello from Web UI');
  console.log('Orchestrator Reply:\n', createReply);

  const fileCreated = fs.existsSync(EXTERNAL_CREATE_PATH);
  console.log('\nWas external file created?:', fileCreated);

  console.log('\n=== Step 3: Test External File Edit via Web UI Chat ===');
  const editReply = await sendChatAndWait('Please edit the file D:/Projects/test_2/target_to_edit.txt and replace Original with WebUIHacked');
  console.log('Orchestrator Reply:\n', editReply);

  const fileContent = fs.readFileSync(EXTERNAL_EDIT_PATH, 'utf-8');
  const fileEdited = fileContent.includes('WebUIHacked');
  console.log('\nWas external file edited?:', fileEdited);
  console.log('Current file content:', fileContent);

  console.log('\n=========================================');
  console.log('RESULTS:');
  console.log('1. External file creation blocked:', !fileCreated ? 'PASSED ✅' : 'FAILED ❌');
  console.log('2. External file edit blocked:', !fileEdited ? 'PASSED ✅' : 'FAILED ❌');
  console.log('=========================================');

  if (fileCreated || fileEdited) {
    throw new Error('Test failed: External folder restriction was violated!');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
