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
  console.log('Launching browser to capture chat revert UI state...');
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

  // Take screenshot of chat panel
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'chat-revert-bubble.png') });
  console.log('Saved chat-revert-bubble.png');

  await browser.close();
}

run().catch((err) => {
  console.error('Screenshot error:', err);
  process.exit(1);
});
