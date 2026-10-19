import fs from 'fs';

const BASE_URL = 'http://localhost:44551';
const WORKSPACE_FILE = 'D:/Projects/test/orchestrator_workspace_file.md';
const EXTERNAL_CREATE_FILE = 'D:/Projects/test_2/orchestrator_external_leak.md';
const EXTERNAL_EDIT_FILE = 'D:/Projects/test_2/external_edit_target.txt';

// Prep directories and files
if (!fs.existsSync('D:/Projects/test')) fs.mkdirSync('D:/Projects/test', { recursive: true });
if (!fs.existsSync('D:/Projects/test_2')) fs.mkdirSync('D:/Projects/test_2', { recursive: true });

if (fs.existsSync(WORKSPACE_FILE)) fs.unlinkSync(WORKSPACE_FILE);
if (fs.existsSync(EXTERNAL_CREATE_FILE)) fs.unlinkSync(EXTERNAL_CREATE_FILE);
fs.writeFileSync(EXTERNAL_EDIT_FILE, 'Original external content', 'utf-8');

async function sendChatAndWait(message) {
  console.log(`\n--- Sending: "${message}" ---`);
  const chatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  const chatData = await chatRes.json();
  let finalReply = chatData.reply || '';

  if (chatData.isPending && chatData.sessionId) {
    console.log('Awaiting reply from session:', chatData.sessionId);
    const deadline = Date.now() + 30000;
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
  console.log('=== Step 1: Set workspace to D:\\Projects\\test & reset sessions ===');
  await fetch(`${BASE_URL}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory: 'D:\\Projects\\test' }),
  });
  await fetch(`${BASE_URL}/api/sessions?clearAll=true`, { method: 'DELETE' });

  console.log('\n=== Step 2: Test Direct File Creation in Active Workspace ===');
  const createLocalReply = await sendChatAndWait(
    'Please create a file orchestrator_workspace_file.md with content: # Created by Orchestrator in Workspace'
  );
  console.log('Orchestrator Reply:\n', createLocalReply);

  const localFileCreated = fs.existsSync(WORKSPACE_FILE);
  console.log('\nWorkspace file created?:', localFileCreated);
  if (localFileCreated) {
    console.log('Workspace file content:', fs.readFileSync(WORKSPACE_FILE, 'utf-8'));
  }

  console.log('\n=== Step 3: Test External File Creation (MUST BE BLOCKED) ===');
  const createExtReply = await sendChatAndWait(
    'Please create a file D:/Projects/test_2/orchestrator_external_leak.md with content: Leak'
  );
  console.log('Orchestrator Reply:\n', createExtReply);

  const extFileCreated = fs.existsSync(EXTERNAL_CREATE_FILE);
  console.log('\nExternal file created?:', extFileCreated);

  console.log('\n=== Step 4: Test External File Edit (MUST BE BLOCKED) ===');
  const editExtReply = await sendChatAndWait(
    'Please edit the file D:/Projects/test_2/external_edit_target.txt and change Original to Hacked'
  );
  console.log('Orchestrator Reply:\n', editExtReply);

  const extContent = fs.readFileSync(EXTERNAL_EDIT_FILE, 'utf-8');
  const extFileEdited = extContent.includes('Hacked');
  console.log('\nExternal file edited?:', extFileEdited);

  console.log('\n=========================================');
  console.log('OPTION B VERIFICATION SUMMARY:');
  console.log('1. In-workspace file creation allowed:', localFileCreated ? 'PASSED ✅' : 'FAILED ❌');
  console.log('2. External file creation blocked:', !extFileCreated ? 'PASSED ✅' : 'FAILED ❌');
  console.log('3. External file edit blocked:', !extFileEdited ? 'PASSED ✅' : 'FAILED ❌');
  console.log('=========================================');

  // Clean up
  if (fs.existsSync(WORKSPACE_FILE)) fs.unlinkSync(WORKSPACE_FILE);
  if (fs.existsSync(EXTERNAL_CREATE_FILE)) fs.unlinkSync(EXTERNAL_CREATE_FILE);
  if (fs.existsSync(EXTERNAL_EDIT_FILE)) fs.unlinkSync(EXTERNAL_EDIT_FILE);

  if (!localFileCreated || extFileCreated || extFileEdited) {
    throw new Error('Option B verification failed!');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
