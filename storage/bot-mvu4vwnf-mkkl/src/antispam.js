// Link / @everyone / webhook-spam protection
const { getGuild } = require('./store');

const LINK_RE = /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

function hasBadLink(content, allowList = []) {
  if (!LINK_RE.test(content)) return false;
  const low = content.toLowerCase();
  for (const a of allowList) if (low.includes(a.toLowerCase())) return false;
  return true;
}

async function handleMessage(message) {
  if (!message.guild || message.author.bot) return;
  const cfg = getGuild(message.guild.id);
  if (!cfg.enabled) return;
  const mem = message.member;
  if (!mem) return;
  if (cfg.whitelist?.includes(message.author.id)) return;
  if (mem.permissions.has('Administrator')) return;

  // 1. ANTI-LINK -> timeout
  if (cfg.antiLink && hasBadLink(message.content, cfg.linkAllowList)) {
    try { await message.delete().catch(() => {}); } catch {}
    try {
      await mem.timeout(cfg.linkTimeoutMin * 60 * 1000, '[AntiNuke] Links are not allowed').catch(() => {});
      message.channel.send(`⏳ <@${message.author.id}> timed out for **${cfg.linkTimeoutMin} min** (links not allowed).`).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
    } catch {}
    return;
  }

  // 2. ANTI @everyone/@here MASS MENTION -> timeout
  if (cfg.antiEveryone && (message.content.includes('@everyone') || message.content.includes('@here') || message.mentions.users.size >= 5)) {
    if (!mem.permissions.has('MentionEveryone')) {
      try { await message.delete().catch(() => {}); } catch {}
      try {
        await mem.timeout(cfg.everyoneTimeoutMin * 60 * 1000, '[AntiNuke] Mass mention spam').catch(() => {});
        message.channel.send(`⏳ <@${message.author.id}> timed out for **${cfg.everyoneTimeoutMin} min** (mass mention).`).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
      } catch {}
    }
  }
}

module.exports = { handleMessage };
