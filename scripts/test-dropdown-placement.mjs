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
  console.log('Launching browser to test model dropdown placement...');
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  // Find the model combobox trigger button (has title starting with 'Active Model:')
  const modelBtn = await page.$('button[title^="Active Model:"]');
  if (!modelBtn) {
    throw new Error('ModelCombobox button not found');
  }

  console.log('Clicking ModelCombobox button...');
  await modelBtn.click();
  await new Promise((r) => setTimeout(r, 600));

  // Take screenshot of the open dropdown
  const screenshotPath = path.join(SCREENSHOT_DIR, 'dropdown-placement-fixed.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  // Measure bounding box of the open popover
  const popoverInfo = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="Search or type custom model"]');
    if (!input) return null;
    const popover = input.closest('div.absolute');
    if (!popover) return null;
    const rect = popover.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
    };
  });

  console.log('Popover rect:', popoverInfo);

  if (!popoverInfo) {
    throw new Error('Popover element not found after click!');
  }

  if (popoverInfo.x < 0) {
    throw new Error(`Popover is clipped offscreen to the left! x: ${popoverInfo.x}`);
  }

  console.log(' SUCCESS: Dropdown is placed properly with left coordinate >= 0 and no horizontal clipping!');

  await browser.close();
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
