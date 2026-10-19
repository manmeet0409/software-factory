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
    await new Promise((r) => setTimeout(r, 1000));

    // Capture initial chat panel model combobox text
    const initialModelText = await page.evaluate(() => {
      const btn = document.querySelector('button[title^="Active Model:"]');
      return btn ? btn.textContent?.trim() : null;
    });
    console.log('Initial Chat Panel Model Display:', initialModelText);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'model_sync_01_initial.png') });

    // Open Settings Modal
    console.log('--- 3. Opening Agent Settings Modal ---');
    const settingsBtn = await page.waitForSelector('button[aria-label="Agent Model Settings"]');
    await settingsBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    // Verify modal is open
    const modalTitle = await page.evaluate(() => {
      const el = document.getElementById('agent-settings-title');
      return el ? el.textContent?.trim() : null;
    });
    console.log('Settings Modal Opened:', modalTitle);

    // Click Orchestrator in agent list if not already selected
    console.log('--- 4. Selecting Orchestrator & Picking New Model ---');
    // Open the Model Architecture Combobox inside the settings modal (right column)
    const modelDropdownTrigger = await page.evaluate(() => {
      const modal = document.querySelector('div[role="dialog"]');
      if (!modal) return null;
      const comboboxes = Array.from(modal.querySelectorAll('button[title^="Active Model:"]'));
      // The second combobox is the active agent's Model Architecture dropdown
      const btn = comboboxes.length > 1 ? comboboxes[1] : comboboxes[0];
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!modelDropdownTrigger) {
      throw new Error('Could not find Model Architecture combobox in Settings modal');
    }
    await new Promise((r) => setTimeout(r, 500));

    // Select "space-bunny-free" from the dropdown options
    const targetModel = 'opencode/space-bunny-free';
    const selected = await page.evaluate((target) => {
      const modal = document.querySelector('div[role="dialog"]');
      if (!modal) return false;
      const buttons = Array.from(modal.querySelectorAll('button'));
      const targetBtn = buttons.find((b) => b.textContent && b.textContent.includes('space-bunny-free'));
      if (targetBtn) {
        targetBtn.click();
        return true;
      }
      return false;
    }, targetModel);

    console.log(`Selected "${targetModel}" in Settings modal:`, selected);
    await new Promise((r) => setTimeout(r, 500));

    // Select "high" variant if available
    const pickedVariant = await page.evaluate(() => {
      const modal = document.querySelector('div[role="dialog"]');
      if (!modal) return null;
      const pills = Array.from(modal.querySelectorAll('button'));
      const highPill = pills.find((p) => p.textContent && p.textContent.trim().toLowerCase() === 'high');
      if (highPill) {
        highPill.click();
        return 'high';
      }
      return null;
    });
    console.log('Selected reasoning variant in modal:', pickedVariant);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'model_sync_02_settings_changed.png') });

    // Click "Save Settings"
    console.log('--- 5. Saving Settings ---');
    const saveBtn = await page.evaluate(() => {
      const modal = document.querySelector('div[role="dialog"]');
      if (!modal) return false;
      const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Save Settings'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    console.log('Clicked Save Settings button:', saveBtn);

    // Wait for save and for modal to close (up to 15s)
    await page.waitForFunction(() => !document.querySelector('div[role="dialog"]'), { timeout: 15000 });
    console.log('Modal closed successfully after save!');

    // Check Chat Panel ModelCombobox and ThinkingEffortSelect IMMEDIATELY without reload!
    console.log('--- 6. Verifying Chat Panel Model Combobox Updated Live ---');
    const updatedModelInfo = await page.evaluate(() => {
      // Find the chat toolbar combobox
      const comboboxes = Array.from(document.querySelectorAll('button[title^="Active Model:"]'));
      // The chat panel combobox is the one outside the modal
      const chatModelBtn = comboboxes[0];
      const modelTitle = chatModelBtn ? chatModelBtn.getAttribute('title') : null;
      const modelText = chatModelBtn ? chatModelBtn.textContent?.trim() : null;

      const effortBtn = document.querySelector('button[title^="Thinking Effort:"]');
      const effortTitle = effortBtn ? effortBtn.getAttribute('title') : null;
      const effortText = effortBtn ? effortBtn.textContent?.trim() : null;

      return {
        modelTitle,
        modelText,
        effortTitle,
        effortText,
      };
    });

    console.log('Live Chat Panel Model Title:', updatedModelInfo.modelTitle);
    console.log('Live Chat Panel Model Text:', updatedModelInfo.modelText);
    console.log('Live Chat Panel Effort Title:', updatedModelInfo.effortTitle);
    console.log('Live Chat Panel Effort Text:', updatedModelInfo.effortText);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'model_sync_03_chat_updated_live.png') });

    const modelSuccess = updatedModelInfo.modelTitle && updatedModelInfo.modelTitle.includes('space-bunny-free');
    const effortSuccess = updatedModelInfo.effortTitle && updatedModelInfo.effortTitle.toLowerCase().includes('high');

    console.log('\n=== RESULTS ===');
    console.log('Model Synchronized:', modelSuccess ? '✅ PASSED' : '❌ FAILED');
    console.log('Reasoning Synchronized:', effortSuccess ? '✅ PASSED' : '❌ FAILED');

    if (!modelSuccess) {
      throw new Error(`Model was not updated in chat dropdown! Found: ${updatedModelInfo.modelTitle}`);
    }

    // Restore back to glm-5.3-flash-free / max for consistency
    console.log('\n--- 7. Restoring Orchestrator Model back to glm-5.3-flash-free / max ---');
    const restoreRes = await fetch('http://localhost:44551/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeOrchestratorModel: 'opencode/glm-5.3-flash-free',
        activeOrchestratorVariant: 'max',
        agentModels: { orchestrator: 'opencode/glm-5.3-flash-free' },
        agentVariants: { orchestrator: 'max' },
      }),
    });
    console.log('Restored model status:', restoreRes.status);
    await new Promise((r) => setTimeout(r, 1000));

    // Check again that SSE updated the UI
    const finalCheck = await page.evaluate(() => {
      const chatModelBtn = document.querySelector('button[title^="Active Model:"]');
      return chatModelBtn ? chatModelBtn.getAttribute('title') : null;
    });
    console.log('After restore, Chat Panel Model Title via SSE:', finalCheck);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'model_sync_04_restored.png') });

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
