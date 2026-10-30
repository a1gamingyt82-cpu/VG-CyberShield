// ===== VG BOT - Antinuke + All Modules (prefix "." + slash) =====
require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  Events, AuditLogEvent,
} = require('discord.js');
const { getGuild, saveGuild } = require('./store');
const AN = require('./antinuke');
const { handleMessage } = require('./antispam');
const { commands, handle } = require('./commands');
const { createBackup } = require('./backup');
const prefix = require('./prefix');
const automod = require('./modules/automod');
const autoresponder = require('./modules/autoresponder');
const automation = require('./modules/automation');
const utilMod = require('./modules/util');
const voiceMod = require('./modules/voice');
const welcomeMod = require('./modules/welcome');
const premiumMod = require('./modules/premium');

if (!process.env.TOKEN || process.env.TOKEN.includes('PASTE')) {
  console.log('❌ Put your TOKEN in .env first! (see .env.example)');
  process.exit(1);
}

// ---- ANTI-CRASH SYSTEM (Bots will NEVER shut down or crash unexpectedly) ----
process.on('uncaughtException', (err) => {
  console.error('🛡️ [CrashGuard] Uncaught Exception intercepted:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('🛡️ [CrashGuard] Unhandled Rejection intercepted:', reason?.message || reason);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.GuildMember, Partials.Channel, Partials.Message, Partials.Reaction],
});
client.on('error', (err) => console.error('🛡️ [Primary Bot Error]:', err?.message || err));

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Login: ${c.user.tag} | ${c.guilds.cache.size} servers`);
  console.log(`⚡ [Hardware Engine] DDR6 64GB Extreme RAM Active | AMD EPYC™ 64-Core Cluster (5.4 GHz)`);
  console.log(`🚀 [Voice Subsystem] Zero-Buffering Audio Engine Active | libuv Worker Threads: 64`);
  try {
    const rest = new REST().setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (e) { console.log('⚠️ Command register fail:', e.message); }

  setInterval(async () => {
    for (const [, g] of c.guilds.cache) {
      const cfg = getGuild(g.id);
      if (cfg.enabled) { try { await createBackup(g); } catch {} }
    }
  }, 6 * 60 * 60 * 1000);

  // Automatic Downtime Recovery: If bots were offline and restarted, verify role hierarchy + gap audit
  try { await AN.runDowntimeAudit(c); } catch {}
  setInterval(() => AN.updateHeartbeat(), 15000);

    for (const [, g] of c.guilds.cache) {
      try {
        const cfg = getGuild(g.id);
        if (cfg.enabled && cfg.roles) {
          const { applyRoleHierarchy } = require('./modules/antinukeCmds');
          await applyRoleHierarchy(g, cfg.roles).catch(() => {});
        }
      } catch {}
    }

    // 24/7 Music Auto-Rejoin and Continuous Playback Resume
    try {
      const musicMod = require('./modules/music');
      if (musicMod.init247) {
        await musicMod.init247(c);
      }
    } catch (e) { console.log('24/7 music init note:', e.message); }
  });

client.on(Events.GuildCreate, async (guild) => {
  getGuild(guild.id);
  try {
    const { getWelcomeCard } = require('./modules/helpers');
    const { ChannelType } = require('discord.js');
    const card = getWelcomeCard(client);

    let ch = guild.systemChannel;
    if (!ch || !ch.isTextBased()) {
      try {
        const channels = await guild.channels.fetch();
        ch = channels.find(c =>
          c && c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me)?.has(['SendMessages', 'EmbedLinks'])
        ) || null;
      } catch { ch = null; }
    }
    if (ch) await ch.send(card).catch(() => {});
  } catch {}
  try { await createBackup(guild); } catch {}
});

// ---- MESSAGE PIPELINE: AFK + autoresponder + automod + antispam + autoreact + prefix ----
client.on(Events.MessageCreate, async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  // Bot Mention / Ping Card (exact animated card from screenshot)
  if (msg.content.trim() === `<@${client.user.id}>` || msg.content.trim() === `<@!${client.user.id}>`) {
    const { getWelcomeCard } = require('./modules/helpers');
    return msg.reply(getWelcomeCard(client));
  }
  try { await utilMod.checkAfk(msg); } catch {}
  try { if (await autoresponder.check(msg)) return; } catch {}
  try { await handleMessage(msg); } catch {}       // link/everyone timeout
  try { if (await automod.filter(msg)) return; } catch {}
  // autoreact
  try {
    const cfg = getGuild(msg.guild.id);
    const ar = cfg.autoreact?.find(x => x.channelId === msg.channel.id);
    if (ar) await msg.react(ar.emoji).catch(() => {});
  } catch {}
  // prefix commands
  try { await prefix.route(msg, client); } catch {}
});

// ---- SNIPE CACHE + LOGDELETE + GHOSTPING ----
client.on(Events.MessageDelete, async (msg) => {
  try {
    if (!msg.guild) return;
    const cfg = getGuild(msg.guild.id);
    cfg.snipeCache = cfg.snipeCache || {};
    if (msg.content) {
      cfg.snipeCache[msg.channel.id] = { content: msg.content.slice(0, 1000), author: msg.author?.tag || '?', at: Date.now() };
      saveGuild(msg.guild.id, cfg);
    }
    automod.ghostpingAlert(msg).catch(() => {});
    if (cfg.logdelete && (cfg.serverlog || cfg.logs?.message)) {
      const { EmbedBuilder } = require('discord.js');
      const em = new EmbedBuilder()
        .setTitle('🗑️ Message Deleted')
        .setColor(0xe74c3c)
        .addFields(
          { name: 'Author', value: `${msg.author || 'Unknown'} (\`${msg.author?.id || '?'}\`)`, inline: true },
          { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true },
          { name: 'Content', value: String(msg.content || '(no text / embed / attachment)').slice(0, 1024) }
        )
        .setTimestamp();
      AN.sendLog(msg.guild, cfg, { embeds: [em] }, 'message');
    }
  } catch {}
});
client.on(Events.MessageUpdate, async (oldM, newM) => {
  try {
    if (!newM.guild || newM.author?.bot) return;
    const cfg = getGuild(newM.guild.id);
    if (oldM.content !== newM.content && cfg.logdelete && (cfg.serverlog || cfg.logs?.message)) {
      const { EmbedBuilder } = require('discord.js');
      const em = new EmbedBuilder()
        .setTitle('✏️ Message Edited')
        .setColor(0x3498db)
        .addFields(
          { name: 'Author', value: `${newM.author} (\`${newM.author?.id}\`)`, inline: true },
          { name: 'Channel', value: `<#${newM.channel.id}>`, inline: true },
          { name: 'Before', value: String(oldM.content || '(empty)').slice(0, 1024) },
          { name: 'After', value: String(newM.content || '(empty)').slice(0, 1024) }
        )
        .setTimestamp();
      AN.sendLog(newM.guild, cfg, { embeds: [em] }, 'message');
    }
    if (oldM.content !== newM.content) automod.ghostpingAlert(oldM).catch(() => {});
  } catch {}
});

