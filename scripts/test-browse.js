const { execFile } = require('child_process');
const path = require('path');

const scriptPath = path.resolve(__dirname, 'browse-folder.ps1');
console.log('Testing scriptPath:', scriptPath);

const child = execFile('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { timeout: 5000 }, (err, stdout, stderr) => {
  console.log('Error:', err ? err.message : null);
  console.log('STDOUT:', stdout);
  console.log('STDERR:', stderr);
});
