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
  console.log('--- 1. Launching Headless Chrome ---');
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('--- 2. Navigating to Software Factory Dashboard ---');
    await page.goto('http://localhost:44551', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1200));

    // Ensure we start from a clean New Chat (simulating user clicking New Chat)
    const newChatBtn = await page.$('button[aria-label="Start new chat"]');
    const isNewChatBtnDisabled = await page.evaluate((btn) => btn?.disabled, newChatBtn);
    if (!isNewChatBtnDisabled) {
      console.log('Clicking "New Chat" to transition into a clean new conversation...');
      await newChatBtn.click();
      await new Promise((r) => setTimeout(r, 1200));
    }

    // Verify we are now in New Chat state (welcome message only)
    const isInNewChat = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('div[role="log"] > div'));
      const hasWelcome = document.body.textContent?.includes('Factory Orchestrator Online');
      const hasUserMsg = msgs.some((m) => m.textContent?.includes('You'));
      return hasWelcome && !hasUserMsg;
    });
    console.log('Is chat in a fresh welcome state without user messages?', isInNewChat);

    // Check if in a new chat the banner is visible:
    const hasBannerInNewChat = await page.evaluate(() => {
      const banner = document.querySelector('button[aria-label="Dismiss notification"]');
      const approveBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Approve');
      return Boolean(banner || approveBtn);
    });

    console.log('Is proactive alert popup shown in New Chat?', hasBannerInNewChat);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'proactive_01_new_chat_clean.png') });

    if (hasBannerInNewChat) {
      throw new Error('Proactive alert is incorrectly showing in a new chat!');
    }
    console.log('✅ PASS: Proactive alert correctly suppressed in new chat!');

    // 4. Send a test message to initiate a conversation
    console.log('--- 4. Sending a chat message to start conversation ---');
    const textarea = await page.$('textarea');
    await textarea.type('What is the factory status?');
    const sendBtn = await page.$('button[aria-label="Send message to orchestrator"]');
    await sendBtn.click();

    // Wait for response
    console.log('Waiting for response...');
    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('div[role="log"] > div');
      return msgs.length >= 3; // welcome + user + assistant
    }, { timeout: 30000 });

    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'proactive_02_conversation_active.png') });

    // 5. Wait for background polling to trigger proactive alert in active conversation
    console.log('Waiting for background polling to show ready ticket alert in active chat...');
    await page.waitForSelector('button[aria-label="Dismiss notification"]', { timeout: 20000 });

    const alertInfo = await page.evaluate(() => {
      const dismissBtn = document.querySelector('button[aria-label="Dismiss notification"]');
      const approveBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Approve');
      const banner = document.querySelector('.bg-amber-500\\/10');
      return {
        hasDismissBtn: Boolean(dismissBtn),
        hasApproveBtn: Boolean(approveBtn),
        bannerText: banner?.textContent?.trim(),
      };
    });

    console.log('Proactive Alert Status in active conversation:', alertInfo);

    if (alertInfo.hasDismissBtn) {
      console.log('--- 6. Clicking Dismiss (X) Button ---');
      await page.click('button[aria-label="Dismiss notification"]');
      await new Promise((r) => setTimeout(r, 600));

      const isDismissed = await page.evaluate(() => {
        return !document.querySelector('button[aria-label="Dismiss notification"]');
      });
      console.log('Was alert dismissed immediately?', isDismissed);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'proactive_03_dismissed.png') });

      if (!isDismissed) {
        throw new Error('Dismiss button did not remove the proactive banner!');
      }
      console.log('✅ PASS: Alert dismissed successfully via (X) button!');

      // Wait 16 seconds to verify background polling does NOT revive the dismissed alert
      console.log('Waiting 16s to verify polling does not bring back dismissed ticket alert...');
      await new Promise((r) => setTimeout(r, 16000));

      const stillGone = await page.evaluate(() => {
        return !document.querySelector('button[aria-label="Dismiss notification"]');
      });
      console.log('Is alert still dismissed after 16s polling cycle?', stillGone);
      if (!stillGone) {
        throw new Error('Polling interval brought back the dismissed alert!');
      }
      console.log('✅ PASS: Polling respects dismissed ticket alerts!');
    }

    // 7. Click "New Chat" and verify it clears everything and returns to clean welcome state
    console.log('--- 7. Clicking New Chat Button ---');
    const newChatBtnActive = await page.$('button[aria-label="Start new chat"]');
    await newChatBtnActive.click();
    await new Promise((r) => setTimeout(r, 1000));

    const finalState = await page.evaluate(() => {
      const banner = document.querySelector('button[aria-label="Dismiss notification"]');
      const approveBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Approve');
      const msgs = document.querySelectorAll('div[role="log"] > div');
      return {
        hasBanner: Boolean(banner || approveBtn),
        msgCount: msgs.length,
      };
    });

    console.log('Final State after New Chat click:', finalState);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'proactive_04_new_chat_after_reset.png') });

    if (finalState.hasBanner) {
      throw new Error('Banner reappeared after clicking New Chat!');
    }
    console.log('✅ PASS: New Chat is completely clean without any popup banner!');

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