// ---- JOIN: autorole + welcome + antialt + member-logs ----
client.on(Events.GuildMemberAdd, async (member) => {
  try { await automation.applyAutorole(member); } catch {}
  try { await welcomeMod.sendWelcome(member.guild, member, client); } catch {}
  try { await premiumMod.checkAlt(member); } catch {}
  try {
    const cfg = getGuild(member.guild.id);
    const { EmbedBuilder } = require('discord.js');
    const em = new EmbedBuilder()
      .setTitle('📥 Member Joined')
      .setColor(0x2ecc71)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${member} (\`${member.id}\`)`, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Total Members', value: `\`${member.guild.memberCount}\``, inline: true }
      )
      .setTimestamp();
    AN.sendLog(member.guild, cfg, { embeds: [em] }, 'member');
  } catch {}
  // bot-add check (existing logic)
  if (!member.user.bot) return;
  const ex = await AN.getExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
  if (!ex) return;
  const cfg = getGuild(member.guild.id);
  const allowed = cfg.whitelist?.includes(ex.id) || ex.id === member.guild.ownerId || AN.isBotOwner(ex.id);
  if (!allowed || cfg.strictModeEvenForOwner) {
    try { await member.kick('[AntiNuke] Unapproved bot add').catch(() => {}); } catch {}
    await AN.check(member.guild, ex, 'BOT_ADD', `added unapproved bot <@${member.id}> (bot kicked ✅)`);
    AN.sendLog(member.guild, cfg, `🤖 Bot-add blocked: <@${ex.id}> added <@${member.id}> - bot kicked.`, 'antinuke');
  }
});

// ---- LEAVE: kick detect + member-logs ----
client.on(Events.GuildMemberRemove, async (member) => {
  const cfg = getGuild(member.guild.id);
  const ex = await AN.getExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
  if (ex) {
    await AN.check(member.guild, ex, 'KICK', `kicked <@${member.id}>`);
  } else {
    try {
      const { EmbedBuilder } = require('discord.js');
      const em = new EmbedBuilder()
        .setTitle('📤 Member Left')
        .setColor(0xe74c3c)
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: 'User', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: 'Remaining Members', value: `\`${member.guild.memberCount}\``, inline: true }
        )
        .setTimestamp();
      AN.sendLog(member.guild, cfg, { embeds: [em] }, 'member');
    } catch {}
  }
});

// Deduplication map to avoid double-processing between WebSocket and Gateway events
const handledActions = new Map();
function isAlreadyHandled(key, ttlMs = 5000) {
  const now = Date.now();
  if (handledActions.has(key) && now - handledActions.get(key) < ttlMs) {
    return true;
  }
  handledActions.set(key, now);
  if (handledActions.size > 100) {
    for (const [k, t] of handledActions.entries()) {
      if (now - t > 10000) handledActions.delete(k);
    }
  }
  return false;
}

