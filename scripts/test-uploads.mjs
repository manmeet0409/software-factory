import assert from 'assert';

async function testUploads() {
  console.log('Testing /api/uploads...');

  // 1. Create a dummy PNG in memory (1x1 PNG)
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngBase64, 'base64');
  const blob = new Blob([pngBuffer], { type: 'image/png' });

  const formData = new FormData();
  formData.append('file', blob, 'test_screenshot.png');
  formData.append('scope', 'chat');

  const uploadRes = await fetch('http://localhost:3000/api/uploads', {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Upload failed (${uploadRes.status}): ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  console.log('Upload response:', uploadData);
  assert(uploadData.id, 'Attachment ID missing');
  assert.strictEqual(uploadData.originalName, 'test_screenshot.png');
  assert.strictEqual(uploadData.mimeType, 'image/png');

  // 2. Fetch the uploaded file
  console.log(`Fetching /api/uploads/${uploadData.id}...`);
  const getRes = await fetch(`http://localhost:3000/api/uploads/${uploadData.id}`);
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.headers.get('content-type'), 'image/png');
  const arrayBuffer = await getRes.arrayBuffer();
  assert.strictEqual(arrayBuffer.byteLength, pngBuffer.length, 'File size matches');
  console.log('Fetch successfully verified file size and Content-Type!');

  // 3. Delete the attachment
  console.log(`Deleting /api/uploads/${uploadData.id}...`);
  const delRes = await fetch(`http://localhost:3000/api/uploads/${uploadData.id}`, {
    method: 'DELETE',
  });
  assert.strictEqual(delRes.status, 200);
  const delData = await delRes.json();
  assert.strictEqual(delData.success, true);

  // 4. Verify 404 after deletion
  const getAfterDel = await fetch(`http://localhost:3000/api/uploads/${uploadData.id}`);
  assert.strictEqual(getAfterDel.status, 404);
  console.log('Verified 404 after deletion!');

  console.log('ALL UPLOAD API TESTS PASSED SUCCESSFULLY! ✅');
}

testUploads().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
