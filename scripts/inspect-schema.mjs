async function run() {
  const res = await fetch('https://opencode.ai/config.json');
  const d = await res.json();
  const text = JSON.stringify(d);
  
  // Find all enum or descriptions related to action, tool, permission
  for (const [k, v] of Object.entries(d.$defs || {})) {
    if (v.properties?.action || v.enum || v.properties?.permissions) {
      console.log(`Key ${k}:`, JSON.stringify(v, null, 2));
    }
  }
}
run();
