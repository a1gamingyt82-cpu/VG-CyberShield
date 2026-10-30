// Prefix router: "." commands -> sahi module
const antinukeCmds = require('./modules/antinukeCmds');
const automod = require('./modules/automod');
const automation = require('./modules/automation');
const autoresponder = require('./modules/autoresponder');
const access = require('./modules/access');
const customrole = require('./modules/customrole');
const games = require('./modules/games');
const giveaway = require('./modules/giveaway');
const info = require('./modules/info');
const moderation = require('./modules/moderation');
const music = require('./modules/music');
const premium = require('./modules/premium');
const ticket = require('./modules/ticket');
const util = require('./modules/util');
const voice = require('./modules/voice');
const welcome = require('./modules/welcome');

const ORDER = [antinukeCmds, automod, automation, autoresponder, access, customrole, games, giveaway, info, moderation, music, premium, ticket, util, voice, welcome];

async function route(msg, client) {
  const { getGuild } = require('./store');
  const cfg = getGuild(msg.guild.id);
  const prefix = cfg.prefix || '.';
  if (!msg.content.startsWith(prefix)) return false;
  const raw = msg.content.slice(prefix.length).trim();
  if (!raw) return false;
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = [cmd, ...parts.slice(1)];
  for (const mod of ORDER) {
    try {
      const handled = await mod.run(msg, args, client);
      if (handled) return true;
    } catch (e) { console.log('cmd err', cmd, e.message); }
  }
  return false;
}

module.exports = { route };
