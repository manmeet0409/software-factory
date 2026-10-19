const BASE_URL = 'http://localhost:44551';

async function main() {
  console.log('--- 1. Testing Non-Ticket Turn & Revert ---');
  const nonTicketRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What is the current factory status?' }),
  });

  const nonTicketData = await nonTicketRes.json();
  console.log('Non-ticket reply received:');
  console.log('ticketCreated:', nonTicketData.ticketCreated);
  console.log('promptMsgId:', nonTicketData.promptMsgId);
  console.log('sessionId:', nonTicketData.sessionId);
  console.log('userMessage ID:', nonTicketData.userMessage?.id);

  if (nonTicketData.ticketCreated !== false) {
    throw new Error(`Expected ticketCreated to be false, got ${nonTicketData.ticketCreated}`);
  }

  console.log('\n--- 2. Testing Ticket Creation Turn ---');
  const ticketRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Create task: Automated Revert Guard Verification Ticket' }),
  });

  const ticketData = await ticketRes.json();
  console.log('Ticket prompt reply received:');
  console.log('ticketCreated:', ticketData.ticketCreated);
  console.log('actionTaken:', ticketData.actionTaken);
  console.log('userMessage ID:', ticketData.userMessage?.id);

  if (ticketData.ticketCreated !== true) {
    throw new Error(`Expected ticketCreated to be true, got ${ticketData.ticketCreated}`);
  }

  console.log('\n--- 3. Testing Safety Guard: Attempt Revert on Ticket Turn (Must Fail) ---');
  const failRevertRes = await fetch(`${BASE_URL}/api/chat/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: ticketData.sessionId,
      promptMsgId: ticketData.promptMsgId,
      userMessageId: ticketData.userMessage?.id,
      orchestratorMessageId: ticketData.orchestratorMessage?.id,
    }),
  });

  const failRevertData = await failRevertRes.json();
  console.log('Ticket revert attempt status:', failRevertRes.status, failRevertData);
  if (failRevertRes.status !== 400) {
    throw new Error(`Expected status 400 for ticket turn revert, got ${failRevertRes.status}`);
  }

  console.log('\n--- 4. Testing Revert on Non-Ticket Turn (Must Succeed) ---');
  const successRevertRes = await fetch(`${BASE_URL}/api/chat/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: nonTicketData.sessionId,
      promptMsgId: nonTicketData.promptMsgId,
      userMessageId: nonTicketData.userMessage?.id,
      orchestratorMessageId: nonTicketData.orchestratorMessage?.id,
    }),
  });

  const successRevertData = await successRevertRes.json();
  console.log('Non-ticket revert response:', successRevertRes.status, successRevertData);
  if (!successRevertData.success || successRevertData.revertedText !== 'What is the current factory status?') {
    throw new Error(`Expected successful revert with original text, got: ${JSON.stringify(successRevertData)}`);
  }

  console.log('\n✅ All conditional chat revert tests passed successfully!');
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
