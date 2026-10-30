// Premium: .antialt / .nightmode / .premium / .resetbotavatar / .resetbotbanner / .setbotavatar / .setbotbanner
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');
const { isBotOwner } = require('../antinuke');

async function run(msg, args) {
  const [cmd, sub, ...rest] = args;
  if (cmd === 'premium') {
    return msg.reply('💎 **Premium** — `.antialt [on/off] [days]` `.nightmode <@role>` `.setbotavatar <url>` `.setbanner <image>` (bot-owner only)'), true;
  }
  if (cmd === 'antialt') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
    const cfg = getGuild(msg.guild.id);
    if (sub === 'off') { cfg.antialt.enabled = false; saveGuild(msg.guild.id, cfg); return msg.reply('✅ Anti-alt OFF'), true; }
    const days = parseInt(rest[0]) || parseInt(sub) || 7;
    cfg.antialt = { enabled: true, minDays: days };
    saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ Anti-alt ON — accounts newer than ${days} days will be auto-kicked`), true;
  }
  if (cmd === 'nightmode') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
    const cfg = getGuild(msg.guild.id);
    const role = msg.mentions.roles.first();
    if (!role && sub !== 'off') return msg.reply('`.nightmode <@role>` — gives everyone this role at night (like a chat mute). `.nightmode off` to disable.'), true;
    if (sub === 'off') { cfg.nightmode = null; saveGuild(msg.guild.id, cfg); return msg.reply('✅ Nightmode OFF'), true; }
    cfg.nightmode = { roleId: role.id };
    saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ Nightmode role: ${role} (currently manual: add with \`.massrole all add @role\` at night, remove in the morning)`), true;
  }
  if (['setbotavatar', 'setlogo', 'setbotbanner', 'resetbotavatar', 'removelogo', 'resetbotbanner'].includes(cmd)) {
    if (!isBotOwner(msg.author.id)) return msg.reply('❌ Bot owner only (put your ID in .env).'), true;
    try {
      if (cmd === 'setbotavatar' || cmd === 'setlogo') {
        const url = rest[0] || msg.attachments.first()?.url;
        if (!url) return msg.reply('`.setlogo <image-url>` — ya image attach karke `.setlogo` likho.'), true;
        await msg.client.user.setAvatar(url);
        return msg.reply('✅ Bot logo (avatar) change'), true;
      }
      if (cmd === 'resetbotavatar' || cmd === 'removelogo') { await msg.client.user.setAvatar(null); return msg.reply('✅ Logo reset'), true; }
      if (cmd === 'setbotbanner' || cmd === 'resetbotbanner') return msg.reply('⚠️ Banners require a verified bot + API access.'), true;
    } catch { return msg.reply('❌ Failed (check rate-limit/image)'), true; }
  }
  return null;
}

// alt check on join
async function checkAlt(member) {
  const { getGuild } = require('../store');
  const cfg = getGuild(member.guild.id);
  if (!cfg.antialt?.enabled) return;
  const ageDays = (Date.now() - member.user.createdTimestamp) / 86400000;
  if (ageDays < (cfg.antialt.minDays || 7)) {
    try { await member.kick(`[AntiAlt] Account only ${ageDays.toFixed(1)} days old`).catch(() => {}); } catch {}
    try {
      const ch = member.guild.systemChannel;
      if (ch) ch.send(`🚫 Alt blocked: \`${member.user.tag}\` (${ageDays.toFixed(1)} days old) kicked.`).catch(() => {});
    } catch {}
  }
}

module.exports = { run, checkAlt };
