// .antinuke / .setup / .whitelist / .multiwhitelist / .extraowner (+ config)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, VerificationLevel, ExplicitContentFilter } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin, tick, cross, dot, autoAnimEmojis } = require('./helpers');
const { panicLock, panicUnlock, freezeGuild, unfreezeGuild, isFrozen, isBotOwner } = require('../antinuke');
const { createBackup } = require('../backup');

function isRealOwner(msg) {
  return msg.guild.ownerId === msg.author.id || isBotOwner(msg.author.id);
}

function navRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vg_home').setLabel('( 𝐇𝐨𝐦𝐞 )').setStyle(ButtonStyle.Secondary).setEmoji('<a:joya:1551154653201440828>'),
    new ButtonBuilder().setCustomId('vg_all').setLabel('( 𝐀𝐥𝐥 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 )').setStyle(ButtonStyle.Secondary).setEmoji('<a:joya:1551393231642829001>'),
  );
}

function onoff(cfg, v) { return v ? `${tick(cfg)} ON` : `${cross(cfg)} OFF`; }

// Whitelist matrix (screenshot-style "Settings Applied" list)
const WL_MATRIX = [
  'Anti-Ban', 'Anti-Kick', 'Anti-Unban', 'Anti-Bot Add',
  'Anti-Member Role Update', 'Anti-Member Update',
  'Anti-Emoji Action', 'Anti-Sticker Action', 'Anti-Message Delete',
  'Anti-Everyone Ping', 'Anti-Here Ping',
  'Anti-Channel Create', 'Anti-Channel Delete', 'Anti-Channel Update',
  'Anti-Role Create', 'Anti-Role Delete', 'Anti-Role Update',
  'Anti-Webhook Create', 'Anti-Webhook Delete', 'Anti-Webhook Update',
  'Anti-Guild Update', 'Anti-Integration Add', 'Anti-Integration Update',
  'Anti-Integration Delete', 'Anti-Community Channel',
];
function wlAppliedEmbed(guild, author, userIds, added) {
  return new EmbedBuilder()
    .setColor(0xff2222)
    .setTitle(added ? '❯ Settings Applied' : '❯ Settings Removed')
    .setDescription(
      `🔴 Server: \`${guild.name}\` | Action By: \`${author.username}\`\n\n` +
      `**User:** ${userIds.map(id => `<@${id}>`).join(' ')}\n\n` +
      `**${added ? 'Whitelisted' : 'Revoked'} Permissions**\n` +
      WL_MATRIX.map(p => `💀 ${p}`).join('\n')
    )
    .setFooter({ text: added ? 'The VG security matrix has been updated successfully. | Powered By VG Cheats™' : 'Whitelist entry removed. | Powered By VG Cheats™' });
}