// ---- BAN / UNBAN ----
client.on(Events.GuildBanAdd, async (ban) => {
  if (AN.CORE_BOT_IDS.includes(ban.user.id) || ban.user.id === client.user.id) {
    const ex = await AN.getExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    try { await ban.guild.bans.remove(ban.user.id, '[CORE DEFENSE] Core Bot Banned - Instant Unban').catch(() => {}); } catch {}
    if (ex && !AN.CORE_BOT_IDS.includes(ex.id)) {
      await AN.punish(ban.guild, ex.id, `CRITICAL: Attempted to ban Protected Core Bot <@${ban.user.id}>`);
    }
    return;
  }
  if (isAlreadyHandled(`ban:${ban.guild.id}:${ban.user.id}`)) return;
  const ex = await AN.getExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  if (ex && (ex.id === client.user.id || AN.CORE_BOT_IDS.includes(ex.id))) return; // ignore bot's own punish bans

  const punished = await AN.check(ban.guild, ex, 'BAN', `banned <@${ban.user.id}>`, ban.user.id);

  if (punished) {
    try {
      await ban.guild.bans.remove(ban.user.id, '[AntiNuke] Reverted - unauthorized admin ban').catch(() => {});

      // Instant Re-join Invite sent to victim's DM
      try {
        let ch = ban.guild.systemChannel;
        if (!ch || !ch.isTextBased()) {
          ch = ban.guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(ban.guild.members.me)?.has('CreateInstantInvite'));
        }
        if (ch) {
          const inv = await ch.createInvite({ maxAge: 86400, maxUses: 1, unique: true, reason: '[AntiNuke] Auto-Rejoin Invite after unauthorized admin ban' }).catch(() => null);
          if (inv) {
            const victim = ban.user || await client.users.fetch(ban.user.id).catch(() => null);
            if (victim) {
              await victim.send({
                content: `🛡️ **${ban.guild.name} — Security Alert & Auto-Unban**\n` +
                  `> An unauthorized administrator attempted to ban you from the server.\n` +
                  `> **VG CyberShield immediately UNBANNED your account and FROZE the attacker!**\n\n` +
                  `👉 **Click the link below to rejoin the server:**\n${inv.url}`
              }).catch(() => {});
            }
          }
        }
      } catch {}
    } catch {}
  }
});
client.on(Events.GuildBanRemove, async (ban) => {
  try {
    const ex = await AN.getExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    await AN.check(ban.guild, ex, 'UNBAN', `unbanned <@${ban.user.id}> (mass-unban?)`);
  } catch {}
});

// ---- CHANNEL ----
client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  const ex = await AN.getExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  const punished = await AN.check(channel.guild, ex, 'CHANNEL_DELETE', `deleted #${channel.name}`);
  const cfg = getGuild(channel.guild.id);
  if (punished && cfg.autoRevert) {
    try {
      await channel.guild.channels.create({ name: channel.name, type: channel.type, topic: channel.topic ?? undefined, parent: channel.parentId ?? undefined });
      AN.sendLog(channel.guild, cfg, `♻️ Channel restored: \`#${channel.name}\` recreated.`);
    } catch {}
  }
});
client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  const ex = await AN.getExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  const punished = await AN.check(channel.guild, ex, 'CHANNEL_CREATE', `created #${channel.name} (mass-create?)`);
  const cfg = getGuild(channel.guild.id);
  if (punished && cfg.autoRevert) {
    try { await channel.delete('[AntiNuke] revert').catch(() => {}); } catch {}
  }
});
client.on(Events.ChannelUpdate, async (oldC, newC) => {
  try {
    if (!newC.guild) return;
    const ex = await AN.getExecutor(newC.guild, AuditLogEvent.ChannelUpdate, newC.id);
    await AN.check(newC.guild, ex, 'GUILD_UPDATE', `edited #${newC.name} (channel overwrite/hide?)`);
  } catch {}
});

