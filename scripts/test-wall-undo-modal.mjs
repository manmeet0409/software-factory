import puppeteer from 'puppeteer-core';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

function getChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome executable not found');
}

const db = new Database('data/factory.db');
const SCREENSHOT_DIR = path.resolve('.screenshots');

async function run() {
  console.log('--- 1. Setting up Wall Pin & Chat Message Turn ---');
  const now = Math.floor(Date.now() / 1000);
  const pinId = uuidv4();
  const userMsgId = uuidv4();
  const orchMsgId = uuidv4();
  const pinTitle = 'Enforce SQLite WAL Mode in Dev';

  // 1. Insert orchestrator wall pin
  db.prepare(`
    INSERT INTO wallPins (id, title, description, category, module, tags, createdBy, createdAt, archived)
    VALUES (?, ?, 'Always use WAL journal mode for high concurrency', 'fact', 'database', '["sqlite","wal"]', 'orchestrator', ?, 0)
  `).run(pinId, pinTitle, now);

  // 2. Insert paired user & orchestrator messages
  const promptText = 'Pin to wall: SQLite must use WAL mode for concurrency';
  db.prepare(`
    INSERT INTO chatMessages (id, sender, text, timestamp, ticketCreated, promptMsgId, sessionId, pairMessageId, wallPinIds)
    VALUES (?, 'user', ?, ?, 0, 'mock_prompt_wal', 'mock_session_wal', ?, ?)
  `).run(userMsgId, promptText, now, orchMsgId, JSON.stringify([pinId]));

  db.prepare(`
    INSERT INTO chatMessages (id, sender, text, timestamp, ticketCreated, promptMsgId, sessionId, pairMessageId, wallPinIds)
    VALUES (?, 'orchestrator', '📌 Pinned to The Wall: Enforce SQLite WAL Mode in Dev', ?, 0, 'mock_prompt_wal', 'mock_session_wal', ?, ?)
  `).run(orchMsgId, now, userMsgId, JSON.stringify([pinId]));

  console.log('Created test turn with Orchestrator Pin:', pinId);

  console.log('\n--- 2. Launching Browser to Verify Confirmation Modal ---');
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:44551', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Find all revert buttons
  const revertBtns = await page.$$('button[title*="Wall pin"]');
  console.log(`Found ${revertBtns.length} revert button(s) with Wall pin indicator`);

  if (revertBtns.length === 0) {
    throw new Error('Could not find revert button with Wall pin indicator!');
  }

  // Click the revert button on our test message
  console.log('Clicking revert button on Wall pin turn...');
  await revertBtns[revertBtns.length - 1].click();
  await new Promise(r => setTimeout(r, 800));

  // Verify modal is displayed
  const modalHeader = await page.waitForSelector('h3 ::-p-text(Undo Chat Turn & Remove Wall Pins?)', { timeout: 5000 }).catch(() => null);
  if (!modalHeader) {
    // Check fallback
    const h3s = await page.$$eval('h3', els => els.map(e => e.textContent));
    console.log('Visible h3 headings:', h3s);
    if (!h3s.some(h => h.includes('Wall Pins'))) {
      throw new Error('Confirmation modal dialog did NOT appear!');
    }
  }

  console.log('Confirmation modal detected! Capturing screenshot...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'wall-undo-modal.png') });
  console.log('Saved wall-undo-modal.png');

  // Verify pin title is visible in modal
  const modalText = await page.evaluate(() => document.body.innerText);
  if (!modalText.includes(pinTitle)) {
    throw new Error(`Expected modal to display pin title "${pinTitle}"`);
  }
  console.log('Pin title confirmed in modal list!');

  // Click "Confirm & Undo"
  console.log('Clicking "Confirm & Undo"...');
  const confirmBtn = await page.waitForSelector('button ::-p-text(Confirm & Undo)', { timeout: 5000 });
  await confirmBtn.click();
  await new Promise(r => setTimeout(r, 2000));

  // Verify pin was removed from SQLite
  const pinAfter = db.prepare('SELECT id FROM wallPins WHERE id = ?').get(pinId);
  console.log('Orchestrator pin exists after Confirm & Undo?:', !!pinAfter);
  if (pinAfter) {
    throw new Error('FAILED: Orchestrator pin was not deleted after Confirm & Undo!');
  }

  // Verify textarea received the reverted text
  const textareaVal = await page.$eval('textarea', el => el.value);
  console.log('Textarea value:', textareaVal);
  if (textareaVal !== promptText) {
    throw new Error(`Expected textarea to contain "${promptText}", got "${textareaVal}"`);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'wall-undo-after.png') });
  console.log('Saved wall-undo-after.png');

  await browser.close();
  console.log('✅ Wall undo confirmation modal test PASSED completely!');
}

run().catch((err) => {
  console.error('❌ Modal test error:', err);
  process.exit(1);
});
