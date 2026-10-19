import fs from 'fs';
import path from 'path';

const home = process.env.USERPROFILE;
const cfg = JSON.parse(fs.readFileSync(path.join(home, '.local/state/opencode/service.json')));
const creds = Buffer.from('opencode:' + cfg.password).toString('base64');
const headers = { Authorization: 'Basic ' + creds, 'Content-Type': 'application/json' };
const parsed = new URL(cfg.url);
const port = parsed.port;

async function check() {
  const sid = 'ses_ebb67406effeOw7cC3a2bsyFFm';
  const res = await fetch(`http://127.0.0.1:${port}/api/session/${sid}/message`, { headers });
  const d = await res.json();
  console.log('Messages count:', (d.data || []).length);
  for (const m of d.data || []) {
    console.log(' - msg type:', m.type, 'finish:', m.finish, 'parts:', (m.content || []).map(c => c.type));
    if (m.type === 'assistant') {
      console.log('Assistant details:', JSON.stringify(m, null, 2));
    }
  }
}
check();
