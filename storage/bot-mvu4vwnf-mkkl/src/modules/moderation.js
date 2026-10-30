// Moderation: ban/unban/kick/timeout/untimeout/role/rrole/lock/unlock/lockall/purge/purgebots/nickname/steal/list/mod
const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { isMod, isAdmin, parseMember } = require('./helpers');
const { isWhitelisted, sendLog } = require('../antinuke');

async function run(msg, args) {
  const [cmd, ...rest] = args;
  const modOnly = () => { if (!isMod(msg.member)) { msg.reply('❌ No mod permission.'); return false; } return true; };
  const full = rest.join(' ');

  if (cmd === 'ban' || cmd === 'kick') {
    if (!modOnly()) return true;
    const { getGuild } = require('../store');
    const cfg = getGuild(msg.guild.id);
    const isOwner = msg.author.id === msg.guild.ownerId || require('../antinuke').isBotOwner(msg.author.id);
    if (cmd === 'ban' && cfg.onlyOwnerCanBan !== false && !isOwner) {
      return msg.reply(`❌ **Zero-Trust Security:** Sirf Main Server Owner (<@${msg.guild.ownerId}>) hi kisi member ko ban kar sakta hai! Koi bhi admin kisi ko ban nahi kar sakta.`), true;
    }
    if (cmd === 'ban' && !isWhitelisted(msg.guild, msg.author.id) && !isOwner) {
      return msg.reply('❌ **Bina-whitelist ban allowed nahi hai!** Chahe aapke paas Administrator role ho, kisi member ko ban karne ke liye aapka **whitelist** me hona zaroori hai (`.whitelist add @user`).'), true;
    }
    const member = await parseMember(msg.guild, rest[0]) || (msg.mentions.users.first() && await msg.guild.members.fetch(msg.mentions.users.first().id).catch(() => null));
    const reason = rest.slice(1).join(' ') || `By ${msg.author.tag}`;
    if (!member) return msg.reply(`\`.${cmd} <@user> [reason]\``), true;
    if (member.id === msg.author.id) return msg.reply('Not yourself.'), true;
    try {
      if (cmd === 'ban') await member.ban({ reason }); else await member.kick(reason);
      const em = new EmbedBuilder()
        .setTitle(`🔨 Member ${cmd.toUpperCase()}`)
        .setColor(cmd === 'ban' ? 0xff2222 : 0xf39c12)
        .addFields(
          { name: 'Target', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: 'Moderator', value: `${msg.author.tag} (\`${msg.author.id}\`)`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();
      sendLog(msg.guild, cfg, { embeds: [em] }, 'mod');
      return msg.reply(`✅ ${cmd}ed ${member.user.tag}.`), true;
    } catch { return msg.reply('❌ Failed — keep my role higher.'), true; }
  }
  if (cmd === 'unban') {
    if (!modOnly()) return true;
    const { getGuild } = require('../store');
    const cfg = getGuild(msg.guild.id);
    const id = (rest[0] || '').match(/\d{15,25}/)?.[0];
    if (!id) return msg.reply('`.unban <user-id>`'), true;
    try {
      await msg.guild.bans.remove(id);
      const em = new EmbedBuilder()
        .setTitle('🔓 Member Unbanned')
        .setColor(0x2ecc71)
        .addFields(
          { name: 'Target ID', value: `\`${id}\``, inline: true },
          { name: 'Moderator', value: `${msg.author.tag}`, inline: true }
        )
        .setTimestamp();
      sendLog(msg.guild, cfg, { embeds: [em] }, 'mod');
      return msg.reply('✅ Unbanned'), true;
    }
    catch { return msg.reply('❌ Failed'), true; }
  }
  if (cmd === 'timeout' || cmd === 'untimeout') {
    if (!modOnly()) return true;
    const { getGuild } = require('../store');
    const cfg = getGuild(msg.guild.id);
    const member = await parseMember(msg.guild, rest[0]);
    if (!member) return msg.reply('`.timeout <@user> [10m] [reason]` / `.untimeout <@user>`'), true;
    try {
      if (cmd === 'untimeout') {
        await member.timeout(null);
        const em = new EmbedBuilder()
          .setTitle('🔊 Timeout Removed')
          .setColor(0x2ecc71)
          .addFields(
            { name: 'Target', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: 'Moderator', value: `${msg.author.tag}`, inline: true }
          )
          .setTimestamp();
        sendLog(msg.guild, cfg, { embeds: [em] }, 'mod');
        return msg.reply('✅ Timeout removed'), true;
      }
      const durM = (rest[1] || '10m').match(/^(\d+)(s|m|h|d)$/);
      const ms = durM ? +durM[1] * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[durM[2]]) : 600000;
      const tReason = rest.slice(durM ? 2 : 1).join(' ') || 'Mod timeout';
      await member.timeout(Math.min(ms, 28 * 86400000), tReason);
      const em = new EmbedBuilder()
        .setTitle('⏳ Member Timed Out')
        .setColor(0x3498db)
        .addFields(
          { name: 'Target', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: 'Moderator', value: `${msg.author.tag}`, inline: true },
          { name: 'Duration', value: durM ? durM[0] : '10m', inline: true },
          { name: 'Reason', value: tReason }
        )
        .setTimestamp();
      sendLog(msg.guild, cfg, { embeds: [em] }, 'mod');
      return msg.reply(`✅ ${member} timed out`), true;
    } catch { return msg.reply('❌ Failed'), true; }
  }
  if (cmd === 'role' || cmd === 'rrole') {
    // moderation shortcut (like access module)
    if (!modOnly()) return true;
    const member = await parseMember(msg.guild, rest[0]);
    const role = msg.mentions.roles.first();
    if (!member || !role) return msg.reply('`.role <user> <role>` / `.rrole <user> <role>`'), true;
    try {
      if (cmd === 'role') await member.roles.add(role); else await member.roles.remove(role);
      return msg.reply('✅ Done'), true;
    } catch { return msg.reply('❌ Failed'), true; }
  }
  if (['lock', 'hide', 'unlock', 'unhide', 'lockall', 'hideall', 'unlockall', 'unhideall'].includes(cmd)) {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
    const { getGuild } = require('../store');
    const cfg = getGuild(msg.guild.id);
    const all = cmd.includes('all');
    const lock = cmd.startsWith('lock') || cmd.startsWith('hide');
    const targets = all ? [...msg.guild.channels.values()].filter(c => c.isTextBased() || c.isVoiceBased()) : [msg.mentions.channels.first() || msg.channel];
    for (const ch of targets) {
      try {
        if (ch.isTextBased()) {
          if (cmd.startsWith('hide')) await ch.permissionOverwrites.edit(msg.guild.roles.everyone, lock ? { ViewChannel: false } : { ViewChannel: null }).catch(() => {});
          else await ch.permissionOverwrites.edit(msg.guild.roles.everyone, lock ? { SendMessages: false } : { SendMessages: null }).catch(() => {});
        } else if (ch.isVoiceBased()) {
          await ch.permissionOverwrites.edit(msg.guild.roles.everyone, lock ? { Connect: false } : { Connect: null }).catch(() => {});
        }
      } catch {}
    }
    const em = new EmbedBuilder()
      .setTitle(`🔒 Channel ${cmd.toUpperCase()}`)
      .setColor(0x9b59b6)
      .addFields(
        { name: 'Moderator', value: `${msg.author.tag}`, inline: true },
        { name: 'Target Channels', value: `${targets.length} channels` }
      )
      .setTimestamp();
    sendLog(msg.guild, cfg, { embeds: [em] }, 'mod');
    return msg.reply(`✅ ${cmd} done (${targets.length})`), true;
  }
  if (cmd === 'purge' || cmd === 'purgebots') {
    if (!modOnly()) return true;
    const { getGuild } = require('../store');
    const cfg = getGuild(msg.guild.id);
    const n = Math.min(Math.max(parseInt(rest[0]) || 10, 1), 100);
    try {
      const fetched = await msg.channel.messages.fetch({ limit: n });
      const list = cmd === 'purgebots' ? fetched.filter(m => m.author.bot) : fetched;
      await msg.channel.bulkDelete(list, true).catch(() => {});
      const em = new EmbedBuilder()
        .setTitle('🧹 Messages Purged')
        .setColor(0x95a5a6)
        .addFields(
          { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true },
          { name: 'Moderator', value: `${msg.author.tag}`, inline: true },
          { name: 'Count', value: `${list.size} messages` }
        )
        .setTimestamp();
      sendLog(msg.guild, cfg, { embeds: [em] }, 'mod');
      const w = await msg.channel.send(`🧹 Cleared ${list.size} msgs`).catch(() => null);
      if (w) setTimeout(() => w.delete().catch(() => {}), 4000);
      return true;
    } catch { return msg.reply('❌ Failed (messages older than 14 days cannot be bulk-deleted)'), true; }
  }
  if (cmd === 'nickname') {
    if (!modOnly()) return true;
    const member = await parseMember(msg.guild, rest[0]);
    const nick = rest.slice(1).join(' ').slice(0, 32) || null;
    if (!member) return msg.reply('`.nickname <@user> [name]`'), true;
    await member.setNickname(nick).catch(() => {});
    return msg.reply('✅ Nickname set'), true;
  }
  if (cmd === 'steal') {
    if (!modOnly()) return true;
    const emoji = rest[0]?.match(/<(a)?:(\w+):(\d+)>/) || full.match(/https?:\S+\.(png|jpg|jpeg|gif|webp)/);
    try {
      if (rest[0]?.startsWith('<')) {
        const m = rest[0].match(/<(a)?:(\w+):(\d+)>/);
        const url = `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'png'}`;
        const e = await msg.guild.emojis.create({ attachment: url, name: m[2] });
        return msg.reply(`✅ Emoji stolen: ${e}`), true;
      }
      const url = full.match(/https?:\S+/)?.[0];
      if (!url) return msg.reply('`.steal <emoji> [name]` or `.steal <image-url> <name>`'), true;
      const name = (rest[1] || 'stolen').replace(/\W/g, '').slice(0, 20) || 'stolen';
      const e = await msg.guild.emojis.create({ attachment: url, name });
      return msg.reply(`✅ Emoji add: ${e}`), true;
    } catch { return msg.reply('❌ Failed (check slots/permissions/size)'), true; }
  }
  if (cmd === 'list' || cmd === 'mod') {
    if (!modOnly()) return true;
    const bans = await msg.guild.bans.fetch().catch(() => new Map());
    return msg.reply(`🔨 **Mod Dashboard**\nBans: \`${bans.size}\` | Members: \`${msg.guild.memberCount}\`\nTimed out: \`${msg.guild.members.cache.filter(m => m.isCommunicationDisabled()).size}\``), true;
  }
  return null;
}
module.exports = { run };