// CoreLock-style Antinuke panel
function cfgEmbed(guild) {
  const c = getGuild(guild.id);
  const t = tick(c), x = cross(c), d = dot();
  const status =
    `${t} Master: \`${c.enabled}\` | Strict: \`${c.strictModeEvenForOwner}\` | Punish: \`${c.punish}\`\n` +
    `${c.zeroTolerance !== false ? t : x} Zero-tolerance ${c.zeroTolerance !== false ? '(non-whitelist = 1st hit punish)' : '(OFF - free hits allowed!)'}\n` +
    `${t} Day-Cap: bina-whitelist \`${c.dayCaps?.ban ?? 10}\` bans + \`${c.dayCaps?.kick ?? 10}\` kicks | whitelist \`${c.dayCaps?.wlBan ?? 5}\` + \`${c.dayCaps?.wlKick ?? 5}\` / \`${c.dayCaps?.windowH ?? 24}h\`\n` +
    `${c.autoFreeze !== false ? t : x} Auto-Freeze ${isFrozen(guild.id) ? '— 🧊 **FROZEN NOW**' : ''}\n` +
    `${t} AntiLink \`${c.antiLink}\` | AntiEveryone \`${c.antiEveryone}\` | AntiWebhook \`${c.antiWebhookSpam}\``;
  return new EmbedBuilder()
    .setTitle('🛡️ Antinuke & Security')
    .setColor(0xff2222)
    .setThumbnail(guild.iconURL())
    .setDescription('Advanced protection mechanisms for securing your server.')
    .addFields(
      { name: 'Security Controls', value: `${d} \`.antinuke\`\n${d} \`.antinuke config\`\n${d} \`.setup\` / \`.setup @role\`\n${d} \`.antinuke freeze\` / \`.antinuke unfreeze\``, inline: true },
      { name: 'Whitelist System', value: `${d} \`.whitelist\`\n${d} \`.whitelist add <@user>\`\n${d} \`.whitelist remove <@user>\`\n${d} \`.whitelist show\``, inline: true },
      { name: 'Extraowner Configuration', value: `${d} \`.extraowner\`\n${d} \`.extraowner add <@user>\`\n${d} \`.extraowner remove <@user>\`\n${d} \`.extraowner show\``, inline: true },
      { name: 'Status', value: status },
      { name: 'Limits', value: Object.entries(c.limits).map(([k, v]) => `\`${k} ${v.count}/${v.perSec}s\``).join(' ') },
      { name: 'Info', value: `Whitelist: \`${c.whitelist.length}\` | ExtraOwner: \`${c.extraOwners.length}\` | Log: ${c.logChannelId ? `<#${c.logChannelId}>` : '—'}` },
    )
    .setFooter({ text: 'VG CyberShield • Stronger than Wick' });
}

// Whitelist panel: ticked list + cross on non-whitelisted admins
async function whitelistEmbed(guild) {
  const c = getGuild(guild.id);
  const t = tick(c), x = cross(c), d = dot();
  let unprotected = [];
  try {
    const members = await guild.members.fetch();
    for (const [, m] of members) {
      if (m.user.bot || m.id === guild.ownerId) continue;
      if (isBotOwner(m.id) || c.whitelist.includes(m.id) || c.extraOwners.includes(m.id)) continue;
      if (m.permissions.has('Administrator') || m.permissions.has('BanMembers') || m.permissions.has('KickMembers') || m.permissions.has('ManageGuild'))
        unprotected.push(m);
      if (unprotected.length >= 15) break;
    }
  } catch {}
  const em = new EmbedBuilder()
    .setTitle('🛡️ Whitelist System')
    .setColor(0xff2222)
    .setThumbnail(guild.iconURL())
    .setDescription('Whitelisted users stay safe within limits, everyone else gets punished instantly.');
  em.addFields({
    name: `Whitelisted (${c.whitelist.length}) ${t}`,
    value: c.whitelist.length
      ? c.whitelist.slice(0, 20).map(id => `${t} <@${id}>`).join('\n')
      : 'Empty — add with `.whitelist add @user`.',
  });
  em.addFields({
    name: `Non-whitelisted Power-holders (${unprotected.length}) ${unprotected.length ? x : t}`,
    value: unprotected.length
      ? unprotected.map(m => `${x} ${m} (\`${m.id}\`)`).join('\n') + '\nAdd them with `.whitelist add` or remove their powers.'
      : `${t} All power-holders are protected.`,
  });
  em.addFields({ name: 'Commands', value: `${d} \`.whitelist add <@user>\`\n${d} \`.whitelist remove <@user>\`\n${d} \`.multiwhitelist add <@u1> <@u2>\`` });
  em.setFooter({ text: 'Want animated tick/cross? .antinuke tick <emoji> • .antinuke cross <emoji>' });
  return em;
}

async function run(msg, args) {
  const [cmd, sub, ...rest] = args;
  const cfg = getGuild(msg.guild.id);

  // .antinuke / .antinuke config
  if (cmd === 'antinuke') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.');
    if (!sub || sub === 'config' || sub === 'status') return msg.reply({ embeds: [cfgEmbed(msg.guild)], components: [navRow()] });
    if (sub === 'on' || sub === 'enable') { cfg.enabled = true; saveGuild(msg.guild.id, cfg); return msg.reply('✅ AntiNuke ON'); }
    if (sub === 'off' || sub === 'disable') { cfg.enabled = false; saveGuild(msg.guild.id, cfg); return msg.reply('⛔ AntiNuke OFF'); }
    if (sub === 'strict' && (rest[0] === 'on' || rest[0] === 'off')) {
      cfg.strictModeEvenForOwner = rest[0] === 'on'; saveGuild(msg.guild.id, cfg);
      return msg.reply(cfg.strictModeEvenForOwner ? '✅ Strict ON (safe from token-grab)' : '⚠️ Strict OFF (risky!)');
    }
    if (sub === 'zerotol' && (rest[0] === 'on' || rest[0] === 'off')) {
      cfg.zeroTolerance = rest[0] === 'on'; saveGuild(msg.guild.id, cfg);
      return msg.reply(cfg.zeroTolerance
        ? '✅ **Zero-tolerance ON** — bina whitelist wala pehli harkat (ban/kick/delete) pe hi punish. Koi free chance nahi.'
        : '⚠️ **Zero-tolerance OFF** — bina whitelist wale ko rate-limit (2/10s) + day-cap tak chhoot. (Risky!)');
    }
    if (sub === 'punish' && ['ban', 'kick', 'quarantine'].includes(rest[0])) {
      cfg.punish = rest[0]; saveGuild(msg.guild.id, cfg); return msg.reply(`✅ Punishment = \`${cfg.punish}\``);
    }
    if ((sub === 'maxban' || sub === 'maxkick' || sub === 'maxbanwl' || sub === 'maxkickwl') && rest[0] !== undefined) {
      const n = Math.max(1, Math.min(100, parseInt(rest[0])));
      if (isNaN(n)) return msg.reply('`.antinuke maxban 10` / `.antinuke maxbanwl 5` (1-100)');
      cfg.dayCaps = cfg.dayCaps || { ban: 10, kick: 10, wlBan: 5, wlKick: 5, windowH: 24 };
      if (sub === 'maxban') cfg.dayCaps.ban = n;
      else if (sub === 'maxkick') cfg.dayCaps.kick = n;
      else if (sub === 'maxbanwl') cfg.dayCaps.wlBan = n;
      else cfg.dayCaps.wlKick = n;
      saveGuild(msg.guild.id, cfg);
      const wl = sub.endsWith('wl');
      return msg.reply(`✅ Day-cap: **${wl ? 'whitelisted' : 'bina-whitelist'}** ids ab max **${n} ${sub.includes('ban') ? 'bans' : 'kicks'}** per ${cfg.dayCaps.windowH}h kar sakte hain — zyada = wo khud punish ⛔`);
    }
    if (sub === 'tick' || sub === 'cross') {
      const emoji = rest.join(' ').trim();
      if (!emoji) return msg.reply(sub === 'tick' ? '`.antinuke tick <emoji>` — send your server\'s animated tick emoji.' : '`.antinuke cross <emoji>` — send your server\'s animated cross emoji.');
      if (sub === 'tick') cfg.tickEmoji = emoji; else cfg.crossEmoji = emoji;
      saveGuild(msg.guild.id, cfg);
      return msg.reply(`${emoji} saved! It will now show in whitelist/config.`);
    }
    if (sub === 'emoji-reset') { cfg.tickEmoji = null; cfg.crossEmoji = null; cfg.dotEmoji = null; saveGuild(msg.guild.id, cfg); return msg.reply('✅ Back to default animated emojis.'); }
    if (sub === 'caps') {
      const d = cfg.dayCaps || {};
      return msg.reply(`📊 Day-caps (per \`${d.windowH ?? 24}h\`):\n• Bina-whitelist: max \`${d.ban ?? 10}\` bans + \`${d.kick ?? 10}\` kicks\n• Whitelisted: max \`${d.wlBan ?? 5}\` bans + \`${d.wlKick ?? 5}\` kicks (ID grab hone pe bhi limit!)\nZyada karne wala khud punish ⛔\nChange: \`.antinuke maxban 10\` / \`.antinuke maxkick 10\` / \`.antinuke maxbanwl 5\` / \`.antinuke maxkickwl 5\``);
    }
    if (sub === 'panic') { const n = await panicLock(msg.guild, msg.author.id); return msg.reply(`🔒 Lockdown: ${n} channels locked`); }
    if (sub === 'unpanic') { const n = await panicUnlock(msg.guild); return msg.reply(`🔓 Unlocked: ${n} channels`); }
    if (sub === 'freeze') {
      if (!isRealOwner(msg)) return msg.reply('❌ Only the **real owner** can FREEZE.');
      const r = await freezeGuild(msg.guild, `Manual by ${msg.author.tag}`);
      if (r.already) return msg.reply('🧊 Already frozen. Unlock with `.antinuke unfreeze`.');
      return msg.reply(`🧊 **FREEZE ON** — ${r.roles} roles paused + ${r.users} admins timed out + ${r.channels} channels locked. Unlock with \`.antinuke unfreeze\` (only you)`);
    }
    if (sub === 'unfreeze') {
      if (!isRealOwner(msg)) return msg.reply('❌ Only the **real owner** can UNFREEZE.');
      const r = await unfreezeGuild(msg.guild);
      return msg.reply(r.msg);
    }
    if (sub === 'autofreeze' && ['on', 'off'].includes(rest[0])) {
      cfg.autoFreeze = rest[0] === 'on'; saveGuild(msg.guild.id, cfg);
      return msg.reply(cfg.autoFreeze ? '✅ Auto-freeze ON (roles auto-pause on mass-nuke)' : '⚠️ Auto-freeze OFF (ban/lock only)');
    }
    if (sub === 'harden') {
      // Apply whatever native protection the API allows + give the manual checklist
      const done = [], fail = [];
      try { await msg.guild.setVerificationLevel(VerificationLevel.High, '[AntiNuke harden]'); done.push('Verification: HIGH (account must be 10 min old)'); } catch { fail.push('Verification (permission)'); }
      try { await msg.guild.setExplicitContentFilter(ExplicitContentFilter.AllMembers, '[AntiNuke harden]').catch(() => {}); done.push('Media filter: ON'); } catch {}
      return msg.reply(
        `🔒 **HARDEN**\n✅ ${done.join('\n✅ ') || '—'}\n${fail.length ? `❌ ${fail.join(', ')} (failed)\n` : ''}\n` +
        `**Do manually (in Settings):**\n` +
        `1. Server Settings → Moderation → 2FA: turn **"Require 2FA for moderation" ON** (blocks token thieves even when the bot is offline)\n` +
        `2. Give the admin role to ONLY 1-2 people, give everyone else smaller separate perms\n` +
        `3. Keep my role at the very top\n` +
        `4. Run a 2nd bot on another host (dual-bot guide in README) so one covers when the other is offline`
      );
    }
    if (sub === 'onlyownerban') {
      if (!isRealOwner(msg)) return msg.reply('❌ Only the **real owner** can change this.');
      if (rest[0] === 'on' || rest[0] === 'enable') {
        cfg.onlyOwnerCanBan = true;
        saveGuild(msg.guild.id, cfg);
        return msg.reply('🛡️ **Zero-Trust Anti-Ban: ON** — Sirf Main Server Owner ban kar sakta hai. Koi bhi admin ban nahi kar payega!');
      }
      if (rest[0] === 'off' || rest[0] === 'disable') {
        cfg.onlyOwnerCanBan = false;
        saveGuild(msg.guild.id, cfg);
        return msg.reply('⚠️ **Zero-Trust Anti-Ban: OFF** — Whitelisted admins max 5 bans kar payenge.');
      }
      return msg.reply(`🛡️ Zero-Trust Anti-Ban is currently: \`${cfg.onlyOwnerCanBan !== false ? 'ON (Only Main Owner)' : 'OFF'}\`\nToggle: \`.antinuke onlyownerban on/off\``);
    }
    return msg.reply('`.antinuke [config|on|off|onlyownerban on/off|strict on/off|zerotol on/off|punish|maxban 10|maxbanwl 5|caps|freeze|unfreeze|autofreeze on/off|harden|offlineguard|panic|unpanic]`');
  }

  // .offlineguard / .passiveshield - Native Discord-level hardening so server cannot be nuked even if bot is completely offline
  if (cmd === 'offlineguard' || cmd === 'passiveshield' || (cmd === 'antinuke' && sub === 'offlineguard')) {
    if (!isRealOwner(msg)) return msg.reply('❌ Only the **Main Server Owner** can activate Offline Guard.');
    const me = msg.guild.members.me;
    const botTopPos = me?.roles.highest.position || 0;
    let modified = 0;
    const details = [];

    const dangerous = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageGuildExpressions,
      PermissionFlagsBits.CreateGuildExpressions,
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.CreateEvents,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
    ];

    // 1. Lockdown @everyone: Strip Emoji, Sticker, Soundboard, and Management perms
    try {
      const everyone = msg.guild.roles.everyone;
      const hasAny = dangerous.some(p => everyone.permissions.has(p));
      if (hasAny) {
        await everyone.setPermissions(everyone.permissions.remove(dangerous), '[VG Offline Guard] Hardened @everyone (No Emoji/Sticker/Admin abuse)');
        modified++;
        details.push(`• **@everyone** (Locked Emojis, Stickers, Soundboard & Admin)`);
      }
    } catch {}

    // 2. Lockdown all human roles below bot
    for (const [, role] of msg.guild.roles.cache) {
      if (role.id === msg.guild.id || role.managed || role.position >= botTopPos) continue;
      const hasDangerous = dangerous.some(p => role.permissions.has(p));
      if (hasDangerous) {
        try {
          const newPerms = role.permissions.remove(dangerous);
          await role.setPermissions(newPerms, '[VG Offline Guard] Removed Discord-native dangerous perms');
          modified++;
          details.push(`• **@${role.name}**`);
        } catch {}
      }
    }

    const em = new EmbedBuilder()
      .setTitle('🛡️ VG CyberShield — Passive Offline Guard Active!')
      .setColor(0x00ff88)
      .setDescription(
        `✅ **${modified} Roles Secured & Hardened!**\n\n` +
        `**🛡️ Ye Kaise Kaam Karta Hai?**\n` +
        `Server ke sabhi staff roles se Discord ke native \`Administrator\` aur \`Ban/Kick\` permissions remove kar diye gaye hain.\n\n` +
        `**⚡ Asar (Why it's Indestructible):**\n` +
        `Chahe bot hosting **10 ghante ya 10 din ke liye bhi band ho jaye**, Discord ke apne servers kisi bhi admin ya hacker ko member ban karne ya channel delete karne ki permission **nahi denge** (Discord physically \`403 Forbidden\` error dega).\n\n` +
        `Jab bot online rahega, staff member bot ki safe commands (\`.ban\`, \`.kick\`, \`.timeout\`) se moderation kar sakte hain!`
      )
      .addFields(
        { name: 'Secured Roles', value: details.slice(0, 10).join('\n') || 'All human roles already safe' }
      )
      .setFooter({ text: 'VG CyberShield™ • Discord Native Offline Immunity' });

    return msg.reply({ embeds: [em] });
  }

  // .banner = current banner dekho | .setbanner = change | .removebanner = hatao (owner only)
  if (cmd === 'banner') {
    const info = bannerInfo();
    const em = new EmbedBuilder()
      .setColor(0xff2222)
      .setTitle('🖼️ Current Banner')
      .setDescription(
        `Type: \`${info.custom ? 'Custom (tumhara)' : 'Default (VG)'}\`\n` +
        `Size: \`${info.dims}\` • \`${info.kb} KB\` (best: \`960x470\`)\n\n` +
        `Change: \`.setbanner <image>\` (bot owner)\nRemove: \`.removebanner\` (bot owner)`
      )
      .setImage('attachment://vg-banner.png')
      .setFooter({ text: 'Powered By VG Cheats™' });
    return msg.reply({ embeds: [em], files: [bannerFile()] }), true;
  }
  if (cmd === 'setbanner') {
    if (!isBotOwner(msg.author.id)) return msg.reply('❌ Bot owner only (apni ID `.env` me `BOT_OWNER_IDS` me dalo).'), true;
    const url = rest[0] || msg.attachments.first()?.url;
    if (!url) return msg.reply('`.setbanner <image-url>` — ya image attach karke `.setbanner` likho. (Best size: 960x470)'), true;
    try {
      const buf = await downloadImage(url);
      fs.writeFileSync(BANNER_CUSTOM, buf);
      const d = imgDims(buf);
      const em = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ Banner lag gaya!')
        .setDescription(
          `Size: \`${d ? `${d.w}x${d.h}` : '?'}\` • \`${(buf.length / 1024).toFixed(1)} KB\`` +
          (d && (d.w !== 960 || d.h !== 470) ? `\n⚠️ Best size \`960x470\` hai — thoda stretch/crop dikh sakta hai.` : '') +
          `\nDekho: \`.banner\` • Hatao: \`.removebanner\``
        )
        .setImage('attachment://vg-banner.png')
        .setFooter({ text: 'Powered By VG Cheats™' });
      return msg.reply({ embeds: [em], files: [bannerFile()] }), true;
    } catch (e) { return msg.reply(`❌ Banner change nahi hua: ${e.message}`), true; }
  }
  if (cmd === 'removebanner' || cmd === 'resetbanner') {
    if (!isBotOwner(msg.author.id)) return msg.reply('❌ Bot owner only.'), true;
    try { if (fs.existsSync(BANNER_CUSTOM)) fs.unlinkSync(BANNER_CUSTOM); } catch {}
    const em = new EmbedBuilder()
      .setColor(0xff2222)
      .setTitle('🗑️ Banner hata diya')
      .setDescription('Wapas default VG banner lag gaya. Dekho: `.banner`')
      .setImage('attachment://vg-banner.png')
      .setFooter({ text: 'Powered By VG Cheats™' });
    return msg.reply({ embeds: [em], files: [bannerFile()] }), true;
  }

  // .setup / .setup all / .setup roles / .setup logs / .setup @role
  if (cmd === 'setup') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.');
    const role = msg.mentions.roles.first();
    if (role) {
      if (!cfg.whitelist.includes(role.id)) { /* whitelists hold members, not roles - info */ }
      return msg.reply(`✅ Setup: keep the bot role **ABOVE ${role}** + check \`.antinuke config\`. Whitelist is user-ID based (\`.whitelist add @user\`).`);
    }

    const mode = (sub || 'all').toLowerCase();
    const waitMsg = await msg.reply('⏳ **Initializing VG CyberShield Server Setup...** Setting up security roles and dedicated log channels...');

    let rolesRes = null;
    let logsRes = null;

    if (mode === 'roles' || mode === 'all') {
      rolesRes = await setupRoles(msg.guild, cfg);
    }
    if (mode === 'logs' || mode === 'all') {
      logsRes = await setupLogs(msg.guild, cfg);
    }

    saveGuild(msg.guild.id, cfg);
    await autoAnimEmojis(msg.guild, cfg, () => saveGuild(msg.guild.id, cfg)).catch(() => {});
    await createBackup(msg.guild).catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(
        `## <a:vgtick:1559740802324893798> 🛡️ VG CyberShield — Server Setup Complete\n\n` +
        `<a:joya:1551156450825474048> **Server:** \`${msg.guild.name}\`\n` +
        `<a:joya:1551156450825474048> The security role hierarchy and dedicated multi-channel logging system are fully configured!`
      )
      .setThumbnail(msg.guild.iconURL())
      .setFooter({ text: 'Keep VG CyberShield role at the VERY TOP of the role list!' })
      .setTimestamp();

    if (rolesRes) {
      const topName = msg.guild.members.me?.roles.highest?.name || 'VG CyberShield';
      embed.addFields({
        name: '<a:joya:1551154653201440828> Security Roles Hierarchy (Consecutive Order)',
        value:
          `<a:joya:1551156450825474048> 1. \`${topName}\` — *Bot Role (Top)*\n` +
          `<a:joya:1551156450825474048> 2. ${rolesRes.unbRole ? `<@&${rolesRes.unbRole.id}>` : '`VG UNBYPASSABLE`'} — *Directly below CyberShield*\n` +
          `<a:joya:1551156450825474048> 3. ${rolesRes.bypassRole ? `<@&${rolesRes.bypassRole.id}>` : '`VG UNBYPASS`'} — *Directly below UNBYPASSABLE*\n` +
          `<a:joya:1551156450825474048> 4. ${rolesRes.qRole ? `<@&${rolesRes.qRole.id}>` : '`Quarantine`'} — *Directly below UNBYPASS (Muted)*\n` +
          `<a:joya:1551156450825474048> 5. ${rolesRes.evRole ? `<@&${rolesRes.evRole.id}>` : '`EVENT MANAGER`'} — *Directly below Quarantine*\n` +
          `<a:joya:1551156450825474048> 🔻 ${rolesRes.allRole ? `<@&${rolesRes.allRole.id}>` : '`ALL MEMBERS`'} — *Always at the bottom (Auto-assigned on join)*`,
        inline: false
      });
    }

    if (logsRes) {
      embed.addFields({
        name: '<a:joya:1551393231642829001> Dedicated Multi-Channel Logging',
        value:
          `<a:joya:1551156450825474048> 🛡️ **AntiNuke Logs:** ${logsRes.antinuke ? `<#${logsRes.antinuke.id}>` : '`Created`'}\n` +
          `<a:joya:1551156450825474048> 🔨 **Mod Logs:** ${logsRes.mod ? `<#${logsRes.mod.id}>` : '`Created`'}\n` +
          `<a:joya:1551156450825474048> 👥 **Member Logs:** ${logsRes.member ? `<#${logsRes.member.id}>` : '`Created`'}\n` +
          `<a:joya:1551156450825474048> 💬 **Message Logs:** ${logsRes.message ? `<#${logsRes.message.id}>` : '`Created`'}`,
        inline: false
      });
    }

    embed.addFields({
      name: '<a:vgwarn:1559740808146591774> Active Protections',
      value:
        `<a:joya:1551156450825474048> **Zero-Trust Anti-Ban:** ON (Only Main Server Owner can ban)\n` +
        `<a:joya:1551156450825474048> **Member Selection Defense:** ACTIVE (Admins cannot assign Admin roles or batch-ban)\n` +
        `<a:joya:1551156450825474048> **Event Authorization:** Role <@&${cfg.roles?.event || cfg.eventRoleId || 'Not Set'}>\n` +
        `<a:joya:1551156450825474048> **Auto-Role:** Active (New members receive \`-> 👥 ALL MEMBERS\` with 0 dangerous perms)`,
      inline: false
    });

    return waitMsg.edit({ content: null, embeds: [embed] });
  }

  // .fixroles / .rolesfix (re-align role hierarchy)
  if (cmd === 'fixroles' || cmd === 'rolesfix') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
    const waitMsg = await msg.reply('⏳ **Re-aligning role hierarchy...** Placing VG UNBYPASSABLE, VG UNBYPASS, Quarantine below CyberShield and ALL MEMBERS at the bottom...');
    const r = await setupRoles(msg.guild, cfg);
    saveGuild(msg.guild.id, cfg);
    const topName = msg.guild.members.me?.roles.highest?.name || 'VG CyberShield';
    return waitMsg.edit({
      content:
        `<a:vgtick:1559740802324893798> **Role Hierarchy Re-aligned Successfully!**\n` +
        `<a:joya:1551156450825474048> 1. \`${topName}\` 🔒 (*Bot Role - Top*)\n` +
        `<a:joya:1551156450825474048> 2. ${r.unbRole} 🔒 (*Directly below ${topName}*)\n` +
        `<a:joya:1551156450825474048> 3. ${r.bypassRole} 🔒 (*Directly below UNBYPASSABLE*)\n` +
        `<a:joya:1551156450825474048> 4. ${r.qRole} 🔒 (*Directly below UNBYPASS*)\n` +
        `<a:joya:1551156450825474048> 5. ${r.evRole} 🔒 (*Directly below Quarantine*)\n` +
        `<a:joya:1551156450825474048> ... *(Other server roles)* ...\n` +
        `<a:joya:1551156450825474048> 🔻 ${r.allRole} 🔒 (*Always at the very bottom*)`
    }), true;
  }

  // .eventrole <@role> / .eventrole show / .eventrole remove
  if (cmd === 'eventrole') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
    const role = msg.mentions.roles.first();
    const action = (sub || '').toLowerCase();

    if (action === 'remove' || action === 'reset') {
      cfg.eventRoleId = null;
      if (cfg.roles) cfg.roles.event = null;
      saveGuild(msg.guild.id, cfg);
      return msg.reply('✅ Event Manager role reset. Only the Server Owner can broadcast events now.'), true;
    }

    if (role) {
      cfg.eventRoleId = role.id;
      cfg.roles = cfg.roles || {};
      cfg.roles.event = role.id;
      saveGuild(msg.guild.id, cfg);
      return msg.reply(`✅ **Event Role Set:** Members with ${role} can now broadcast \`.event\` / \`.dmall\` announcements!`), true;
    }

    const currentId = cfg.eventRoleId || cfg.roles?.event;
    if (currentId) {
      return msg.reply(`📢 **Current Event Role:** <@&${currentId}>\nChange: \`.eventrole @role\` | Remove: \`.eventrole remove\``), true;
    }
    return msg.reply('📢 **Usage:** `.eventrole <@role>` — set which role is authorized to run `.event` / `.dmall` announcements.'), true;
  }

  // .logs / .logs [antinuke|mod|member|message] <#channel>
  if (cmd === 'logs') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
    cfg.logs = cfg.logs || {};
    const type = (sub || '').toLowerCase();
    const ch = msg.mentions.channels.first();

    if (['antinuke', 'mod', 'member', 'message'].includes(type) && ch) {
      cfg.logs[type] = ch.id;
      if (type === 'antinuke') cfg.logChannelId = ch.id;
      if (type === 'message') cfg.serverlog = ch.id;
      saveGuild(msg.guild.id, cfg);
      return msg.reply(`✅ **${type.toUpperCase()} Logs Channel Set:** ${ch}`), true;
    }

    if (sub === 'reset') {
      cfg.logs = { antinuke: null, mod: null, member: null, message: null };
      saveGuild(msg.guild.id, cfg);
      return msg.reply('✅ Dedicated log channels reset. Use `.setup logs` to recreate automatically.'), true;
    }

    const em = new EmbedBuilder()
      .setTitle('📜 Dedicated Log Channels')
      .setColor(0x3498db)
      .setDescription(
        `• 🛡️ **AntiNuke Logs:** ${cfg.logs?.antinuke ? `<#${cfg.logs.antinuke}>` : '`Not Set`'}\n` +
        `• 🔨 **Mod Logs:** ${cfg.logs?.mod ? `<#${cfg.logs.mod}>` : '`Not Set`'}\n` +
        `• 👥 **Member Logs:** ${cfg.logs?.member ? `<#${cfg.logs.member}>` : '`Not Set`'}\n` +
        `• 💬 **Message Logs:** ${cfg.logs?.message ? `<#${cfg.logs.message}>` : '`Not Set`'}\n\n` +
        `**Commands:**\n` +
        `• \`.setup logs\` — Automatically create category & all 4 channels\n` +
        `• \`.logs <type> <#channel>\` — Set specific channel manually\n` +
        `• \`.logs reset\` — Reset channels`
      )
      .setFooter({ text: 'VG CyberShield™ Multi-Channel Logging' });
    return msg.reply({ embeds: [em] }), true;
  }

  // .whitelist [add/remove/show] / .multiwhitelist
  if (cmd === 'whitelist' || cmd === 'multiwhitelist') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.');
    const users = [...msg.mentions.users.values()];
    const action = sub === 'show' ? 'show' : (sub || (users.length ? 'add' : 'show'));
    if (action === 'show') {
      await autoAnimEmojis(msg.guild, cfg, () => saveGuild(msg.guild.id, cfg));
      return msg.reply({ embeds: [await whitelistEmbed(msg.guild)], components: [navRow()] });
    }
    if (action === 'add') {
      const ids = users.map(u => u.id);
      const raw = rest.join(' ').match(/\d{15,25}/g) || [];
      const all = [...new Set([...ids, ...raw])];
      if (!all.length) return msg.reply('`.whitelist add @user` — kisko whitelist karna hai?');
      for (const id of all) if (!cfg.whitelist.includes(id)) cfg.whitelist.push(id);
      saveGuild(msg.guild.id, cfg);
      return msg.reply({ embeds: [wlAppliedEmbed(msg.guild, msg.author, all, true)] });
    }
    if (action === 'remove') {
      const ids = new Set([...users.map(u => u.id), ...(rest.join(' ').match(/\d{15,25}/g) || [])]);
      if (!ids.size) return msg.reply('`.whitelist remove @user` — kisko hatana hai?');
      cfg.whitelist = cfg.whitelist.filter(x => !ids.has(x));
      saveGuild(msg.guild.id, cfg);
      return msg.reply({ embeds: [wlAppliedEmbed(msg.guild, msg.author, [...ids], false)] });
    }
  }

  // .extraowner [add/remove/show]
  if (cmd === 'extraowner') {
    if (msg.guild.ownerId !== msg.author.id && !require('../antinuke').isBotOwner(msg.author.id))
      return msg.reply('❌ Server owner / bot owner only.');
    const users = [...msg.mentions.users.values()];
    const action = sub || (users.length ? 'add' : 'show');
    if (action === 'show') return msg.reply(cfg.extraOwners.length ? `👑 ExtraOwners:\n${cfg.extraOwners.map(id => `<@${id}>`).join('\n')}` : 'No extra owners.');
    if (action === 'add') {
      for (const u of users) if (!cfg.extraOwners.includes(u.id)) cfg.extraOwners.push(u.id);
      saveGuild(msg.guild.id, cfg); return msg.reply(`✅ ExtraOwner added (total ${cfg.extraOwners.length})`);
    }
    if (action === 'remove') {
      const ids = new Set([...users.map(u => u.id), ...(rest.join(' ').match(/\d{15,25}/g) || [])]);
      cfg.extraOwners = cfg.extraOwners.filter(x => !ids.has(x));
      saveGuild(msg.guild.id, cfg); return msg.reply('✅ ExtraOwner removed.');
    }
  }

  // .backup (snapshot of channels, roles, and member IDs)
  if (cmd === 'backup') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
    const m = await msg.reply('⏳ Creating full server snapshot (channels, roles, and member list)...');
    try {
      const d = await createBackup(msg.guild);
      return m.edit(`✅ **Full Backup Created!**\n> Roles: \`${d.roles.length}\`\n> Channels: \`${d.channels.length}\`\n> Saved Members: \`${d.memberIds.length}\`\nRun \`.restore\` or \`.nukerecovery\` in case of a nuke.`), true;
    } catch (e) {
      return m.edit(`❌ Backup failed: ${e.message}`), true;
    }
  }

  // .restore / .nukerecovery (recreate channels/roles + invite link + member DM)
  if (cmd === 'restore' || cmd === 'nukerecovery') {
    if (!isRealOwner(msg)) return msg.reply('❌ Only the **real server owner** can run server restore.'), true;
    const m = await msg.reply('🚨 **Starting Disaster Recovery...** Recreating channels, roles, and preparing member re-invites...');
    try {
      const { restoreBackup } = require('../backup');
      const res = await restoreBackup(msg.guild, msg.client, true);
      return m.edit(res.msg), true;
    } catch (e) {
      return m.edit(`❌ Restore failed: ${e.message}`), true;
    }
  }

  // .event / .dmall (Mass DM announcement to all server members)
  if (cmd === 'event' || cmd === 'dmall') {
    const hasEventRole = (cfg.eventRoleId && msg.member.roles.cache.has(cfg.eventRoleId)) ||
                         (cfg.roles?.event && msg.member.roles.cache.has(cfg.roles.event));
    if (!isRealOwner(msg) && !hasEventRole) {
      const roleMention = (cfg.eventRoleId || cfg.roles?.event) ? `<@&${cfg.eventRoleId || cfg.roles?.event}>` : '`-> 📢 EVENT MANAGER`';
      return msg.reply(`❌ **Permission Denied:** Sirf Server Owner ya **Event Role** (${roleMention}) wale members hi \`.event\` broadcast kar sakte hain!\nSet role with: \`.eventrole @role\``), true;
    }
    const text = [sub, ...rest].filter(Boolean).join(' ');
    if (!text) return msg.reply('📢 **Usage:** `.event <your announcement / event details>`\nExample: `.event Join our special tournament today at 8 PM!`'), true;

    const m = await msg.reply('📢 **Preparing to send Event DM to all members...** Please wait.');
    try {
      const { sendMassEvent } = require('../backup');
      const res = await sendMassEvent(msg.guild, msg.client, text, msg.author);
      return m.edit(`✅ **Event Announcement Broadcast Complete!**\n> Total Members: \`${res.total}\`\n> Delivered: \`${res.sent}\` ✅\n> Closed DMs/Failed: \`${res.failed}\` ⚠️`), true;
    } catch (e) {
      return m.edit(`❌ Broadcast failed: ${e.message}`), true;
    }
  }

  // .protectall / .protectmembers (Assign Protected Member role to all existing members & lock out admins)
  if (cmd === 'protectall' || cmd === 'protectmembers') {
    if (!isRealOwner(msg)) return msg.reply('❌ Only the **Server Owner** can run `.protectall`.'), true;
    const allRoleId = cfg.roles?.allMembers;
    let allRole = allRoleId ? msg.guild.roles.cache.get(allRoleId) : msg.guild.roles.cache.find(r => r.name === '-> 👥 ALL MEMBERS');
    if (!allRole) {
      const r = await setupRoles(msg.guild, cfg);
      allRole = r.allRole;
    }
    if (!allRole) return msg.reply('❌ Could not find or create `-> 👥 ALL MEMBERS` role.'), true;

    // Apply strict hierarchy position (above normal admin roles)
    const { unbRole, bypassRole, qRole, evRole } = cfg.roles || {};
    await applyRoleHierarchy(msg.guild, {
      unbRole: msg.guild.roles.cache.get(unbRole),
      bypassRole: msg.guild.roles.cache.get(bypassRole),
      qRole: msg.guild.roles.cache.get(qRole),
      evRole: msg.guild.roles.cache.get(evRole),
      allRole
    });

    const m = await msg.reply('⏳ **Syncing & Protecting all members...** Please wait.');
    const members = await msg.guild.members.fetch().catch(() => null);
    let count = 0;
    if (members) {
      for (const [, mem] of members) {
        if (!mem.user.bot && !mem.roles.cache.has(allRole.id)) {
          await mem.roles.add(allRole.id).catch(() => {});
          count++;
          if (count % 15 === 0) await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    return m.edit(
      `<a:vgtick:1559740802324893798> **All Members Protected!**\n` +
      `> **Role:** ${allRole} (Positioned above Administrator roles)\n` +
      `> **Members Protected:** \`${count}\`\n` +
      `> Ab koi bhi Administrator server settings me jaakar members ko select/ban/kick nahi kar sakta!`
    ), true;
  }

  return null; // not handled
}

async function applyRoleHierarchy(guild, { unbRole, bypassRole, qRole, evRole, allRole }) {
  try {
    const me = guild.members.me;
    const botRole = me?.roles.botRole || me?.roles.highest;
    const botPos = botRole ? botRole.position : 0;

    // Security role hierarchy:
    // Top:        VG CyberShield (botPos)
    // botPos - 1: -> 🔰 VG UNBYPASSABLE (Owner/Whitelisted Highest)
    // botPos - 2: -> 🔓 VG UNBYPASS (Whitelisted Admin)
    // botPos - 3: -> 👥 ALL MEMBERS (Protected Members: Placed ABOVE standard Admin roles so Admins cannot select/manage them!)
    // botPos - 4: -> 📢 EVENT MANAGER
    // botPos - 5: -> 🛡️ Quarantine
    if (botPos > 5) {
      const positions = [];
      if (qRole && qRole.position < botPos) positions.push({ role: qRole.id, position: Math.max(2, botPos - 5) });
      if (evRole && evRole.position < botPos) positions.push({ role: evRole.id, position: Math.max(3, botPos - 4) });
      if (allRole && allRole.position < botPos) positions.push({ role: allRole.id, position: Math.max(4, botPos - 3) });
      if (bypassRole && bypassRole.position < botPos) positions.push({ role: bypassRole.id, position: Math.max(5, botPos - 2) });
      if (unbRole && unbRole.position < botPos) positions.push({ role: unbRole.id, position: Math.max(6, botPos - 1) });

      if (positions.length) {
        try {
          await guild.roles.setPositions(positions);
        } catch {
          // Fallback: move one by one from bottom to top
          try { if (qRole) await qRole.setPosition(Math.max(2, botPos - 5)); } catch {}
          try { if (evRole) await evRole.setPosition(Math.max(3, botPos - 4)); } catch {}
          try { if (allRole) await allRole.setPosition(Math.max(4, botPos - 3)); } catch {}
          try { if (bypassRole) await bypassRole.setPosition(Math.max(5, botPos - 2)); } catch {}
          try { if (unbRole) await unbRole.setPosition(Math.max(6, botPos - 1)); } catch {}
        }
      }
    }
  } catch (err) {
    console.log('Error applying role hierarchy:', err.message);
  }
}

async function setupRoles(guild, cfg) {
  cfg.roles = cfg.roles || {};
  const me = guild.members.me;
  const created = [];
  const existing = [];

  // 0. Hard-Lock @everyone role (Remove Emoji, Sticker, Soundboard & Management perms so members cannot change settings)
  try {
    const everyone = guild.roles.everyone;
    const dangerousForEveryone = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageGuildExpressions,
      PermissionFlagsBits.CreateGuildExpressions,
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.CreateEvents,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.ModerateMembers,
    ];
    const hasAny = dangerousForEveryone.some(p => everyone.permissions.has(p));
    if (hasAny) {
      await everyone.setPermissions(everyone.permissions.remove(dangerousForEveryone), '[VG Setup] Locked @everyone expression/sticker/admin perms');
    }
  } catch (e) {
    console.log('Error hardening @everyone in setupRoles:', e.message);
  }

  // 1. All Members Role (Bottom role, safe base perms only, auto-assigned on join)
  let allRole = (cfg.roles.allMembers && guild.roles.cache.get(cfg.roles.allMembers)) ||
                guild.roles.cache.find(r => r.name === '-> 👥 ALL MEMBERS');
  if (!allRole) {
    allRole = await guild.roles.create({
      name: '-> 👥 ALL MEMBERS',
      color: 0x95A5A6, // Grey
      permissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
      reason: '[VG Setup] Safe Base Members role',
    }).catch(() => null);
    if (allRole) created.push(allRole);
  } else {
    existing.push(allRole);
  }
  if (allRole) {
    cfg.roles.allMembers = allRole.id;
    cfg.autorole = cfg.autorole || { humans: [], bots: [], all: [] };
    if (!cfg.autorole.all) cfg.autorole.all = [];
    if (!cfg.autorole.all.includes(allRole.id)) {
      cfg.autorole.all.push(allRole.id);
    }
    // Give allRole to all existing human members so everyone is instantly protected
    try {
      guild.members.fetch().then(members => {
        for (const [, m] of members) {
          if (!m.user.bot && !m.roles.cache.has(allRole.id)) {
            m.roles.add(allRole.id).catch(() => {});
          }
        }
      }).catch(() => {});
    } catch {}
  }

  // 2. Event Manager Role (Permission to broadcast .event / .dmall)
  let evRole = (cfg.roles.event && guild.roles.cache.get(cfg.roles.event)) ||
               (cfg.eventRoleId && guild.roles.cache.get(cfg.eventRoleId)) ||
               guild.roles.cache.find(r => r.name === '-> 📢 EVENT MANAGER');
  if (!evRole) {
    evRole = await guild.roles.create({
      name: '-> 📢 EVENT MANAGER',
      color: 0x9B59B6, // Purple
      permissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageEvents,
      ],
      reason: '[VG Setup] Event Manager role',
    }).catch(() => null);
    if (evRole) created.push(evRole);
  } else {
    existing.push(evRole);
  }
  if (evRole) {
    cfg.roles.event = evRole.id;
    cfg.eventRoleId = evRole.id;
  }

  // 3. Quarantine Role (0 permissions, completely blocked)
  let qRole = (cfg.roles.quarantine && guild.roles.cache.get(cfg.roles.quarantine)) ||
              guild.roles.cache.find(r => r.name === '-> 🛡️ Quarantine' || r.name === '⚠️ QUARANTINED');
  if (!qRole) {
    qRole = await guild.roles.create({
      name: '-> 🛡️ Quarantine',
      color: 0xF1C40F, // Gold / Yellow
      permissions: 0n,
      reason: '[VG Setup] Quarantine role',
    }).catch(() => null);
    if (qRole) created.push(qRole);
  } else {
    existing.push(qRole);
  }
  if (qRole) {
    cfg.roles.quarantine = qRole.id;
    for (const [, ch] of guild.channels.cache) {
      try {
        if (ch.isTextBased()) await ch.permissionOverwrites.edit(qRole, { SendMessages: false, AddReactions: false, SendMessagesInThreads: false }).catch(() => {});
        else if (ch.isVoiceBased()) await ch.permissionOverwrites.edit(qRole, { Connect: false, Speak: false }).catch(() => {});
      } catch {}
    }
  }

  // 4. Unbypass Role (Whitelist / bypass tier)
  let bypassRole = (cfg.roles.unbypass && guild.roles.cache.get(cfg.roles.unbypass)) ||
                   guild.roles.cache.find(r => r.name === '-> 🔓 VG UNBYPASS');
  if (!bypassRole) {
    bypassRole = await guild.roles.create({
      name: '-> 🔓 VG UNBYPASS',
      color: 0x3498DB, // Blue
      permissions: 0n,
      reason: '[VG Setup] Whitelist bypass role',
    }).catch(() => null);
    if (bypassRole) created.push(bypassRole);
  } else {
    existing.push(bypassRole);
  }
  if (bypassRole) cfg.roles.unbypass = bypassRole.id;

  // 5. Unbypassable Role (Highest trusted immune badge)
  let unbRole = (cfg.roles.unbypassable && guild.roles.cache.get(cfg.roles.unbypassable)) ||
                guild.roles.cache.find(r => r.name === '-> 🔰 VG UNBYPASSABLE');
  if (!unbRole) {
    unbRole = await guild.roles.create({
      name: '-> 🔰 VG UNBYPASSABLE',
      color: 0x2ECC71, // Emerald Green
      permissions: 0n,
      reason: '[VG Setup] Unbypassable trusted role',
    }).catch(() => null);
    if (unbRole) created.push(unbRole);
  } else {
    existing.push(unbRole);
  }
  if (unbRole) cfg.roles.unbypassable = unbRole.id;

  // Apply strict consecutive hierarchy
  await applyRoleHierarchy(guild, { unbRole, bypassRole, qRole, evRole, allRole });

  return { qRole, unbRole, bypassRole, evRole, allRole, created, existing };
}

