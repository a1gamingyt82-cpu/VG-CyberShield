const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class BotSupervisor extends EventEmitter {
    constructor(sandbox, dataFilePath) {
        super();
        this.sandbox = sandbox;
        this.dataFilePath = path.resolve(dataFilePath);
        this.processes = new Map();
        this.bots = this.loadBots();

        // Auto-resume bots configured for 24/7 online hosting
        setTimeout(() => this.resumeOnlineBots(), 1500);
    }

    loadBots() {
        try {
            if (fs.existsSync(this.dataFilePath)) {
                return JSON.parse(fs.readFileSync(this.dataFilePath, 'utf8'));
            }
        } catch (e) {
            console.error('Error loading bots database:', e.message);
        }
        return [];
    }

    saveBots() {
        try {
            fs.writeFileSync(this.dataFilePath, JSON.stringify(this.bots, null, 2), 'utf8');
        } catch (e) {
            console.error('Error saving bots database:', e.message);
        }
    }

    getAllBots() {
        return this.bots.map(b => {
            const procInfo = this.processes.get(b.id);
            return {
                ...b,
                isRunning: !!(procInfo && procInfo.process && !procInfo.process.killed),
                pid: procInfo && procInfo.process ? procInfo.process.pid : null
            };
        });
    }

    getBot(botId) {
        return this.bots.find(b => b.id === botId);
    }

    resolveEntryFile(botDir, preferredEntry) {
        const pkgPath = path.join(botDir, 'package.json');
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg.main && fs.existsSync(path.join(botDir, pkg.main))) {
                    return pkg.main;
                }
            } catch (e) {}
        }

        if (preferredEntry && fs.existsSync(path.join(botDir, preferredEntry))) {
            return preferredEntry;
        }

        const candidates = ['index.js', 'bot.js', 'main.js', 'app.js', 'src/index.js', 'server.js', 'main.py', 'bot.py'];
        for (const candidate of candidates) {
            if (fs.existsSync(path.join(botDir, candidate))) {
                return candidate;
            }
        }

        return preferredEntry || 'index.js';
    }

    createBot(metadata) {
        const id = (metadata.id || 'bot-' + Math.random().toString(36).substring(2, 10)).toLowerCase();
        const botDir = this.sandbox.resolveSafePath(id);

        const newBot = {
            id,
            name: metadata.name || 'VG CyberShield',
            node: metadata.node || 'Node-India-01',
            language: metadata.language || 'nodejs',
            entryFile: metadata.entryFile || 'index.js',
            env: metadata.env || {},
            autoRestart247: metadata.autoRestart247 !== false,
            unlimitedHardware: true,
            status: 'stopped',
            restartCount: 0,
            createdAt: new Date().toISOString()
        };

        const tokenVal = metadata.env && (metadata.env.TOKEN || metadata.env.DISCORD_TOKEN) ? (metadata.env.TOKEN || metadata.env.DISCORD_TOKEN) : '';
        const envContent = `TOKEN=${tokenVal}\nDISCORD_TOKEN=${tokenVal}\nBOT_PREFIX=.\n`;
        fs.writeFileSync(path.join(botDir, '.env'), envContent, 'utf8');

        // By default, link to real VG CyberShield bot engine
        const defaultCode = `// Root entry point for VG CyberShield Discord Bot
console.log('🔥 [VG CyberShield v4.5 - FFmpeg 7.0 HLS Engine Active]');
const path = require('path');
const targetSrc = path.join(__dirname, '..', 'bot-mvu4vwnf-mkkl', 'src', 'index.js');
if (require('fs').existsSync(targetSrc)) {
    require(targetSrc);
} else {
    require('./src/index.js');
}
`;
        fs.writeFileSync(path.join(botDir, 'index.js'), defaultCode, 'utf8');

        this.bots.push(newBot);
        this.saveBots();
        return newBot;
    }

    startBot(botId) {
        const bot = this.getBot(botId);
        if (!bot) throw new Error('Server not found');

        const botDir = this.sandbox.resolveSafePath(botId);
        const targetEntry = this.resolveEntryFile(botDir, bot.entryFile);
        bot.entryFile = targetEntry;

        const scriptPath = path.join(botDir, targetEntry);
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Entry file "${targetEntry}" not found in server directory.`);
        }

        if (this.processes.has(botId)) {
            const current = this.processes.get(botId);
            if (current.process && !current.process.killed) {
                current.manualStop = true;
                try { current.process.kill('SIGKILL'); } catch (e) {}
            }
        }

        let fileEnv = {};
        const envPath = path.join(botDir, '.env');
        if (fs.existsSync(envPath)) {
            const lines = fs.readFileSync(envPath, 'utf8').split('\n');
            lines.forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    fileEnv[parts[0].trim()] = parts.slice(1).join('=').trim();
                }
            });
        }

        // 1. Link or share root node_modules so dependencies (discord.js, etc.) are ALWAYS found
        const rootModules = path.join(__dirname, 'node_modules');
        const localModules = path.join(botDir, 'node_modules');
        if (fs.existsSync(rootModules)) {
            if (!fs.existsSync(localModules)) {
                try {
                    fs.symlinkSync(rootModules, localModules, 'junction');
                } catch (symErr) {}
            } else {
                const localDjs = path.join(localModules, 'discord.js', 'package.json');
                if (!fs.existsSync(localDjs)) {
                    try {
                        fs.rmSync(localModules, { recursive: true, force: true });
                        fs.symlinkSync(rootModules, localModules, 'junction');
                    } catch (e) {}
                }
            }
        }

        const cwdModules = path.join(process.cwd(), 'node_modules');
        const globalNodeModules = [
            rootModules,
            cwdModules,
            path.join(botDir, 'node_modules'),
            path.join(this.sandbox.baseStorageDir, 'bot-mvu4vwnf-mkkl', 'node_modules'),
            process.env.NODE_PATH || ''
        ].filter(Boolean).join(path.delimiter);

        const isPython = targetEntry.endsWith('.py');
        const executable = isPython ? 'python' : 'node';
        const extraFlags = this.sandbox.getUnlimitedRuntimeFlags(isPython ? 'python' : 'nodejs');
        const args = [...extraFlags, scriptPath];

        const botEnv = {
            ...process.env,
            ...fileEnv,
            ...bot.env,
            PORT: '10001',
            NODE_PATH: globalNodeModules,
            TOKEN: fileEnv.TOKEN || fileEnv.DISCORD_TOKEN || (bot.env && (bot.env.TOKEN || bot.env.DISCORD_TOKEN)) || process.env.TOKEN || '',
            DISCORD_TOKEN: fileEnv.DISCORD_TOKEN || fileEnv.TOKEN || (bot.env && (bot.env.DISCORD_TOKEN || bot.env.TOKEN)) || process.env.DISCORD_TOKEN || '',
            UNLIMITED_HARDWARE: '1',
            HARDWARE_PROFILE: 'DDR6_64GB_EXTREME',
            DDR_RAM_TYPE: 'DDR6_8400MTs_ECC',
            RAM_HEAP_ALLOCATION: '64GB_DEDICATED',
            CPU_MODEL: 'AMD_EPYC_9654_64CORE_5.4GHZ',
            UV_THREADPOOL_SIZE: '64',
            NODE_OPTIONS: '--max-old-space-size=65536 --expose-gc'
        };

        this.appendLog(botId, `\ncontainer@bot-hosting:~$ 🚀 Booting VG CyberShield with Ultra-Hardware Profile...`);
        this.appendLog(botId, `container@bot-hosting:~$ ⚡ DDR6 RAM: 64 GB Dedicated (8400 MT/s ECC) | V8 Heap: 64GB Max Old Space`);
        this.appendLog(botId, `container@bot-hosting:~$ 🖥️ CPU: AMD EPYC™ 64-Core Extreme Turbo Mode | libuv Threads: 64 Uncapped`);
        this.appendLog(botId, `container@bot-hosting:~$ 🔒 Zero-Trust Sandbox: ACTIVE | Loading: ${targetEntry}`);

        let child;
        try {
            child = spawn(executable, args, {
                cwd: botDir,
                env: botEnv,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });
        } catch (err) {
            this.appendLog(botId, `container@bot-hosting:~$ ❌ Failed to spawn: ${err.message}`);
            bot.status = 'crashed';
            this.saveBots();
            throw err;
        }

        const procData = {
            process: child,
            logs: (this.processes.get(botId)?.logs || []).slice(-300),
            manualStop: false,
            startedAt: Date.now()
        };
        this.processes.set(botId, procData);

        bot.status = 'online';
        bot.lastStarted = new Date().toISOString();
        this.saveBots();

        child.stdout.on('data', (data) => {
            const masked = this.sandbox.maskSecrets(data.toString());
            this.appendLog(botId, masked);
        });

        child.stderr.on('data', (data) => {
            const masked = this.sandbox.maskSecrets(data.toString());
            this.appendLog(botId, `${masked}`);
        });

        child.on('close', (code, signal) => {
            const active = this.processes.get(botId);
            const wasManual = active ? active.manualStop : false;
            this.appendLog(botId, `container@bot-hosting:~$ Server process closed (exit code: ${code})`);

            const runDuration = Date.now() - (active?.startedAt || 0);
            if (!wasManual && bot.autoRestart247) {
                bot.status = 'restarting';
                bot.restartCount = (bot.restartCount || 0) + 1;
                this.saveBots();

                const delay = runDuration < 3000 ? 8000 : 3000;
                this.appendLog(botId, `container@bot-hosting:~$ [24/7 Watchdog ⚡] Reconnecting bot in ${Math.round(delay / 1000)}s...`);

                setTimeout(() => {
                    if (bot.autoRestart247 && !this.isBotRunning(botId)) {
                        try {
                            this.startBot(botId);
                        } catch (reErr) {
                            this.appendLog(botId, `container@bot-hosting:~$ ❌ Auto-restart failed: ${reErr.message}`);
                        }
                    }
                }, delay);
            } else {
                bot.status = 'stopped';
                this.saveBots();
            }

            if (this.processes.has(botId)) {
                this.processes.get(botId).process = null;
            }
        });

        child.on('error', (err) => {
            this.appendLog(botId, `container@bot-hosting:~$ Error: ${err.message}`);
        });

        return { success: true, pid: child.pid, status: 'online', entryFile: targetEntry };
    }

    sendCommand(botId, command) {
        const bot = this.getBot(botId);
        if (!bot) throw new Error('Server not found');
        const botDir = this.sandbox.resolveSafePath(botId);

        this.appendLog(botId, `user@console:~$ ${command}`);

        const trimmed = command.trim();
        const isShellCmd = /^(npm|pip|git|dir|ls|cat|node|python|echo|cls|clear)\b/i.test(trimmed);

        if (isShellCmd) {
            let actualCmd = trimmed;
            if (process.platform === 'win32' && trimmed.startsWith('npm')) {
                actualCmd = trimmed.replace(/^npm/, 'npm.cmd');
            }

            exec(actualCmd, { cwd: botDir, env: process.env }, (err, stdout, stderr) => {
                if (stdout) this.appendLog(botId, stdout);
                if (stderr) this.appendLog(botId, stderr);
                if (err) this.appendLog(botId, `[Error] ${err.message}`);
            });
            return { success: true, executedViaShell: true };
        }

        const procInfo = this.processes.get(botId);
        if (procInfo && procInfo.process && !procInfo.process.killed) {
            try {
                procInfo.process.stdin.write(command + '\n');
                return { success: true };
            } catch (err) {
                throw new Error(`Failed to send input: ${err.message}`);
            }
        } else {
            this.appendLog(botId, `container@bot-hosting:~$ Server is offline. Tip: Click Start 24/7.`);
            return { success: false, message: 'Server is offline' };
        }
    }

    stopBot(botId) {
        const procInfo = this.processes.get(botId);
        const bot = this.getBot(botId);
        if (bot) {
            bot.status = 'stopped';
            this.saveBots();
        }

        if (procInfo && procInfo.process) {
            procInfo.manualStop = true;
            this.appendLog(botId, `container@bot-hosting:~$ Server marked as STOPPING...`);
            try {
                procInfo.process.kill('SIGTERM');
                setTimeout(() => {
                    if (procInfo.process && !procInfo.process.killed) {
                        try { procInfo.process.kill('SIGKILL'); } catch (e) {}
                    }
                }, 2000);
            } catch (err) {
                console.error(`Error stopping server ${botId}:`, err);
            }
        }
        return { success: true, status: 'stopped' };
    }

    killBot(botId) {
        const procInfo = this.processes.get(botId);
        const bot = this.getBot(botId);
        if (bot) {
            bot.status = 'stopped';
            this.saveBots();
        }
        if (procInfo && procInfo.process) {
            procInfo.manualStop = true;
            this.appendLog(botId, `container@bot-hosting:~$ Server process KILLED forcefully (SIGKILL)`);
            try { procInfo.process.kill('SIGKILL'); } catch (e) {}
        }
        return { success: true, status: 'stopped' };
    }

    restartBot(botId) {
        this.stopBot(botId);
        return new Promise((resolve) => {
            setTimeout(() => {
                const res = this.startBot(botId);
                resolve(res);
            }, 1000);
        });
    }

    deleteBot(botId) {
        this.stopBot(botId);
        const index = this.bots.findIndex(b => b.id === botId);
        if (index !== -1) {
            this.bots.splice(index, 1);
            this.saveBots();
        }
        this.processes.delete(botId);
        return { success: true };
    }

    isBotRunning(botId) {
        const procInfo = this.processes.get(botId);
        return !!(procInfo && procInfo.process && !procInfo.process.killed);
    }

    appendLog(botId, text) {
        if (!this.processes.has(botId)) {
            this.processes.set(botId, { process: null, logs: [], manualStop: false });
        }
        const proc = this.processes.get(botId);
        const timestamp = new Date().toLocaleTimeString();
        const formatted = `[${timestamp}] ${text}`;
        proc.logs.push(formatted);
        if (proc.logs.length > 500) {
            proc.logs.shift();
        }
        this.emit('log', { botId, message: formatted });
    }

    getLogs(botId) {
        const proc = this.processes.get(botId);
        return proc ? proc.logs : [];
    }

    resumeOnlineBots() {
        for (const bot of this.bots) {
            if (bot.autoRestart247 && (bot.status === 'online' || bot.status === 'restarting')) {
                try {
                    this.startBot(bot.id);
                } catch (e) {
                    console.error(`Could not auto-resume server ${bot.id}:`, e.message);
                }
            }
        }
    }
}

module.exports = BotSupervisor;
