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
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('Launching browser to capture UI state...');
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:44551...');
  await page.goto('http://localhost:44551', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Take screenshot of home page showing Chat Panel & Clear Sessions button
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'chat-clear-sessions.png') });
  console.log('Saved chat-clear-sessions.png');

  // Click the "Sessions" navigation tab
  const sessionsTab = await page.waitForSelector('button ::-p-text(Sessions)', { timeout: 5000 }).catch(() => null);
  if (sessionsTab) {
    await sessionsTab.click();
  } else {
    // Fallback: look for button containing Sessions
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.includes('Sessions')) {
        await b.click();
        break;
      }
    }
  }
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'session-history-clear-all.png') });
  console.log('Saved session-history-clear-all.png (from tab)');

  await browser.close();
  console.log('Browser visual verification completed!');
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
