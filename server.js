const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const SecuritySandbox = require('./securitySandbox');
const BotSupervisor = require('./supervisor');

let PORT = process.env.PORT || 3000;
const STORAGE_DIR = path.join(__dirname, 'storage');
const DATA_FILE = path.join(__dirname, 'bots.json');

const sandbox = new SecuritySandbox(STORAGE_DIR);
const supervisor = new BotSupervisor(sandbox, DATA_FILE);

const sseClients = new Map();

supervisor.on('log', ({ botId, message }) => {
    if (sseClients.has(botId)) {
        const payload = `data: ${JSON.stringify({ message })}\n\n`;
        sseClients.get(botId).forEach(res => {
            try { res.write(payload); } catch (e) {}
        });
    }
});

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 100 * 1024 * 1024) {
                reject(new Error('Payload exceeds 100MB limit'));
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS, PUT',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname || '/';
    if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
    }
    const method = req.method;

    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS, PUT',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    try {
        // 1. Hardware Stats
        if (method === 'GET' && pathname === '/api/stats') {
            return sendJson(res, 200, sandbox.getSystemHardwareMetrics());
        }

        // 2. Bots / Servers CRUD
        if (method === 'GET' && pathname === '/api/bots') {
            return sendJson(res, 200, supervisor.getAllBots());
        }

        if (method === 'POST' && pathname === '/api/bots') {
            const body = await parseBody(req);
            const bot = supervisor.createBot(body);
            return sendJson(res, 201, bot);
        }

        // 3. Quick Token Save & Auto-Restart
        const tokenMatch = pathname.match(/^\/api\/bots\/([a-zA-Z0-9_-]+)\/token$/);
        if (method === 'POST' && tokenMatch) {
            const botId = tokenMatch[1];
            const body = await parseBody(req);
            const token = (body.token || '').trim();

            const botDir = sandbox.resolveSafePath(botId);
            const envPath = path.join(botDir, '.env');

            let envContent = `DISCORD_TOKEN=${token}\nBOT_PREFIX=!\n`;
            if (fs.existsSync(envPath)) {
                let existing = fs.readFileSync(envPath, 'utf8');
                if (existing.includes('DISCORD_TOKEN=')) {
                    envContent = existing.replace(/DISCORD_TOKEN=.*/g, `DISCORD_TOKEN=${token}`);
                } else {
                    envContent = existing + `\nDISCORD_TOKEN=${token}\n`;
                }
            }
            fs.writeFileSync(envPath, envContent, 'utf8');
            supervisor.appendLog(botId, `container@bot-hosting:~$ 🔑 Discord Token saved to .env! Re-connecting to Discord Gateway...`);

            await supervisor.restartBot(botId);
            return sendJson(res, 200, { success: true, message: 'Token updated and bot restarted' });
        }

        // 4. Multi-file Drag & Drop / Zip Upload Endpoint
        const uploadMatch = pathname.match(/^\/api\/bots\/([a-zA-Z0-9_-]+)\/(upload|upload-files)$/);
        if (method === 'POST' && uploadMatch) {
            const botId = uploadMatch[1];
            const body = await parseBody(req);
            const { files } = body;

            if (!Array.isArray(files) || files.length === 0) {
                return sendJson(res, 400, { error: 'No files received' });
            }

            const savedFiles = [];
            const botDir = sandbox.resolveSafePath(botId);

            for (const file of files) {
                if (!file.name) continue;
                const safePath = sandbox.resolveSafePath(botId, file.name);
                const parentDir = path.dirname(safePath);
                if (!fs.existsSync(parentDir)) {
                    fs.mkdirSync(parentDir, { recursive: true });
                }

                if (file.isBase64) {
                    const buffer = Buffer.from(file.content, 'base64');
                    fs.writeFileSync(safePath, buffer);
                } else {
                    const safety = sandbox.inspectSafety(file.content || '');
                    if (!safety.safe) {
                        return sendJson(res, 403, { error: `Security check: ${safety.reason}` });
                    }
                    fs.writeFileSync(safePath, file.content || '', 'utf8');
                }
                savedFiles.push(file.name);

                if (file.name.toLowerCase().endsWith('.zip')) {
                    supervisor.appendLog(botId, `container@bot-hosting:~$ 📦 Unpacking zip archive "${file.name}"...`);
                    const extractCmd = process.platform === 'win32'
                        ? `powershell -NoProfile -Command "Expand-Archive -Path '${safePath}' -DestinationPath '${botDir}' -Force"`
                        : `unzip -o "${safePath}" -d "${botDir}"`;

                    exec(extractCmd, (zipErr) => {
                        if (zipErr) {
                            supervisor.appendLog(botId, `container@bot-hosting:~$ Zip extraction notice: ${zipErr.message}`);
                        } else {
                            supervisor.appendLog(botId, `container@bot-hosting:~$ ✅ Successfully extracted files from ${file.name}!`);
                        }
                    });
                }
            }

            supervisor.appendLog(botId, `container@bot-hosting:~$ 📁 Uploaded ${savedFiles.length} file(s): ${savedFiles.join(', ')}`);
            return sendJson(res, 200, { success: true, count: savedFiles.length, files: savedFiles });
        }

        // 5. Server Power Operations
        const botActionMatch = pathname.match(/^\/api\/bots\/([a-zA-Z0-9_-]+)\/(start|stop|restart|kill)$/);
        if (method === 'POST' && botActionMatch) {
            const botId = botActionMatch[1];
            const action = botActionMatch[2];

            if (action === 'start') {
                const result = supervisor.startBot(botId);
                return sendJson(res, 200, result);
            }
            if (action === 'stop') {
                const result = supervisor.stopBot(botId);
                return sendJson(res, 200, result);
            }
            if (action === 'restart') {
                const result = await supervisor.restartBot(botId);
                return sendJson(res, 200, result);
            }
            if (action === 'kill') {
                const result = supervisor.killBot(botId);
                return sendJson(res, 200, result);
            }
        }

        // 6. Terminal Console Command
        const botCommandMatch = pathname.match(/^\/api\/bots\/([a-zA-Z0-9_-]+)\/command$/);
        if (method === 'POST' && botCommandMatch) {
            const botId = botCommandMatch[1];
            const body = await parseBody(req);
            if (!body.command) return sendJson(res, 400, { error: 'Command missing' });
            try {
                const result = supervisor.sendCommand(botId, body.command);
                return sendJson(res, 200, result);
            } catch (cmdErr) {
                return sendJson(res, 400, { error: cmdErr.message });
            }
        }

        // 7. Delete Server
        const botDeleteMatch = pathname.match(/^\/api\/bots\/([a-zA-Z0-9_-]+)$/);
        if (method === 'DELETE' && botDeleteMatch) {
            const botId = botDeleteMatch[1];
            supervisor.deleteBot(botId);
            return sendJson(res, 200, { success: true });
        }

        // 8. Live Log Stream (SSE)
        const logStreamMatch = pathname.match(/^\/api\/bots\/([a-zA-Z0-9_-]+)\/logs\/stream$/);
        if (method === 'GET' && logStreamMatch) {
            const botId = logStreamMatch[1];
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });

            const existing = supervisor.getLogs(botId);
            res.write(`data: ${JSON.stringify({ initial: true, logs: existing })}\n\n`);

            if (!sseClients.has(botId)) {
                sseClients.set(botId, new Set());
            }
            sseClients.get(botId).add(res);

            req.on('close', () => {
                if (sseClients.has(botId)) {
                    sseClients.get(botId).delete(res);
                }
            });
            return;
        }

        // 9. Files List & Delete
        const listFilesMatch = pathname.match(/^\/api\/bots\/([a-zA-Z0-9_-]+)\/files$/);
        if (listFilesMatch) {
            const botId = listFilesMatch[1];

            if (method === 'GET') {
                const botDir = sandbox.resolveSafePath(botId);
                const filesList = [];
                if (fs.existsSync(botDir)) {
                    const entries = fs.readdirSync(botDir, { withFileTypes: true });
                    for (const entry of entries) {
                        try {
                            const fullPath = path.join(botDir, entry.name);
                            const stat = fs.statSync(fullPath);
                            filesList.push({
                                name: entry.name,
                                isDirectory: entry.isDirectory(),
                                size: stat.size,
                                updatedAt: stat.mtime
                            });
                        } catch (e) {}
                    }
                }
                return sendJson(res, 200, { files: filesList });
            }

            if (method === 'DELETE') {
                const filename = parsedUrl.query.name;
                if (!filename) return sendJson(res, 400, { error: 'Filename missing' });
                const safePath = sandbox.resolveSafePath(botId, filename);
                if (fs.existsSync(safePath)) {
                    if (fs.statSync(safePath).isDirectory()) {
                        fs.rmSync(safePath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(safePath);
                    }
                }
                return sendJson(res, 200, { success: true });
            }
        }

        // 10. Single File Read/Write
        const fileMatch = pathname.match(/^\/api\/bots\/([a-zA-Z0-9_-]+)\/file$/);
        if (fileMatch) {
            const botId = fileMatch[1];

            if (method === 'GET') {
                const filename = parsedUrl.query.name || 'index.js';
                const safePath = sandbox.resolveSafePath(botId, filename);
                const content = fs.existsSync(safePath) ? fs.readFileSync(safePath, 'utf8') : '';
                return sendJson(res, 200, { filename, content });
            }

            if (method === 'POST') {
                const body = await parseBody(req);
                const { filename, content } = body;
                if (!filename || typeof content !== 'string') {
                    return sendJson(res, 400, { error: 'Invalid filename or content' });
                }

                const safety = sandbox.inspectSafety(content);
                if (!safety.safe) {
                    return sendJson(res, 403, { error: safety.reason });
                }

                const safePath = sandbox.resolveSafePath(botId, filename);
                fs.writeFileSync(safePath, content, 'utf8');
                return sendJson(res, 200, { success: true });
            }
        }

        // Static UI
        let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const mimeTypes = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.svg': 'image/svg+xml',
                '.png': 'image/png'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            return fs.createReadStream(filePath).pipe(res);
        }

        sendJson(res, 404, { error: 'Route not found' });
    } catch (err) {
        console.error('Server error:', err);
        sendJson(res, 500, { error: err.message });
    }
});

// Safe Port Listening with EADDRINUSE auto-fallback
function listenServer(portToUse) {
    server.listen(portToUse, () => {
        console.log(`
====================================================================
🤖 BOT-HOSTING.NET — DISCORD BOT HOSTING CLOUD (24/7)
====================================================================
🚀 Web Dashboard:          http://localhost:${portToUse}
⚡ Hardware Allocation:    UNLIMITED (All CPU Cores & V8 Heap Unconstrained)
🔒 Security Sandbox:       ACTIVE (Zero-Bypass Protected)
💓 24/7 Watchdog:          ACTIVE (Never Goes Offline)
====================================================================
        `);
    });
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`[Port Notice] Port ${PORT} is occupied. Switching to port ${Number(PORT) + 1}...`);
        PORT = Number(PORT) + 1;
        listenServer(PORT);
    } else {
        console.error('Fatal Server error:', err);
    }
});

listenServer(PORT);
