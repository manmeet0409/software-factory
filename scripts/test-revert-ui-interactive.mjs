import puppeteer from 'puppeteer-core';
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

const SCREENSHOT_DIR = path.resolve('.screenshots');

async function run() {
  console.log('Launching browser to test interactive revert in UI...');
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:44551', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Type a non-ticket prompt in the textarea
  const promptText = 'What files are in this directory?';
  const textarea = await page.waitForSelector('textarea', { timeout: 5000 });
  await textarea.type(promptText);

  // Press Enter
  await page.keyboard.press('Enter');

  console.log('Sent prompt, awaiting orchestrator reply...');
  // Wait until loading spinner disappears
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 25000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // Capture screenshot showing the user bubble with Time, Copy, and Undo2 buttons
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'chat-revert-visible.png') });
  console.log('Saved chat-revert-visible.png');

  // Verify Undo2 button exists on the user bubble
  const revertBtns = await page.$$('button[title*="Revert turn"]');
  if (!revertBtns || revertBtns.length === 0) {
    throw new Error('Revert button (Undo2) not found on user message bubble!');
  }
  const revertBtn = revertBtns[revertBtns.length - 1];
  console.log(`Found ${revertBtns.length} revert button(s)! Clicking the latest...`);

  // Click revert button
  await revertBtn.click();
  await new Promise(r => setTimeout(r, 2000));

  // Verify textarea received the reverted text
  const textareaValue = await page.$eval('textarea', el => el.value);
  console.log('Textarea value after revert:', textareaValue);

  if (textareaValue !== promptText) {
    throw new Error(`Expected textarea to contain "${promptText}", got "${textareaValue}"`);
  }

  // Capture screenshot after revert
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'chat-revert-after.png') });
  console.log('Saved chat-revert-after.png');

  await browser.close();
  console.log('✅ UI interactive revert test passed completely!');
}

run().catch((err) => {
  console.error('Interactive test error:', err);
  process.exit(1);
});