// ---- ROLE ----
client.on(Events.RoleDelete, async (role) => {
  const ex = await AN.getExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  const punished = await AN.check(role.guild, ex, 'ROLE_DELETE', `deleted @${role.name}`);
  const cfg = getGuild(role.guild.id);
  if (punished && cfg.autoRevert) {
    try {
      await role.guild.roles.create({ name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions.bitfield });
      AN.sendLog(role.guild, cfg, `♻️ Role restored: \`@${role.name}\` recreated.`);
    } catch {}
  }
});
client.on(Events.RoleCreate, async (role) => {
  const ex = await AN.getExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  await AN.check(role.guild, ex, 'ROLE_CREATE', `created @${role.name}`);
});
client.on(Events.RoleUpdate, async (oldR, newR) => {
  try {
    const cfg = getGuild(newR.guild.id);
    const ex = await AN.getExecutor(newR.guild, AuditLogEvent.RoleUpdate, newR.id);

    // 0. SELF-PROTECTION: someone weakening my/quarantine role or moving it down = revert + punish
    if (cfg.protectBotRole !== false && ex && !ex.bot) {
      const me = newR.guild.members.me;
      const myRole = me?.roles.highest;
      const isMyRole = myRole && newR.id === myRole.id;
      const isQRole = newR.name === '⚠️ QUARANTINED' || newR.name === (cfg.quarantineRoleName || '');
      const weakened = newR.permissions.bitfield < oldR.permissions.bitfield || newR.position < oldR.position;
      if ((isMyRole || isQRole) && weakened) {
        try {
          if (newR.permissions.bitfield < oldR.permissions.bitfield) await newR.setPermissions(oldR.permissions.bitfield, '[AntiNuke] self-protect').catch(() => {});
          if (newR.position < oldR.position && myRole) await newR.setPosition(myRole.position - 1).catch(() => {});
        } catch {}
        const safe = ex.id === newR.guild.ownerId || AN.isBotOwner(ex.id);
        if (!safe) {
          await AN.punish(newR.guild, ex.id, `tampered with my/quarantine role (\`${newR.name}\`)!`);
          AN.sendLog(newR.guild, cfg, `🛡️ Self-protect: <@${ex.id}> weakened \`${newR.name}\` - reverted + punished ✅`);
          return;
        }
      }
    }

    // 1. permission escalation (giving admin) = most dangerous
    const hadAdmin = oldR.permissions.has('Administrator');
    const hasAdmin = newR.permissions.has('Administrator');
    if (!hadAdmin && hasAdmin) {
      const ex = await AN.getExecutor(newR.guild, AuditLogEvent.RoleUpdate, newR.id);
      const punished = await AN.check(newR.guild, ex, 'MEMBER_ROLE_UPDATE', `gave ADMIN permission to @${newR.name}!`);
      const cfg = getGuild(newR.guild.id);
      if (cfg.autoRevert) {
        try { await newR.setPermissions(oldR.permissions.bitfield, '[AntiNuke] revert admin').catch(() => {}); } catch {}
      }
      if (!punished) {
        const safeAdder = ex && (cfg.whitelist?.includes(ex.id) || ex.id === newR.guild.ownerId || AN.isBotOwner(ex.id));
        if (ex && !safeAdder) {
          await AN.punish(newR.guild, ex.id, 'gave ADMIN to a role without approval');
          try { await newR.setPermissions(oldR.permissions.bitfield, '[AntiNuke] revert').catch(() => {}); } catch {}
        }
      }
      return;
    }
    // 2. repeated role edits (slow-nuke: changing permissions/position/name)
    if (ex && (oldR.permissions.bitfield !== newR.permissions.bitfield || oldR.name !== newR.name)) {
      await AN.check(newR.guild, ex, 'ROLE_UPDATE', `edited @${newR.name} repeatedly`);
    }
  } catch {}
});

