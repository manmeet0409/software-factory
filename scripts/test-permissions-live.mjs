import fs from 'fs';
import path from 'path';

const home = process.env.USERPROFILE;
const cfg = JSON.parse(fs.readFileSync(path.join(home, '.local/state/opencode/service.json')));
const creds = Buffer.from('opencode:' + cfg.password).toString('base64');
const headers = { Authorization: 'Basic ' + creds, 'Content-Type': 'application/json' };
const parsed = new URL(cfg.url);
const port = parsed.port;

// Ensure target test directories exist
if (!fs.existsSync('D:/Projects/test')) fs.mkdirSync('D:/Projects/test', { recursive: true });
if (!fs.existsSync('D:/Projects/test_2')) fs.mkdirSync('D:/Projects/test_2', { recursive: true });

// Create a dummy file in test_2 to test editing
fs.writeFileSync('D:/Projects/test_2/target_to_edit.txt', 'Original content in test_2', 'utf-8');

// Ensure hello_g.md does NOT exist
if (fs.existsSync('D:/Projects/test_2/hello_g.md')) {
  fs.unlinkSync('D:/Projects/test_2/hello_g.md');
}

async function run() {
  console.log('=== Step 1: Create Orchestrator session in D:/Projects/test ===');
  const sRes = await fetch(`http://127.0.0.1:${port}/api/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Testing Strict Permissions Enforcement',
      agent: 'orchestrator',
      location: { directory: 'D:/Projects/test' },
      model: {
        providerID: 'opencode',
        id: 'muse-spark-1.3-contributor-free',
        variant: 'xhigh',
      },
    }),
  });

  const sData = await sRes.json();
  const sid = sData.data?.id;
  console.log('Session ID:', sid);

  console.log('\n=== Step 2: Prompt agent to create file in external folder D:/Projects/test_2/hello_g.md ===');
  await fetch(`http://127.0.0.1:${port}/api/session/${sid}/prompt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'create a file D:/Projects/test_2/hello_g.md with content Hello World' }),
  });

  // Await response
  console.log('Waiting for OpenCode response...');
  let reply = '';
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const mRes = await fetch(`http://127.0.0.1:${port}/api/session/${sid}/message`, { headers });
    const mData = await mRes.json();
    const msgs = mData.data || [];
    const asst = msgs.slice().reverse().find((m) => m.type === 'assistant');
    if (asst && asst.content) {
      const textBlocks = asst.content.filter((c) => c.type === 'text');
      if (textBlocks.length > 0 && textBlocks[0].text) {
        reply = textBlocks.map((b) => b.text).join('\n\n');
        break;
      }
    }
  }

  console.log('\nAgent Reply:');
  console.log(reply || '(No text reply produced)');

  const createdFileExists = fs.existsSync('D:/Projects/test_2/hello_g.md');
  console.log('\nExternal file D:/Projects/test_2/hello_g.md created?:', createdFileExists);

  console.log('\n=== Step 3: Prompt agent to edit file in external folder D:/Projects/test_2/target_to_edit.txt ===');
  await fetch(`http://127.0.0.1:${port}/api/session/${sid}/prompt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'edit the file D:/Projects/test_2/target_to_edit.txt and replace Original with Hacked' }),
  });

  let editReply = '';
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const mRes = await fetch(`http://127.0.0.1:${port}/api/session/${sid}/message`, { headers });
    const mData = await mRes.json();
    const msgs = mData.data || [];
    // get latest assistant message after second user prompt
    const userMsgs = msgs.filter((m) => m.type === 'user');
    const asstMsgs = msgs.filter((m) => m.type === 'assistant');
    if (asstMsgs.length >= 2) {
      const latestAsst = asstMsgs[0]; // first in desc order
      if (latestAsst && latestAsst.content) {
        const textBlocks = latestAsst.content.filter((c) => c.type === 'text');
        if (textBlocks.length > 0 && textBlocks[0].text) {
          editReply = textBlocks.map((b) => b.text).join('\n\n');
          break;
        }
      }
    }
  }

  console.log('\nAgent Edit Reply:');
  console.log(editReply || '(No text reply produced)');

  const editFileContent = fs.readFileSync('D:/Projects/test_2/target_to_edit.txt', 'utf-8');
  console.log('\nExternal file D:/Projects/test_2/target_to_edit.txt content:', editFileContent);
  const wasEdited = editFileContent.includes('Hacked');
  console.log('Was external file edited?:', wasEdited);

  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log('External file creation blocked:', !createdFileExists ? 'PASSED ✅' : 'FAILED ❌');
  console.log('External file edit blocked:', !wasEdited ? 'PASSED ✅' : 'FAILED ❌');
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