async function setupLogs(guild, cfg) {
  cfg.logs = cfg.logs || {};
  const me = guild.members.me;

  let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('vg security logs'));
  if (!cat) {
    cat = await guild.channels.create({
      name: '🛡️ VG SECURITY LOGS',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: me.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    }).catch(() => null);
  }

  const specs = [
    { key: 'antinuke', name: '🛡️・antinuke-logs', topic: 'Realtime AntiNuke & Security Alerts | 0.03s Engine' },
    { key: 'mod', name: '🔨・mod-logs', topic: 'Moderator Actions (Bans, Kicks, Timeouts, Locks, Purges)' },
    { key: 'member', name: '👥・member-logs', topic: 'Member Joins, Leaves, Role & Batch Modifications' },
    { key: 'message', name: '💬・message-logs', topic: 'Message Deletes, Edits, Ghostpings & Spam Logs' },
  ];

  const results = {};
  for (const s of specs) {
    let ch = (cfg.logs[s.key] && guild.channels.cache.get(cfg.logs[s.key])) ||
             guild.channels.cache.find(c => c.name === s.name || c.name === s.name.replace(/[^\w-]/g, '').toLowerCase());
    if (!ch) {
      ch = await guild.channels.create({
        name: s.name,
        type: ChannelType.GuildText,
        parent: cat ? cat.id : undefined,
        topic: s.topic,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: me.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
      }).catch(() => null);
    }
    if (ch) {
      cfg.logs[s.key] = ch.id;
      results[s.key] = ch;
    }
  }

  if (cfg.logs.antinuke) cfg.logChannelId = cfg.logs.antinuke;
  if (cfg.logs.message) cfg.serverlog = cfg.logs.message;

  return { category: cat, ...results };
}