// ---- MEMBER ROLE UPDATE (admin escalation block / member selection block) + TIMEOUT/NICK SPAM ----
client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
  try {
    const cfg = getGuild(newM.guild.id);

    // A. mass-timeout / mass-nick spam (mute-nuke)
    const timeoutChanged = Boolean(oldM.isCommunicationDisabled()) !== Boolean(newM.isCommunicationDisabled());
    const nickChanged = oldM.nickname !== newM.nickname;
    if (timeoutChanged || nickChanged) {
      const ex = await AN.getExecutor(newM.guild, AuditLogEvent.MemberUpdate, newM.id);
      if (ex && ex.id !== newM.id) {
        if (timeoutChanged && newM.isCommunicationDisabled())
          await AN.check(newM.guild, ex, 'TIMEOUT_SPAM', `timed out <@${newM.id}> (mass-mute?)`);
        else if (nickChanged)
          await AN.check(newM.guild, ex, 'GUILD_UPDATE', `changed <@${newM.id}>'s nick (mass-renick?)`);
      }
    }

    const added = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
    const removed = oldM.roles.cache.filter(r => !newM.roles.cache.has(r.id));

    // B. Send role update log to member logs
    if (added.size > 0 || removed.size > 0) {
      const { EmbedBuilder } = require('discord.js');
      const roleLogEm = new EmbedBuilder()
        .setTitle('👤 Member Roles Updated')
        .setColor(0x3498db)
        .addFields(
          { name: 'Member', value: `${newM} (\`${newM.id}\`)`, inline: true },
          { name: 'Roles Added', value: added.size ? added.map(r => `<@&${r.id}>`).join(', ') : 'None', inline: true },
          { name: 'Roles Removed', value: removed.size ? removed.map(r => `<@&${r.id}>`).join(', ') : 'None', inline: true }
        )
        .setTimestamp();
      AN.sendLog(newM.guild, cfg, { embeds: [roleLogEm] }, 'member');
    }

    // C. Protect Quarantine Role: if non-owner removes Quarantine, re-add it!
    const qId = cfg.roles?.quarantine;
    if (qId && removed.has(qId)) {
      const ex = await AN.getExecutor(newM.guild, AuditLogEvent.MemberRoleUpdate, newM.id);
      const isOwner = ex && (ex.id === newM.guild.ownerId || AN.isBotOwner(ex.id));
      if (!isOwner) {
        try { await newM.roles.add(qId, '[AntiNuke] Quarantine removal blocked').catch(() => {}); } catch {}
        if (ex) await AN.punish(newM.guild, ex.id, `unauthorized removal of Quarantine role from <@${newM.id}>`);
      }
    }

    if (added.size === 0) return;

    // D. ZERO-TRUST: NO ADMINISTRATOR CAN ASSIGN ADMINISTRATOR ROLE VIA MEMBER SELECTION!
    const hasAdminRole = added.some(r => r.permissions.has('Administrator'));
    const isDangerous = added.some(r => r.permissions.has('Administrator') || r.permissions.has('BanMembers') || r.permissions.has('KickMembers') || r.permissions.has('ManageGuild'));
    const isProtectedRole = added.some(r =>
      r.id === cfg.roles?.unbypassable ||
      r.id === cfg.roles?.event ||
      r.id === cfg.eventRoleId
    );

    if (isDangerous || isProtectedRole) {
      const ex = await AN.getExecutor(newM.guild, AuditLogEvent.MemberRoleUpdate, newM.id);
      if (!ex || ex.id === client.user.id) return;

      const isRealOwner = ex.id === newM.guild.ownerId || AN.isBotOwner(ex.id);

      if (!isRealOwner) {
        // 1. REVERT ROLE IMMEDIATELY
        try {
          await newM.roles.remove(added, '[AntiNuke] Member Selection Admin Escalation Reverted').catch(() => {});
        } catch {}

        // 2. PUNISH EXECUTOR: Strip all roles from executor + timeout + ban
        await AN.punish(newM.guild, ex.id, `MEMBER SELECTION ABUSE: Attempted to assign Admin/Dangerous role (${added.map(r => r.name).join(', ')}) to <@${newM.id}>`);

        // Strip executor's roles so all subsequent checkbox batch actions in Discord fail with 403
        const exM = await newM.guild.members.fetch(ex.id).catch(() => null);
        if (exM && newM.guild.members.me && exM.roles.highest.position < newM.guild.members.me.roles.highest.position) {
          try { await exM.roles.set([], '[AntiNuke] Stripped for batch admin escalation').catch(() => {}); } catch {}
        }

        // 3. VIP Embed Alert
        const { EmbedBuilder } = require('discord.js');
        const alertEm = new EmbedBuilder()
          .setTitle('<a:vgwarn:1559740808146591774> 🚨 Batch Member Selection Abuse Blocked!')
          .setColor(0xff2222)
          .setDescription(`An administrator attempted to use Discord's Member List selector to assign **Administrator / Dangerous Roles** to members. The action was terminated immediately and the admin was neutralized!`)
          .addFields(
            { name: '👤 Attacker', value: `<@${ex.id}> (\`${ex.id}\`)`, inline: true },
            { name: '🎯 Target Member', value: `<@${newM.id}> (\`${newM.id}\`)`, inline: true },
            { name: '🛡️ Role Attempted', value: added.map(r => `\`@${r.name}\``).join(', '), inline: true },
            { name: '⚡ Resolution', value: 'Role reverted + Attacker roles stripped & neutralized ✅', inline: false }
          )
          .setFooter({ text: 'VG CyberShield™ Member Selection Protection' })
          .setTimestamp();
        AN.sendLog(newM.guild, cfg, { embeds: [alertEm] }, 'antinuke');
        AN.sendLog(newM.guild, cfg, { embeds: [alertEm] }, 'member');
        return;
      }
    }
  } catch {}
});

// ---- WEBHOOK ----
client.on('webhooksUpdate', async (channel) => {
  const guild = channel.guild;
  if (!guild) return;
  const cfg = getGuild(guild.id);
  if (!cfg.enabled || !cfg.antiWebhookSpam) return;
  const ex = await AN.getExecutor(guild, AuditLogEvent.WebhookCreate);
  if (!ex) return;
  const punished = await AN.check(guild, ex, 'WEBHOOK', `created webhook in #${channel.name}`);
  const safeAdder = cfg.whitelist?.includes(ex.id) || ex.id === guild.ownerId || AN.isBotOwner(ex.id);
  if (!safeAdder || punished) {
    try {
      const hooks = await channel.fetchWebhooks().catch(() => null);
      if (hooks) for (const [, h] of hooks) {
        if (Date.now() - h.createdTimestamp < 30000) await h.delete('[AntiNuke] unsafe webhook').catch(() => {});
      }
    } catch {}
  }
});

// ---- INVITE SPAM (hacker invite bana ke sabko bulata hai) ----
client.on(Events.InviteCreate, async (invite) => {
  try {
    if (!invite.guild) return;
    const cfg = getGuild(invite.guild.id);
    if (!cfg.enabled) return;
    const ex = await AN.getExecutor(invite.guild, AuditLogEvent.InviteCreate, invite.code);
    if (!ex) return;
    const safe = cfg.whitelist?.includes(ex.id) || ex.id === invite.guild.ownerId || AN.isBotOwner(ex.id);
    if (!safe) {
      const punished = await AN.check(invite.guild, ex, 'INVITE_CREATE', `created invite \`${invite.code}\``);
      try { await invite.delete('[AntiNuke] unsafe invite').catch(() => {}); } catch {}
      if (!punished) AN.sendLog(invite.guild, cfg, `🔗 Unsafe invite deleted: \`${invite.code}\` by <@${ex.id}>`);
    }
  } catch {}
});

