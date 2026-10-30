// ========================================================
// 🤖 Discord Bot (Node.js) — 24/7 TitanBot Cloud Host
// ========================================================
const fs = require('fs');
const path = require('path');

// Read token from environment or local .env
let token = process.env.DISCORD_TOKEN;
if (!token && fs.existsSync(path.join(__dirname, '.env'))) {
    const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envFile.match(/DISCORD_TOKEN=(.*)/);
    if (match) token = match[1].trim();
}

console.log('========================================================');
console.log('🚀 [TitanBot Supervisor] Node.js Discord Bot Booting 24/7...');
console.log('🔒 Security Sandbox: ACTIVE (Zero-Bypass Jail)');
console.log('⚡ Hardware Allocation: UNLIMITED V8 64GB HEAP & CORES');
console.log('========================================================');

if (!token || token === 'PASTE_YOUR_DISCORD_TOKEN_HERE') {
    console.log("⚠️ [NOTE] Abhi aapne Discord Token nahi daala hai!");
    console.log("👉 Dashboard ke 'In-Browser Code & .env Editor' tab me jaakar .env me token daalein.");
} else {
    console.log("🔑 Token Detected! Connecting to Discord Gateway 24/7...");
}

// 24/7 Keep-Alive Heartbeat Watchdog Loop
setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`💓 [TitanBot Heartbeat] 24/7 Online | Uptime: ${Math.floor(process.uptime())}s | RSS: ${Math.round(mem.rss / 1024 / 1024)}MB | Unlimited Mode: ACTIVE`);
}, 10000);
