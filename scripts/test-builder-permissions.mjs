import fs from 'fs';
import path from 'path';

const home = process.env.USERPROFILE;
const cfg = JSON.parse(fs.readFileSync(path.join(home, '.local/state/opencode/service.json')));
const creds = Buffer.from('opencode:' + cfg.password).toString('base64');
const headers = { Authorization: 'Basic ' + creds, 'Content-Type': 'application/json' };
const parsed = new URL(cfg.url);
const port = parsed.port;

const targetLeakFile = 'D:/Projects/test_2/builder_leak.txt';
if (fs.existsSync(targetLeakFile)) {
  fs.unlinkSync(targetLeakFile);
}

async function run() {
  console.log('=== Step 1: Create Builder session in D:/Projects/test ===');
  const sRes = await fetch(`http://127.0.0.1:${port}/api/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Testing Builder External Permissions',
      agent: 'builder',
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

  console.log('\n=== Step 2: Prompt builder to create file in external folder D:/Projects/test_2 ===');
  await fetch(`http://127.0.0.1:${port}/api/session/${sid}/prompt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'create a file D:/Projects/test_2/builder_leak.txt with content Builder Leaked' }),
  });

  console.log('Waiting for OpenCode builder response...');
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

  console.log('\nBuilder Reply:');
  console.log(reply || '(No text reply produced)');

  const leakExists = fs.existsSync(targetLeakFile);
  console.log('\nExternal file D:/Projects/test_2/builder_leak.txt created?:', leakExists);

  console.log('\n=== Step 3: Prompt builder to edit existing external file D:/Projects/test_2/target_to_edit.txt ===');
  await fetch(`http://127.0.0.1:${port}/api/session/${sid}/prompt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'edit the file D:/Projects/test_2/target_to_edit.txt to replace Original with BuilderHacked' }),
  });

  let editReply = '';
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const mRes = await fetch(`http://127.0.0.1:${port}/api/session/${sid}/message`, { headers });
    const mData = await mRes.json();
    const msgs = mData.data || [];
    const asstMsgs = msgs.filter((m) => m.type === 'assistant');
    if (asstMsgs.length >= 2) {
      const latestAsst = asstMsgs[0];
      if (latestAsst && latestAsst.content) {
        const textBlocks = latestAsst.content.filter((c) => c.type === 'text');
        if (textBlocks.length > 0 && textBlocks[0].text) {
          editReply = textBlocks.map((b) => b.text).join('\n\n');
          break;
        }
      }
    }
  }

  console.log('\nBuilder Edit Reply:');
  console.log(editReply || '(No text reply produced)');

  const editFileContent = fs.readFileSync('D:/Projects/test_2/target_to_edit.txt', 'utf-8');
  console.log('\nExternal file content:', editFileContent);
  const wasEdited = editFileContent.includes('BuilderHacked');
  console.log('Was external file edited?:', wasEdited);

  console.log('\n=== BUILDER VERIFICATION SUMMARY ===');
  console.log('Builder external file creation blocked:', !leakExists ? 'PASSED ✅' : 'FAILED ❌');
  console.log('Builder external file edit blocked:', !wasEdited ? 'PASSED ✅' : 'FAILED ❌');
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