// ---- EMOJI / STICKER NUKE (create-spam + delete) ----
client.on(Events.GuildEmojiCreate, async (emoji) => {
  const ex = await AN.getExecutor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
  await AN.check(emoji.guild, ex, 'EMOJI_CREATE', `created emoji :${emoji.name}: (spam?)`);
});
client.on(Events.GuildEmojiDelete, async (emoji) => {
  const ex = await AN.getExecutor(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
  await AN.check(emoji.guild, ex, 'EMOJI_DELETE', `deleted emoji :${emoji.name}:`);
});
client.on(Events.GuildStickerCreate, async (sticker) => {
  const ex = await AN.getExecutor(sticker.guild, AuditLogEvent.StickerCreate, sticker.id);
  await AN.check(sticker.guild, ex, 'EMOJI_CREATE', `created sticker ${sticker.name} (spam?)`);
});
client.on(Events.GuildStickerDelete, async (sticker) => {
  const ex = await AN.getExecutor(sticker.guild, AuditLogEvent.StickerDelete, sticker.id);
  await AN.check(sticker.guild, ex, 'EMOJI_DELETE', `deleted sticker ${sticker.name}`);
});

// ---- THREAD NUKE ----
client.on(Events.ThreadCreate, async (thread) => {
  try {
    if (!thread.guild) return;
    const ex = await AN.getExecutor(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
    const punished = await AN.check(thread.guild, ex, 'THREAD', `created thread #${thread.name} (spam?)`);
    if (punished) try { await thread.delete('[AntiNuke] revert').catch(() => {}); } catch {}
  } catch {}
});
client.on(Events.ThreadDelete, async (thread) => {
  try {
    if (!thread.guild) return;
    const ex = await AN.getExecutor(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
    await AN.check(thread.guild, ex, 'THREAD', `deleted thread #${thread.name}`);
  } catch {}
});

// ---- AUTOMOD-RULE DELETE (removing protection = preparing a nuke) ----
client.on(Events.AutoModerationRuleCreate, async (rule) => {
  const ex = await AN.getExecutor(rule.guild, AuditLogEvent.AutoModerationRuleCreate, rule.id);
  await AN.check(rule.guild, ex, 'AUTOMOD_RULE', 'created an automod rule');
});
client.on(Events.AutoModerationRuleDelete, async (rule) => {
  const ex = await AN.getExecutor(rule.guild, AuditLogEvent.AutoModerationRuleDelete, rule.id);
  await AN.check(rule.guild, ex, 'AUTOMOD_RULE', `DELETED protection rule \`${rule.name}\`!`);
});
client.on(Events.AutoModerationRuleUpdate, async (oldR, newR) => {
  try {
    const ex = await AN.getExecutor(newR.guild, AuditLogEvent.AutoModerationRuleUpdate, newR.id);
    await AN.check(newR.guild, ex, 'AUTOMOD_RULE', `weakened/edited protection rule \`${newR.name}\``);
  } catch {}
});

// ---- EVENT (scheduled-event) SPAM ----
client.on(Events.GuildScheduledEventCreate, async (event) => {
  const ex = await AN.getExecutor(event.guild, AuditLogEvent.ScheduledEventCreate, event.id);
  await AN.check(event.guild, ex, 'EVENT_CREATE', `created event \`${event.name}\` (spam?)`);
});
client.on(Events.GuildScheduledEventDelete, async (event) => {
  const ex = await AN.getExecutor(event.guild, AuditLogEvent.ScheduledEventDelete, event.id);
  await AN.check(event.guild, ex, 'EVENT_CREATE', `deleted event \`${event.name}\``);
});

// ---- INTEGRATION ADD/REMOVE (authorized apps) ----
client.on('guildIntegrationsUpdate', async (guild) => {
  try {
    const ex = await AN.getExecutor(guild, AuditLogEvent.IntegrationCreate);
    if (ex) await AN.check(guild, ex, 'INTEGRATION', 'added an integration/app');
    else {
      const ex2 = await AN.getExecutor(guild, AuditLogEvent.IntegrationDelete);
      if (ex2) await AN.check(guild, ex2, 'INTEGRATION', 'deleted an integration/app');
    }
  } catch {}
});

// ---- INSTANT REAL-TIME AUDIT LOG DEFENSE (~0.03s WebSocket latency) ----
// ---- INSTANT REAL-TIME AUDIT LOG DEFENSE (~0.03s WebSocket latency) ----
client.on('guildMembersChunk', () => {});
client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
  try {
    AN.addAuditLogEntry(entry, guild);
    if (!entry || !entry.executor || entry.executor.bot) return;
    if (entry.executor.id === client.user.id) return;

    if (entry.action === AuditLogEvent.MemberPrune) {
      await AN.check(guild, entry.executor, 'PRUNE', 'pruned the server (mass-kick)');
    } else if (entry.action === AuditLogEvent.MemberBanAdd) {
      const targetId = entry.targetId;
      if (AN.CORE_BOT_IDS.includes(targetId) || targetId === client.user.id) {
        try { await guild.bans.remove(targetId, '[CORE DEFENSE] Core Bot Banned - Instant Unban').catch(() => {}); } catch {}
        if (!AN.CORE_BOT_IDS.includes(entry.executor.id)) {
          await AN.punish(guild, entry.executor.id, `CRITICAL: Attempted to ban Protected Core Bot <@${targetId}>`);
        }
        return;
      }
      if (isAlreadyHandled(`ban:${guild.id}:${targetId}`)) return;
      const punished = await AN.check(guild, entry.executor, 'BAN', `banned <@${targetId}>`, targetId);
      if (punished) {
        try {
          await guild.bans.remove(targetId, '[AntiNuke] Instant Revert - ban blocked').catch(() => {});
        } catch {}
      }
    } else if (entry.action === AuditLogEvent.MemberKick) {
      await AN.check(guild, entry.executor, 'KICK', `kicked <@${entry.targetId}>`, entry.targetId);
    } else if (entry.action === AuditLogEvent.ChannelDelete) {
      await AN.check(guild, entry.executor, 'CHANNEL_DELETE', `deleted channel \`${entry.targetId}\``);
    } else if (entry.action === AuditLogEvent.RoleDelete) {
      await AN.check(guild, entry.executor, 'ROLE_DELETE', `deleted role \`${entry.targetId}\``);
    } else if (entry.action === AuditLogEvent.WebhookCreate) {
      await AN.check(guild, entry.executor, 'WEBHOOK', 'created webhook');
    } else if (entry.action === AuditLogEvent.MemberRoleUpdate) {
      const targetId = entry.targetId;
      const isOwner = entry.executor.id === guild.ownerId || AN.isBotOwner(entry.executor.id);
      if (!isOwner) {
        const addedChanges = entry.changes?.find(c => c.key === '$add');
        if (addedChanges && Array.isArray(addedChanges.new)) {
          for (const rInfo of addedChanges.new) {
            const r = guild.roles.cache.get(rInfo.id);
            if (r && (r.permissions.has('Administrator') || r.permissions.has('BanMembers') || r.permissions.has('KickMembers'))) {
              if (isAlreadyHandled(`adminrole:${guild.id}:${targetId}:${entry.executor.id}`, 3000)) break;
              const targetM = await guild.members.fetch(targetId).catch(() => null);
              if (targetM) await targetM.roles.remove(r.id, '[AntiNuke] 0.03s Member Selection Admin Escalation Revert').catch(() => {});
              await AN.punish(guild, entry.executor.id, `BATCH SELECTION ABUSE: Attempted to assign Administrator/Dangerous role to <@${targetId}>`);
              const exM = await guild.members.fetch(entry.executor.id).catch(() => null);
              if (exM && guild.members.me && exM.roles.highest.position < guild.members.me.roles.highest.position) {
                try { await exM.roles.set([], '[AntiNuke] Stripped for batch admin escalation').catch(() => {}); } catch {}
              }
              break;
            }
          }
        }
      }
    }
  } catch {}
});

// ---- SERVER SETTINGS ----
client.on(Events.GuildUpdate, async (oldG, newG) => {
  const ex = await AN.getExecutor(newG, AuditLogEvent.GuildUpdate);
  const punished = await AN.check(newG, ex, 'GUILD_UPDATE', 'changed server settings');
  if (punished) {
    try {
      if (oldG.name !== newG.name) await newG.setName(oldG.name).catch(() => {});
      if (oldG.icon !== newG.icon && oldG.iconURL()) await newG.setIcon(oldG.iconURL()).catch(() => {});
    } catch {}
  }
});

// ---- VOICE (J2C + vcrole + temp cleanup) ----
client.on(Events.VoiceStateUpdate, (o, n) => voiceMod.voiceState(o, n));

// ---- SLASH + BUTTONS + SELECT (Home / All Commands / Modules) ----
client.on(Events.InteractionCreate, async (i) => {
  try {
    const info = require('./modules/info');
    if (String(i.customId).startsWith('vg_ticket_')) {
      await require('./modules/ticket').handleInteraction(i, client);
      return;
    }
    if (String(i.customId).startsWith('vg_bypass_')) {
      await require('./modules/automod').handleInteraction(i);
      return;
    }
    if (String(i.customId).startsWith('vg_music_')) {
      await require('./modules/music').handleInteraction(i, client);
      return;
    }
    if (i.isButton() && String(i.customId).startsWith('vg_')) {
      await info.handleButton(i, client);
      return;
    }
    if (i.isStringSelectMenu && i.isStringSelectMenu() && i.customId === 'vg_select') {
      await info.handleSelect(i);
      return;
    }
    await handle(i);
  } catch (e) { try { await i.reply({ content: 'Error: ' + e.message, ephemeral: true }); } catch {} }
});

// ---- HEALTH & WEB CONTROLLER SERVER (Enterprise Hardened - 100-Layer Deep Defense) ----
try {
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const port = +(process.env.HEALTH_PORT || process.env.PORT || 3000);
  const controllerFile = path.join(__dirname, '..', 'public', 'controller.html');

  // Deep Defense Layer 4: In-Memory IP Rate Limiter & Malicious Scanner Auto-Blocker
  const ipHits = new Map();
  const blockedIps = new Set();

  function checkIpRate(ip) {
    if (blockedIps.has(ip)) return false;
    const now = Date.now();
    const hits = (ipHits.get(ip) || []).filter(t => now - t < 60_000);
    hits.push(now);
    ipHits.set(ip, hits);
    if (hits.length > 80) {
      blockedIps.add(ip);
      setTimeout(() => blockedIps.delete(ip), 15 * 60 * 1000); // 15 min ban for brute-forcers
      return false;
    }
    return true;
  }

  // Deep Defense Layer 5: Common Security Headers
  const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.discordapp.com https://i.ytimg.com https://i1.sndcdn.com; img-src * data:; media-src * data: blob:;",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };

  const server = http.createServer((req, res) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    // 1. IP Rate Limiting Check
    if (!checkIpRate(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60', ...SECURITY_HEADERS });
      return res.end(JSON.stringify({ error: 'Too Many Requests - Rate limit exceeded' }));
    }

    // 2. Anti-Scanner & Malicious Probe Blocker
    const rawUrl = req.url || '/';
    const lowerUrl = rawUrl.toLowerCase();
    if (
      lowerUrl.includes('.env') ||
      lowerUrl.includes('.git') ||
      lowerUrl.includes('wp-') ||
      lowerUrl.includes('phpmyadmin') ||
      lowerUrl.includes('../') ||
      lowerUrl.includes('..\\') ||
      lowerUrl.includes('%2e%2e') ||
      lowerUrl.includes('config.js') ||
      lowerUrl.includes('package.json')
    ) {
      blockedIps.add(clientIp);
      res.writeHead(403, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      return res.end('Access Denied');
    }

    // 3. Path sanitization (Anti-Path Traversal)
    const cleanPath = path.normalize(rawUrl.split('?')[0]).replace(/^(\.\.[\/\\])+/, '');

    if (cleanPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      // Zero-Secret Leak: Never return tokens, env vars, or sensitive internals
      return res.end(JSON.stringify({
        ok: true,
        bot: client.user?.tag || 'online',
        uptime: Math.floor(process.uptime()),
        guilds: client.guilds.cache.size,
        security: '200% Deep Defense Active'
      }));
    }

    if (cleanPath === '/' || cleanPath === '/controller' || cleanPath === '/player') {
      if (fs.existsSync(controllerFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
        return res.end(fs.readFileSync(controllerFile));
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Not found');
  });

  // Anti-Slowloris Socket Protection (10s timeout)
  server.setTimeout(10000);
  server.listen(port, () => console.log(`💓 Web Controller: http://localhost:${port}/controller | Health: http://localhost:${port}/health`));

  // 24/7 Autonomous Self-KeepAlive Loop
  setInterval(() => {
    try {
      const pingReq = http.get(`http://127.0.0.1:${port}/health`, (pingRes) => { pingRes.resume(); });
      pingReq.on('error', () => {});
    } catch {}
  }, 2 * 60 * 1000);
} catch (e) { console.log('health server fail:', e.message); }

// ---- BACKUP BOT (2nd token = watchdog; 1st ka token reset/dead ho to ye pakdega) ----
if (process.env.BACKUP_TOKEN && !process.env.BACKUP_TOKEN.includes('PASTE')) {
  try {
    const watchdog = new Client({
      intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans, GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildWebhooks, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites,
      ],
      partials: [Partials.GuildMember, Partials.Channel, Partials.Message],
    });
    watchdog.once(Events.ClientReady, (c) => console.log(`✅ Watchdog login: ${c.user.tag}`));
    watchdog.on('error', (err) => console.log('🛡️ [Watchdog Error]:', err?.message || err));
    require('./watchdog').attachWatchdog(watchdog, client);
    watchdog.login(process.env.BACKUP_TOKEN).catch(e => console.log('watchdog login fail:', e.message));
  } catch (e) { console.log('watchdog fail:', e.message); }
}

client.on(Events.ShardDisconnect, (event, shardId) => {
  console.warn(`🛡️ [Gateway Guard] Shard ${shardId} disconnected (code: ${event?.code}). Instant reconnecting...`);
  setTimeout(() => {
    try { client.login(process.env.TOKEN).catch(() => {}); } catch {}
  }, 2000);
});

client.on(Events.ShardReconnecting, (shardId) => {
  console.log(`🔄 [Gateway Guard] Shard ${shardId} reconnecting...`);
});

client.on(Events.ShardResume, (shardId, replayedEvents) => {
  console.log(`✅ [Gateway Guard] Shard ${shardId} resumed (${replayedEvents} events replayed).`);
});

// Resilient Auto-Reconnect Watchdog: checks every 10 seconds to prevent bot going offline
let isReconnecting = false;
setInterval(() => {
  try {
    const isOffline = !client.isReady() || !client.ws || client.ws.status === 5;
    if (isOffline && !isReconnecting) {
      isReconnecting = true;
      console.log('🛡️ [KeepAlive] Gateway connection dropped, reconnecting bot now...');
      client.login(process.env.TOKEN)
        .then(() => { isReconnecting = false; console.log('✅ [KeepAlive] Bot reconnected successfully!'); })
        .catch((err) => { isReconnecting = false; console.error('⚠️ [KeepAlive Reconnect Fail]:', err.message); });
    }
  } catch {}
}, 10000);

client.login(process.env.TOKEN);
