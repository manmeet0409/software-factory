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

async function run() {
  console.log('Launching browser to test input focus behavior...');
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:44551...');
  await page.goto('http://localhost:44551', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  // Test 1: Check initial autofocus on mount
  const isInitiallyFocused = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    return document.activeElement === ta;
  });
  console.log('Test 1 - Initial autofocus on mount:', isInitiallyFocused ? 'PASSED ✅' : 'FAILED ❌');

  // Test 2: Type a message and press Enter
  const textarea = await page.$('textarea');
  await textarea.focus();
  await page.keyboard.type('Hello focus test');

  // Press Enter to send
  await page.keyboard.press('Enter');

  // Immediately check if textarea is STILL focused during submission
  await new Promise((r) => setTimeout(r, 100));
  const isFocusedAfterEnter = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    return document.activeElement === ta;
  });
  console.log('Test 2 - Retains focus immediately after pressing Enter:', isFocusedAfterEnter ? 'PASSED ✅' : 'FAILED ❌');

  // Wait 1.5 seconds during in-flight response and check focus again
  await new Promise((r) => setTimeout(r, 1500));
  const isFocusedDuringLoading = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    return document.activeElement === ta;
  });
  console.log('Test 3 - Retains focus while Orchestrator is responding:', isFocusedDuringLoading ? 'PASSED ✅' : 'FAILED ❌');

  // Test 4: Click a Quick Pill and verify focus returns to textarea
  console.log('Testing quick pill click focus...');
  const pillBtn = await page.$('button.rounded-full');
  if (pillBtn) {
    await pillBtn.click();
    await new Promise((r) => setTimeout(r, 100));
    const isFocusedAfterPill = await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      return document.activeElement === ta;
    });
    console.log('Test 4 - Retains focus after clicking quick pill:', isFocusedAfterPill ? 'PASSED ✅' : 'FAILED ❌');
  }

  await browser.close();

  if (!isFocusedAfterEnter || !isFocusedDuringLoading) {
    throw new Error('Focus was lost during message submission!');
  }

  console.log('\nAll input focus tests PASSED successfully! 🎉');
}

run().catch((err) => {
  console.error('Focus test failed:', err);
  process.exit(1);
});
