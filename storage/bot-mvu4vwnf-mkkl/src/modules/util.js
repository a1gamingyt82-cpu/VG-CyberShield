// Util: afk/avatar/banner/bi/musicrole/musicvc/prefix/report/roles/serverinfo/snipe/stats/steal/upi/userinfo
const { EmbedBuilder } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin, parseMember } = require('./helpers');

async function run(msg, args, client) {
  const [cmd, ...rest] = args;
  const cfg = getGuild(msg.guild.id);

  if (cmd === 'afk') {
    cfg.afk[msg.author.id] = { reason: rest.join(' ') || 'AFK', since: Date.now() };
    saveGuild(msg.guild.id, cfg);
    try { await msg.member.setNickname(`[AFK] ${msg.member.displayName}`.slice(0, 32)).catch(() => {}); } catch {}
    return msg.reply(`💤 AFK: ${cfg.afk[msg.author.id].reason}`), true;
  }
  if (cmd === 'avatar') {
    const u = msg.mentions.users.first() || msg.author;
    return msg.reply({ embeds: [new EmbedBuilder().setTitle(`${u.tag}`).setImage(u.displayAvatarURL({ size: 512 })).setColor(0x00ccff)] }), true;
  }
  if (cmd === 'banner') {
    const u = msg.mentions.users.first() || msg.author;
    try {
      const f = await client.users.fetch(u.id, { force: true });
      const b = f.bannerURL({ size: 512 });
      return msg.reply(b ? { embeds: [new EmbedBuilder().setImage(b).setColor(0x00ccff)] } : 'No banner.'), true;
    } catch { return msg.reply('Banner not found.'), true; }
  }
  if (cmd === 'bi' || cmd === 'stats') {
    const g = msg.guild;
    const em = new EmbedBuilder().setTitle(`📊 ${g.name}`).setColor(0x00ccff)
      .setThumbnail(g.iconURL())
      .setDescription(`Members: \`${g.memberCount}\` | Roles: \`${g.roles.cache.size}\` | Channels: \`${g.channels.cache.size}\`\nBoost: \`${g.premiumTier}\` (${g.premiumSubscriptionCount || 0}) | Owner: <@${g.ownerId}>\nBot ping: \`${client.ws.ping}ms\` | Uptime: \`${Math.floor(process.uptime() / 60)}m\``);
    return msg.reply({ embeds: [em] }), true;
  }
  if (cmd === 'serverinfo') {
    const g = msg.guild;
    return msg.reply({ embeds: [new EmbedBuilder().setTitle(g.name).setThumbnail(g.iconURL()).setColor(0x00ccff)
      .setDescription(`ID: \`${g.id}\`\nCreated: <t:${Math.floor(g.createdTimestamp / 1000)}:R>\nMembers: \`${g.memberCount}\`\nChannels: \`${g.channels.cache.size}\` Roles: \`${g.roles.cache.size}\`\nEmojis: \`${g.emojis.cache.size}\``)] }), true;
  }
  if (cmd === 'userinfo') {
    const m = (msg.mentions.members.first() || msg.member);
    return msg.reply({ embeds: [new EmbedBuilder().setTitle(m.user.tag).setThumbnail(m.displayAvatarURL()).setColor(0x00ccff)
      .setDescription(`ID: \`${m.id}\`\nJoin: <t:${Math.floor((m.joinedTimestamp || Date.now()) / 1000)}:R>\nAccount: <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>\nRoles: ${m.roles.cache.map(r => r.toString()).slice(0, 10).join(' ')}`)] }), true;
  }
  if (cmd === 'roles') {
    return msg.reply(msg.guild.roles.cache.map(r => r.toString()).join(' ').slice(0, 1800) || '—'), true;
  }
  if (cmd === 'snipe') {
    const s = cfg.snipeCache?.[msg.channel.id];
    if (!s) return msg.reply('No deleted message found.'), true;
    return msg.reply({ embeds: [new EmbedBuilder().setAuthor({ name: s.author }).setDescription(s.content || '(was an embed/image)').setFooter({ text: 'deleted message' }).setColor(0xffaa00)] }), true;
  }
  if (cmd === 'steal') return null; // handled by moderation.js
  if (cmd === 'prefix') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply(`Prefix: \`${cfg.prefix}\``), true;
    const np = rest[0];
    if (!np) return msg.reply(`Prefix: \`${cfg.prefix}\` — change: \`.prefix !\``), true;
    cfg.prefix = np; saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ Prefix = \`${np}\``), true;
  }
  if (cmd === 'report') {
    const target = msg.mentions.users.first();
    const reason = rest.slice(1).join(' ') || rest.join(' ');
    if (!target) return msg.reply('`.report <@user> <reason>`'), true;
    const ch = cfg.serverlog ? msg.guild.channels.cache.get(cfg.serverlog) : null;
    const text = `🚨 Report: <@${msg.author.id}> reported <@${target.id}> — ${reason}`;
    if (ch) ch.send(text).catch(() => {});
    return msg.reply('✅ Report sent to mods.'), true;
  }
  if (cmd === 'upi') {
    if (rest[0]?.toLowerCase() === 'set') {
      if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
      const vpa = rest[1];
      const name = rest.slice(2).join(' ') || 'VG CHEATS SHOP';
      if (!vpa || !vpa.includes('@')) return msg.reply('❌ Format: `.upi set <vpa_id> [merchant/shop name]`\n*Example:* `.upi set example@paytm VG CHEATS SHOP`'), true;
      cfg.upi = { vpa, name };
      saveGuild(msg.guild.id, cfg);
      return msg.reply(`✅ **UPI Configured Successfully:**\n• **UPI ID:** \`${vpa}\`\n• **Payee Name:** \`${name}\`\n\nYou can now generate QR codes with custom amounts: \`.upi <amount> [optional note]\` (e.g. \`.upi 150\`)`), true;
    }
    if (rest[0]?.toLowerCase() === 'reset') {
      if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
      cfg.upi = { vpa: '', name: 'VG CHEATS' };
      saveGuild(msg.guild.id, cfg);
      return msg.reply('✅ UPI configuration has been reset.'), true;
    }
    if (!cfg.upi?.vpa) {
      return msg.reply('❌ **UPI ID is not configured!**\nAdmins can set it using: `.upi set <upi_id> [Shop/Name]`\n*Example:* `.upi set yourname@paytm VG CHEATS SHOP`'), true;
    }
    const amount = parseFloat(rest[0]);
    if (isNaN(amount) || amount <= 0) {
      const em = new EmbedBuilder()
        .setTitle('💸 VG Shop — UPI Payment Info')
        .setColor(0x00ccff)
        .setDescription(`• **UPI ID:** \`${cfg.upi.vpa}\`\n• **Payee Name:** \`${cfg.upi.name || 'VG CHEATS'}\`\n\n**To generate a dynamic QR code with price:**\n\`${cfg.prefix}upi <amount> [optional note]\`\n*Example:* \`${cfg.prefix}upi 150\` or \`${cfg.prefix}upi 499 VIP Key\`\n\n*(Admin can update UPI using: \`${cfg.prefix}upi set <upi_id> [Name]\`)*`);
      return msg.reply({ embeds: [em] }), true;
    }
    const note = rest.slice(1).join(' ') || 'VG CHEATS Payment';
    const upiUri = `upi://pay?pa=${encodeURIComponent(cfg.upi.vpa)}&pn=${encodeURIComponent(cfg.upi.name || 'VG CHEATS')}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(upiUri)}`;
    const em = new EmbedBuilder()
      .setTitle(`💸 Scan & Pay — ₹${amount}`)
      .setColor(0x00cc88)
      .setDescription(`**Scan this QR code using Google Pay, PhonePe, Paytm, or any UPI app to pay ₹${amount} directly!**\n\n` +
        `💰 **Amount:** \`₹${amount}\`\n` +
        `💳 **UPI ID:** \`${cfg.upi.vpa}\` *(Tap to copy)*\n` +
        `👤 **Payee:** **${cfg.upi.name || 'VG CHEATS'}**\n` +
        (rest.length > 1 ? `📝 **Note:** \`${note}\`\n\n` : '\n') +
        `📲 **Supported Apps:** PhonePe, Google Pay, Paytm, BHIM, CRED, Amazon Pay\n` +
        `⚡ *After payment, please share a screenshot of the transaction ID for instant confirmation!*`)
      .setImage(qrUrl)
      .setFooter({ text: 'VG CHEATS SHOP • Instant UPI QR' })
      .setTimestamp();
    return msg.reply({ embeds: [em] }), true;
  }
  if (cmd === 'musicrole' || (cmd === 'remove' && rest[0]?.toLowerCase() === 'musicrole')) {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
    const subArgs = cmd === 'remove' ? rest.slice(1) : rest;
    const sub = subArgs[0]?.toLowerCase();

    // Check if target member is mentioned to remove role from a specific user
    const targetMember = msg.mentions.members.first() || (subArgs[1] ? await msg.guild.members.fetch(subArgs[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
    if (targetMember && (['remove', 'reset', 'del'].includes(sub) || cmd === 'remove')) {
      if (!cfg.musicrole) return msg.reply('❌ No music role is configured on this server.'), true;
      await targetMember.roles.remove(cfg.musicrole, 'Removed music control role by admin').catch(() => {});
      return msg.reply(`✅ Removed <@&${cfg.musicrole}> role from ${targetMember}.`), true;
    }

    if (['reset', 'remove', 'clear', 'none'].includes(sub) || (cmd === 'remove' && !targetMember)) {
      cfg.musicrole = null;
      saveGuild(msg.guild.id, cfg);
      return msg.reply('✅ Music role restriction removed. All members can now use music commands.'), true;
    }

    const role = msg.mentions.roles.first() || msg.guild.roles.cache.get(subArgs[0]);
    if (!role) return msg.reply(`🎵 **Music-role:** ${cfg.musicrole ? `<@&${cfg.musicrole}>` : 'None (Everyone can control)'}\n\n• **Set Role:** \`.musicrole <@role>\`\n• **Remove Role from Server:** \`.remove musicrole\`\n• **Remove Role from User:** \`.remove musicrole <@user>\``), true;
    cfg.musicrole = role.id; saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ **Music role set:** ${role}\nOnly members with this role can control and play music.`), true;
  }
  if (cmd === 'musicvc') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
    const ch = msg.mentions.channels.first() || msg.member.voice.channel;
    if (!ch) return msg.reply('`.musicvc #voice`'), true;
    cfg.musicvc = ch.id; saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ Music VC: ${ch}`), true;
  }
  return null;
}

// Clear AFK on return + notify on mention
async function checkAfk(msg) {
  const { getGuild, saveGuild } = require('../store');
  if (!msg.guild) return;
  const cfg = getGuild(msg.guild.id);
  if (cfg.afk?.[msg.author.id]) {
    delete cfg.afk[msg.author.id];
    saveGuild(msg.guild.id, cfg);
    try { await msg.member.setNickname(msg.member.displayName.replace('[AFK] ', '').slice(0, 32)).catch(() => {}); } catch {}
    msg.reply('👋 Welcome back! AFK removed.').then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
  }
  for (const [id, m] of msg.mentions.users) {
    if (cfg.afk?.[id]) msg.reply(`💤 <@${id}> is AFK: ${cfg.afk[id].reason}`).then(x => setTimeout(() => x.delete().catch(() => {}), 6000)).catch(() => {});
  }
}

module.exports = { run, checkAfk };
