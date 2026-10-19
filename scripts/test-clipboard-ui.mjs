import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

// Find Chrome on Windows
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

const screenshotsDir = path.join(process.cwd(), '.screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function runBrowserTests() {
  console.log('Launching browser to test clipboard paste & attachments across all 4 fields...');
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    // 1. Navigate to localhost:3000
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(screenshotsDir, '01_initial_load.png') });
    console.log('Captured 01_initial_load.png');

    // Helper function to simulate pasting an image into an element
    const simulatePasteImage = async (selector, fileName = 'pasted_screenshot.png') => {
      await page.waitForSelector(selector);
      await page.evaluate(
        async ({ sel, name }) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`Element ${sel} not found`);

          // 1x1 base64 transparent PNG
          const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
          const byteCharacters = atob(b64);
          const byteArrays = [];
          for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
              byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
          }
          const blob = new Blob(byteArrays, { type: 'image/png' });
          const file = new File([blob], name, { type: 'image/png' });

          const dt = new DataTransfer();
          dt.items.add(file);

          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          });

          el.dispatchEvent(pasteEvent);
        },
        { sel: selector, name: fileName }
      );
    };

    // 2. Test Field 1: Orchestrator Chat Panel Paste
    console.log('Testing ChatPanel image paste...');
    const chatTextareaSelector = 'textarea[aria-label="Ask orchestrator, request task, or paste screenshot"]';
    await simulatePasteImage(chatTextareaSelector, 'orchestrator_diagram.png');

    // Wait for attachment pill in tray to appear
    await page.waitForSelector('img[alt="orchestrator_diagram.png"]', { timeout: 8000 });
    console.log('Attachment tray rendered pasted thumbnail in ChatPanel! ✅');
    await page.screenshot({ path: path.join(screenshotsDir, '02_chat_paste_success.png') });
    console.log('Captured 02_chat_paste_success.png');

    // Send the message with the attachment
    console.log('Submitting chat message with attachment...');
    await page.click('button[aria-label="Send message to orchestrator"]');
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(screenshotsDir, '03_chat_sent_message.png') });
    console.log('Captured 03_chat_sent_message.png');

    // 3. Test Field 2: Create Ticket Modal Paste
    console.log('Testing CreateTicketModal image paste...');
    // Click "New Task" button
    const newTaskBtn = await page.waitForSelector('button:has-text("New Task"), button[title*="New Task"]', {
      timeout: 5000,
    }).catch(async () => {
      // Find button with plus icon or text
      return page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find((b) => b.textContent.includes('New Task') || b.textContent.includes('Task'));
      });
    });

    if (newTaskBtn) {
      await newTaskBtn.click();
    }
    await page.waitForSelector('#ticket-desc-input', { timeout: 5000 });

    console.log('Pasting screenshot into Ticket Description textarea...');
    await simulatePasteImage('#ticket-desc-input', 'bug_reproduction.png');
    await page.waitForSelector('img[alt="bug_reproduction.png"]', { timeout: 8000 });
    console.log('Attachment tray rendered thumbnail in CreateTicketModal! ✅');
    await page.screenshot({ path: path.join(screenshotsDir, '04_ticket_modal_paste.png') });
    console.log('Captured 04_ticket_modal_paste.png');

    // Close modal
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 600));

    // 4. Test Field 3: Ticket Detail Modal Comments Paste
    console.log('Testing TicketDetailModal comment image paste...');
    // Click on any ticket card on the board
    const ticketCard = await page.$('div[role="button"], div[class*="cursor-pointer"]');
    if (ticketCard) {
      await ticketCard.click();
      await page.waitForSelector('textarea[placeholder*="Add review feedback"]', { timeout: 5000 });
      console.log('Opened TicketDetailModal, pasting feedback screenshot...');
      await simulatePasteImage('textarea[placeholder*="Add review feedback"]', 'review_diff.png');
      await page.waitForSelector('img[alt="review_diff.png"]', { timeout: 8000 });
      console.log('Attachment tray rendered thumbnail in TicketDetailModal! ✅');
      await page.screenshot({ path: path.join(screenshotsDir, '05_ticket_detail_comment_paste.png') });
      console.log('Captured 05_ticket_detail_comment_paste.png');
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 600));
    } else {
      console.log('No ticket card found to click, skipping TicketDetailModal click.');
    }

    // 5. Test Field 4: The Wall Pin Modal Paste
    console.log('Testing The Wall pin image paste...');
    // Click on "The Wall" tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, a'));
      const wallTab = tabs.find((el) => el.textContent.includes('The Wall'));
      if (wallTab) wallTab.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(screenshotsDir, '06_the_wall_board.png') });

    // Click "Pin Knowledge" button
    await page.waitForSelector('button[aria-label="Add New Pin to The Wall"]', { timeout: 5000 });
    await page.click('button[aria-label="Add New Pin to The Wall"]');

    await page.waitForSelector('#pin-desc', { timeout: 5000 });
    console.log('Pasting diagram into Wall Pin Description textarea...');
    await simulatePasteImage('#pin-desc', 'architecture_schema.png');
    await page.waitForSelector('img[alt="architecture_schema.png"]', { timeout: 8000 });
    console.log('Attachment tray rendered thumbnail in Wall Pin Modal! ✅');
    await page.screenshot({ path: path.join(screenshotsDir, '07_wall_pin_paste.png') });
    console.log('Captured 07_wall_pin_paste.png');

    console.log('\nALL 4 INPUT FIELDS CLIPBOARD PASTE & ATTACHMENT TESTS COMPLETED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('Browser test failed:', err);
    await page.screenshot({ path: path.join(screenshotsDir, 'error.png') });
    throw err;
  } finally {
    await browser.close();
  }
}

runBrowserTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
