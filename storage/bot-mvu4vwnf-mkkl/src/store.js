// JSON store - sab modules ka data
const fs = require('fs');
const path = require('path');
const baseConfig = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const GUILD_FILE = path.join(DATA_DIR, 'guilds.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(GUILD_FILE)) fs.writeFileSync(GUILD_FILE, JSON.stringify({}, null, 2));
}
ensureFiles();

function readAll() {
  try { return JSON.parse(fs.readFileSync(GUILD_FILE, 'utf8') || '{}'); }
  catch { return {}; }
}
function writeAll(d) { fs.writeFileSync(GUILD_FILE, JSON.stringify(d, null, 2)); }

function deepMerge(base, over) {
  if (Array.isArray(base)) return over ?? base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const k of Object.keys(over || {})) {
      // Prototype Pollution Shield: block dangerous keys
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]))
        ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
  }
  return over ?? base;
}

function getGuild(guildId) {
  const all = readAll();
  const fresh = JSON.parse(JSON.stringify(baseConfig.defaults));
  if (!all[guildId]) { all[guildId] = fresh; writeAll(all); return all[guildId]; }
  all[guildId] = deepMerge(fresh, all[guildId]);
  return all[guildId];
}

function saveGuild(guildId, cfg) {
  const all = readAll();
  all[guildId] = cfg;
  writeAll(all);
}

module.exports = { getGuild, saveGuild, BACKUP_DIR, DATA_DIR };