// Waisa panel jaisa screenshot: left commands + right bada VG CYBERSHIELD banner
const path = require('path');
const fs = require('fs');
const BANNER_DEFAULT = path.join(__dirname, '..', '..', 'assets', 'vg-banner.png');
const BANNER_CUSTOM = path.join(__dirname, '..', '..', 'assets', 'vg-banner-custom.png');
// Custom banner laga ho (.setbanner se) to wahi, warna default
function bannerPath() {
  try { if (fs.existsSync(BANNER_CUSTOM)) return BANNER_CUSTOM; } catch {}
  return BANNER_DEFAULT;
}
function bannerFile() {
  return { attachment: bannerPath(), name: 'vg-banner.png' };
}
// URL/attachment se image download karke save karo (max 8MB, image only)
async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed');
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error('ye image nahi hai');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error('image 8MB se badi hai');
  // magic bytes: png/jpg/gif/webp check
  const isImg = buf[0] === 0x89 && buf[1] === 0x50 // png
    || buf[0] === 0xFF && buf[1] === 0xD8 // jpg
    || (buf[0] === 0x47 && buf[1] === 0x49) // gif
    || (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP');
  if (!isImg) throw new Error('valid PNG/JPG/GIF/WebP bhejo');
  return buf;
}
// buffer se width x height nikalo (png/gif/jpg). webp/unknown -> null
function imgDims(b) {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 0x47 && b[1] === 0x49) return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b[0] === 0xFF && b[1] === 0xD8) {
      let o = 2;
      while (o < b.length - 9) {
        if (b[o] !== 0xFF) { o++; continue; }
        const m = b[o + 1];
        if (m >= 0xC0 && m <= 0xC3) return { w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5) };
        if (m === 0x01 || (m >= 0xD0 && m <= 0xD9)) { o += 2; continue; }
        o += 2 + b.readUInt16BE(o + 2);
      }
    }
  } catch {}
  return null;
}
function bannerInfo() {
  try {
    const p = bannerPath();
    const st = fs.statSync(p);
    const d = imgDims(fs.readFileSync(p));
    return { custom: p === BANNER_CUSTOM, kb: (st.size / 1024).toFixed(1), dims: d ? `${d.w}x${d.h}` : '?' };
  } catch { return { custom: false, kb: '?', dims: '?' }; }
}
function antinukeHelpEmbed() {
  const arrow = '<a:joya:1551156450825474048>';
  return new EmbedBuilder()
    .setColor(0x1a0b2e)
    .setTitle('<a:joya:1551154653201440828> ( 𝐀𝐧𝐭𝐢𝐧𝐮𝐤𝐞 & 𝐒𝐞𝐜𝐮𝐫𝐢𝐭𝐲 )')
    .addFields(
      {
        name: '<a:joya:1551154653201440828> ( 𝐀𝐧𝐭𝐢𝐧𝐮𝐤𝐞 𝐂𝐨𝐧𝐭𝐫𝐨𝐥𝐬 )',
        value: `${arrow} \`.antinuke\`\n${arrow} \`.antinuke enable\`\n${arrow} \`.antinuke disable\`\n${arrow} \`.antinuke status\``,
      },
      {
        name: '<a:vgtick:1559740802324893798> ( 𝐖𝐡𝐢𝐭𝐞𝐥𝐢𝐬𝐭 𝐒𝐲𝐬𝐭𝐞𝐦 )',
        value: `${arrow} \`.whitelist\`\n${arrow} \`.whitelist add <@user>\`\n${arrow} \`.whitelist remove <@user>\`\n${arrow} \`.whitelist show\`\n${arrow} \`.multiwhitelist add <@user1> <@user2> ...\`\n${arrow} \`.multiwhitelist remove <@user1> <@user2> ...\``,
      },
      {
        name: '<a:joya:1551393231642829001> ( 𝐄𝐱𝐭𝐫𝐚𝐨𝐰𝐧𝐞𝐫 𝐒𝐲𝐬𝐭𝐞𝐦 )',
        value: `${arrow} \`.extraowner\`\n${arrow} \`.extraowner add <@user>\`\n${arrow} \`.extraowner remove <@user>\`\n${arrow} \`.extraowner show\``,
      },
    )
    .setImage('attachment://vg-banner.png')
    .setFooter({ text: '© — ( 𝐕𝐆 𝐂𝐲𝐛𝐞𝐫𝐒𝐡𝐢𝐞𝐥𝐝 )' });
}

module.exports = { run, cfgEmbed, whitelistEmbed, antinukeHelpEmbed, navRow, bannerPath, bannerFile, setupRoles, setupLogs, applyRoleHierarchy };
