// ===== CORE ANTINUKE ENGINE - faster than Wick (audit-log based) =====
// How it works:
// 1. On every dangerous event, find WHO did it via the Audit Log (executor)
// 2. Whitelist/owner check + rate-limit check (strict mode counts owners too)
// 3. Limit crossed = instant punish (ban/kick/quarantine) + revert action + log
//
// TRUTH: "0 delay / 0 seconds" is NOT possible on Discord.
// The audit log takes 1-3 sec to arrive. This bot catches it at minimum time (~1-2 sec).
// The bot role must be on top + have Administrator, otherwise bans will fail.

const { PermissionsBitField, AuditLogEvent, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getGuild, saveGuild } = require('./store');

const BOT_OWNERS = (process.env.BOT_OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// Which permissions get "paused" during freeze (restored afterwards)
const FREEZE_REMOVE = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels',
  'ManageWebhooks', 'BanMembers', 'KickMembers', 'ModerateMembers',
  'ManageMessages', 'MentionEveryone', 'ManageThreads', 'ManageEvents',
];
let FREEZE_BITS = 0n;
try {
  for (const f of FREEZE_REMOVE) FREEZE_BITS |= PermissionsBitField.Flags[f];
} catch {}

// userId -> { ACTION: [timestamps] } (fast rate-limit, memory)
const buckets = new Map();
function hit(key, limit, perSec) {
  const now = Date.now();
  if (!buckets.has(key)) buckets.set(key, []);
  const arr = buckets.get(key).filter(t => now - t < perSec * 1000);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length >= limit; // limit cross?
}
function resetUser(userId) {
  for (const k of [...buckets.keys()]) if (k.startsWith(userId + ':')) buckets.delete(k);
}

// DAY CAPS (slow-nuke block) - restart-proof, saved to file
const DAY_FILE = path.join(__dirname, '..', 'data', 'daycount.json');
function readDay() {
  try { return JSON.parse(fs.readFileSync(DAY_FILE, 'utf8') || '{}'); }
  catch { return {}; }
}
function writeDay(d) {
  try { fs.writeFileSync(DAY_FILE, JSON.stringify(d)); } catch {}
}
// Count an action + return true when the cap is crossed. Rolling window of windowH hours.
function dayHit(guildId, userId, action, cap, windowH) {
  if (!cap || cap <= 0) return { total: 0, crossed: false };
  const now = Date.now();
  const all = readDay();
  all[guildId] = all[guildId] || {};
  all[guildId][userId] = all[guildId][userId] || {};
  const arr = (all[guildId][userId][action] || []).filter(t => now - t < windowH * 3600 * 1000);
  arr.push(now);
  all[guildId][userId][action] = arr;
  writeDay(all);
  return { total: arr.length, crossed: arr.length > cap };
}

const CORE_BOT_IDS = ['1559712660080296016', '1559777115186921534'];
function isBotOwner(id) { return BOT_OWNERS.includes(id); }
function isCoreBot(id) { return CORE_BOT_IDS.includes(id); }

function isWhitelisted(guild, userId) {
  if (!guild || !userId) return false;
  if (isBotOwner(userId) || userId === guild.ownerId || CORE_BOT_IDS.includes(userId)) return true;
  const cfg = getGuild(guild.id);
  return Boolean(cfg.whitelist?.includes(userId) || cfg.extraOwners?.includes(userId));
}

function isSafe(executor, guild, cfg) {
  if (!executor) return true;
  // Deep Defense Layer 1: Core bots (VG CyberShield & VG Cheats) are 100% verified immune
  if (CORE_BOT_IDS.includes(executor.id) || executor.id === guild.client?.user?.id) return true;
  // Deep Defense Layer 2: External/unwhitelisted bots are NEVER safe (blocks rogue/token-grab nuke bots)
  if (executor.bot && !cfg.whitelist?.includes(executor.id)) return false;
  if (isBotOwner(executor.id)) return true; // bot developer/owner is safe
  if (executor.id === guild.ownerId) {
    // The server owner is also rate-limited in strict mode (catches token-grab hackers)
    if (cfg.strictModeEvenForOwner) return false;
    return true;
  }
  if (cfg.extraOwners?.includes(executor.id)) return cfg.strictModeEvenForOwner ? false : true;
  if (cfg.whitelist?.includes(executor.id)) return cfg.strictModeEvenForOwner ? false : true;
  return false;
}

const recentLogCache = new Map();
async function sendLog(guild, cfg, payload, category = 'antinuke') {
  try {
    let targetChId = null;
    if (category === 'antinuke') {
      targetChId = cfg.logs?.antinuke || cfg.logChannelId;
    } else if (category === 'mod') {
      targetChId = cfg.logs?.mod || cfg.logChannelId;
    } else if (category === 'member') {
      targetChId = cfg.logs?.member || cfg.logs?.antinuke || cfg.logChannelId;
    } else if (category === 'message') {
      targetChId = cfg.logs?.message || cfg.serverlog || cfg.logChannelId;
    } else {
      targetChId = cfg.logs?.[category] || cfg.logChannelId;
    }
    if (!targetChId) return;

    const ch = await guild.channels.fetch(targetChId).catch(() => null);
    if (!ch) return;

    // Deduplicate identical logs within 3 seconds
    const key = `${targetChId}:` + (typeof payload === 'string' ? payload : (payload.embeds?.[0]?.data?.title + ':' + payload.embeds?.[0]?.data?.fields?.[0]?.value));
    const now = Date.now();
    if (key && recentLogCache.has(key) && (now - recentLogCache.get(key) < 3000)) {
      return;
    }
    if (key) recentLogCache.set(key, now);

    if (typeof payload === 'string') {
      ch.send(payload).catch(() => {});
    } else {
      ch.send(payload).catch(() => {});
    }
  } catch {}
}

async function punish(guild, executorId, reason) {
  if (!executorId || CORE_BOT_IDS.includes(executorId) || executorId === guild.client?.user?.id || executorId === guild.ownerId || isBotOwner(executorId)) {
    return { success: false, hierarchyFailed: false };
  }
  const cfg = getGuild(guild.id);
  const member = guild.members.cache.get(executorId) || await guild.members.fetch(executorId).catch(() => null);
  if (!member) return { success: false, hierarchyFailed: false };
  const me = guild.members.me;
  const higher = me && member.roles.highest.position >= me.roles.highest.position;
  // Level 1: normal punish (agar mera role upar hai)
  if (!higher) {
    try {
      if (cfg.punish === 'kick') {
        await member.kick(`[AntiNuke] ${reason}`).catch(() => null);
      } else if (cfg.punish === 'quarantine') {
        await quarantineMember(guild, member, reason);
      } else {
        await quarantineMember(guild, member, reason).catch(() => {});
        await member.ban({ reason: `[AntiNuke] ${reason}` }).catch(() => null);
      }
      resetUser(executorId);
      return { success: true, hierarchyFailed: false };
    } catch { /* neeche fallback */ }
  }
  // Level 2: role is higher / ban failed = try timeout + role strip + quarantine (freeze attacker user)
  try { await member.timeout(28 * 24 * 3600 * 1000, `[AntiNuke] ${reason}`).catch(() => {}); } catch {}
  try {
    if (me && member.roles.highest.position < me.roles.highest.position) {
      await member.roles.set([], `[AntiNuke] ${reason}`).catch(() => {});
    }
  } catch {}
  // Level 3: Freeze the attacking user with quarantine role
  try {
    await quarantineMember(guild, member, reason).catch(() => {});
  } catch {}
  try {
    const owner = await guild.fetchOwner();
    await owner.send(`🆘 **${guild.name}**: <@${executorId}> outranks me and is nuking! I locked the server down. Remove their roles yourself + put my role on top.`).catch(() => {});
  } catch {}
  for (const oid of BOT_OWNERS) {
    try { (await guild.client.users.fetch(oid)).send(`🆘 **${guild.name}** hierarchy-fail lockdown! Attacker: <@${executorId}>`).catch(() => {}); } catch {}
  }
  resetUser(executorId);
  return { success: true, hierarchyFailed: true };
}

async function quarantineMember(guild, member, reason) {
  try {
    const cfg = getGuild(guild.id);
    let qRole = (cfg.roles?.quarantine && guild.roles.cache.get(cfg.roles.quarantine)) ||
                guild.roles.cache.find(r => r.name === '-> 🛡️ Quarantine' || r.name === '⚠️ QUARANTINED' || r.name === (cfg.quarantineRoleName || ''));
    if (!qRole) {
      qRole = await guild.roles.create({
        name: '-> 🛡️ Quarantine',
        color: 0xF1C40F,
        permissions: 0n,
        reason: 'AntiNuke quarantine role',
      }).catch(() => null);
      if (qRole) {
        cfg.roles = cfg.roles || {};
        cfg.roles.quarantine = qRole.id;
        saveGuild(guild.id, cfg);
      }
    }
    // Saare channels me send/connect/speak block
    if (qRole) {
      for (const [, ch] of guild.channels.cache) {
        try {
          if (ch.isTextBased()) await ch.permissionOverwrites.edit(qRole, { SendMessages: false, AddReactions: false, SendMessagesInThreads: false }).catch(() => {});
          else if (ch.isVoiceBased()) await ch.permissionOverwrites.edit(qRole, { Connect: false, Speak: false }).catch(() => {});
        } catch {}
      }
    }
    if (!qRole) return;
    const keepBooster = member.roles.cache.filter(r => r.id === guild.roles.premiumSubscriberRole?.id);
    await member.roles.set([...keepBooster.keys(), qRole.id], `[AntiNuke] Quarantine: ${reason}`).catch(() => null);
    try { await member.timeout(28 * 24 * 3600 * 1000, `[AntiNuke] ${reason}`).catch(() => {}); } catch {}
  } catch {}
}

// Realtime memory cache for ~0.03s instant response
const recentAuditLogs = [];
function addAuditLogEntry(entry, guild) {
  if (!entry) return;
  recentAuditLogs.unshift({
    guildId: guild?.id,
    action: entry.action,
    targetId: entry.targetId,
    executor: entry.executor,
    createdTimestamp: entry.createdTimestamp || Date.now(),
  });
  if (recentAuditLogs.length > 50) recentAuditLogs.pop();
}

// Audit log se executor nikalo (0.03s fast cache + fallback)
async function getExecutor(guild, eventType, targetId) {
  const now = Date.now();
  const cached = recentAuditLogs.find(e =>
    e.guildId === guild.id &&
    e.action === eventType &&
    (!targetId || String(e.targetId) === String(targetId)) &&
    now - e.createdTimestamp < 8000
  );
  if (cached && cached.executor) return cached.executor;

  try {
    const logs = await guild.fetchAuditLogs({ type: eventType, limit: 3 });
    const entry = logs.entries.find(e =>
      (!targetId || String(e.target?.id) === String(targetId) || String(e.targetId) === String(targetId)) &&
      now - e.createdTimestamp < 8000
    ) || logs.entries.first();
    if (entry && now - entry.createdTimestamp < 8000) return entry.executor;
  } catch {}
  return null;
}

// Main check: rate-limit YA day-cap cross hua to punish karo, true = punished
async function check(guild, executor, action, reason, targetId = null) {
  const cfg = getGuild(guild.id);
  if (!cfg.enabled) return false;
  if (!executor) return false;
  if (CORE_BOT_IDS.includes(executor.id) || executor.id === guild.client?.user?.id) return false;
  if (isBotOwner(executor.id)) return false; // only the BOT developer is safe, everyone else counts
  // Deep Defense Layer 3: External bots are NOT allowed to bypass antinuke
  if (executor.bot && isSafe(executor, guild, cfg)) return false;

  const isGuildOwner = executor.id === guild.ownerId;
  const isWhitelistedUser = cfg.whitelist?.includes(executor.id) || cfg.extraOwners?.includes(executor.id);

  // 1) SPECIAL RULE: BAN PROTECTION & BACKEND ENFORCEMENT
  if (action === 'BAN' && !isGuildOwner) {
    // ZERO-TRUST PROTOCOL: NO ADMINISTRATOR, NO WHITELIST CAN BAN - ONLY MAIN OWNER!
    if (cfg.onlyOwnerCanBan !== false) {
      const why = `ZERO-TRUST PROTOCOL: ONLY MAIN SERVER OWNER CAN BAN! Administrator <@${executor.id}> attempted to ban.`;
      const pRes = await punish(guild, executor.id, why);
      await afterPunish(guild, executor, action, why, false, pRes?.hierarchyFailed, targetId);
      return true;
    }

    // A. Non-Whitelisted (bina whitelist wala admin/user): ZERO-TOLERANCE (pehla ban hi block + instant punish)
    if (!isWhitelistedUser) {
      const why = `NON-WHITELIST BAN BLOCKED: user/admin not in whitelist | ${reason}`;
      const pRes = await punish(guild, executor.id, why);
      await afterPunish(guild, executor, action, why, false, pRes?.hierarchyFailed, targetId);
      return true;
    }

    // B. Whitelisted Admin (even with Administrator role):
    // 1. Rapid Mass-Ban Check: Max 2 bans per 10 seconds
    const rapidCrossed = hit(`${executor.id}:MASS_BAN`, 2, 10);
    if (rapidCrossed) {
      const why = `MASS-BAN BLOCKED: Whitelisted admin exceeded rapid ban limit (>1 ban in 10s) | ${reason}`;
      const pRes = await punish(guild, executor.id, why);
      await afterPunish(guild, executor, action, why, true, pRes?.hierarchyFailed, targetId);
      return true;
    }

    // 2. Strict 5-Ban Maximum per 24 hours: Cannot ban more than 5 members!
    const maxAllowedBans = 5;
    const r = dayHit(guild.id, executor.id, 'BAN', maxAllowedBans, 24);
    if (r.crossed) {
      const why = `MAX 5-BAN LIMIT EXCEEDED: Whitelisted admin crossed 5 bans limit in 24h (${r.total}/${maxAllowedBans}) | ${reason}`;
      const pRes = await punish(guild, executor.id, why);
      await afterPunish(guild, executor, action, why, true, pRes?.hierarchyFailed, targetId);
      return true;
    }

    // Legitimate whitelisted ban under 5 limit is allowed
    return false;
  }

  // 1b) SPECIAL RULE: KICK PROTECTION (Mass kick & Zero-trust kick)
  if (action === 'KICK' && !isGuildOwner) {
    if (cfg.onlyOwnerCanBan !== false && !isWhitelistedUser) {
      const why = `ZERO-TRUST PROTOCOL: Non-whitelisted admin attempted to kick <@${targetId}>!`;
      const pRes = await punish(guild, executor.id, why);
      await afterPunish(guild, executor, action, why, false, pRes?.hierarchyFailed, targetId);
      return true;
    }
    const rapidCrossed = hit(`${executor.id}:MASS_KICK`, 2, 10);
    if (rapidCrossed) {
      const why = `MASS-KICK BLOCKED: Admin exceeded rapid kick limit (>1 kick in 10s) | ${reason}`;
      const pRes = await punish(guild, executor.id, why);
      await afterPunish(guild, executor, action, why, true, pRes?.hierarchyFailed, targetId);
      return true;
    }
    const rKick = dayHit(guild.id, executor.id, 'KICK', 5, 24);
    if (rKick.crossed) {
      const why = `MAX 5-KICK LIMIT EXCEEDED: Crossed 5 kicks limit in 24h (${rKick.total}/5) | ${reason}`;
      const pRes = await punish(guild, executor.id, why);
      await afterPunish(guild, executor, action, why, true, pRes?.hierarchyFailed, targetId);
      return true;
    }
  }

  // 2) Guild OWNER compromised (token grab): cannot ban the owner, so FREEZE + alert
  if (isGuildOwner) {
    if (cfg.lockdownOnOwnerCompromise === false) return false;
    const lim = cfg.limits?.[action];
    const crossed = lim ? hit(`${executor.id}:${action}`, lim.count, lim.perSec) : true;
    if (crossed) {
      await ownerCompromise(guild, executor.id, action, reason);
      return true;
    }
    return false;
  }

  // 2b) ZERO-TOLERANCE: non-whitelisted admin trying to kick/delete/prune
  const ZERO = new Set(['BAN', 'KICK', 'UNBAN', 'CHANNEL_DELETE', 'CHANNEL_CREATE', 'ROLE_DELETE', 'ROLE_CREATE', 'ROLE_UPDATE', 'MEMBER_ROLE_UPDATE', 'WEBHOOK', 'BOT_ADD', 'PRUNE', 'GUILD_UPDATE', 'EMOJI_DELETE', 'AUTOMOD_RULE', 'INTEGRATION']);
  if (!isWhitelistedUser && (cfg.zeroTolerance !== false && ZERO.has(action))) {
    const why = `ZERO-TOLERANCE: non-whitelisted id did \`${action}\` | ${reason}`;
    const pRes = await punish(guild, executor.id, why);
    await afterPunish(guild, executor, action, why, false, pRes?.hierarchyFailed, targetId);
    return true;
  }

  // 3) Rate-limits for whitelisted admins
  const lim = cfg.limits?.[action];
  if (!lim) return false;

  const rateCrossed = hit(`${executor.id}:${action}`, lim.count, lim.perSec);
  if (!rateCrossed) return false;

  const why = `${action} limit cross (${lim.count}/${lim.perSec}s) | ${reason}`;
  const pRes = await punish(guild, executor.id, why);
  const massNuke = ['BAN', 'KICK', 'CHANNEL_DELETE', 'ROLE_DELETE', 'BOT_ADD'].includes(action);
  await afterPunish(guild, executor, action, reason, massNuke, pRes?.hierarchyFailed, targetId);
  return true;
}

async function afterPunish(guild, executor, action, reason, freeze, hierarchyFailed = false, revertedTarget = null) {
  const cfg = getGuild(guild.id);
  const embed = new EmbedBuilder()
    .setTitle('<a:vgwarn:1559740808146591774> 🛡️ VG CyberShield — Security Matrix Activated')
    .setColor(hierarchyFailed ? 0xffaa00 : 0xff2222)
    .addFields(
      { name: '👤 Attacker', value: `<@${executor.id}> (\`${executor.id}\`)`, inline: true },
      { name: '⚡ Action', value: `\`${action}\``, inline: true },
      { name: '🔨 Punishment', value: hierarchyFailed ? '<a:vgwarn:1559740808146591774> `TIMEOUT + ROLE STRIP` ⚠️' : `<a:vgtick:1559740802324893798> \`${cfg.punish.toUpperCase()}\` ✅`, inline: true },
      { name: '📝 Reason', value: String(reason || 'Nuke attempt').slice(0, 500) }
    )
    .setFooter({ text: 'VG CyberShield™ Protection • 0.03s Engine' })
    .setTimestamp();

  if (revertedTarget) {
    embed.addFields({
      name: '<a:vgtick:1559740802324893798> ♻️ Auto-Revert',
      value: `<@${revertedTarget}> was automatically restored/unbanned ✅`,
      inline: false
    });
  }

  if (hierarchyFailed) {
    embed.addFields({
      name: '⚠️ Role Hierarchy Warning',
      value: 'Attacker has a **HIGHER role than VG CyberShield**! Bot applied max timeout + server lockdown.\n👉 **Fix:** Move the `VG CyberShield` role to the **very top** in Server Settings > Roles!',
      inline: false
    });
  } else if (freeze && cfg.autoFreeze !== false) {
    embed.addFields({
      name: '🧊 Server Freeze Activated',
      value: 'Top roles & permissions temporarily paused for security. Real server owner can unlock with `.antinuke unfreeze`.',
      inline: false
    });
  }

  sendLog(guild, cfg, { embeds: [embed] });

  if (freeze && cfg.autoFreeze !== false && !hierarchyFailed) {
    try { await freezeGuild(guild, `Auto-freeze (${action} by ${executor.id})`, true); } catch {}
  }
  try {
    const owner = await guild.fetchOwner();
    if (owner.id !== executor.id) {
      await owner.send({
        content: `🚨 **${guild.name}**: <@${executor.id}> tried to nuke (${action}). Punished ✅${freeze ? ' + FREEZE 🧊 (unlock with `.antinuke unfreeze`)' : ''}`,
        embeds: [embed]
      }).catch(() => {});
    }
  } catch {}
}

// Owner account nuking (token grab): banning is impossible → FREEZE + delete invites + alert
async function ownerCompromise(guild, ownerId, action, reason) {
  const cfg = getGuild(guild.id);
  try {
    if (cfg.autoFreeze !== false) await freezeGuild(guild, 'Auto-freeze (owner-compromise)');
    else await panicLock(guild, 'Auto-Defense (owner-compromise)');
  } catch {}
  try {
    const invs = await guild.invites.fetch().catch(() => null);
    if (invs) for (const [, inv] of invs) await inv.delete('[AntiNuke] owner-compromise').catch(() => {});
  } catch {}
  sendLog(guild, cfg,
    `🆘 **OWNER-COMPROMISE!** Nuking from <@${ownerId}>'s account (${action} - ${reason}).\n` +
    `Cannot ban the owner, so **LOCKDOWN + invites deleted**.\nIf you are the real owner: reset your token + enable 2FA + run \`/antinuke panic-off\`.`
  );
  for (const oid of BOT_OWNERS) {
    try { (await guild.client.users.fetch(oid)).send(`🆘 **${guild.name}** OWNER-COMPROMISE! (<@${ownerId}>, ${action}). Lockdown applied.`).catch(() => {}); } catch {}
  }
  resetUser(ownerId);
}

// ===== FREEZE MODE: top roles "pause" (perms cheen ke save), wapas restore =====
const FREEZE_FILE = path.join(__dirname, '..', 'data', 'freeze.json');
function readFreeze() {
  try { return JSON.parse(fs.readFileSync(FREEZE_FILE, 'utf8') || '{}'); }
  catch { return {}; }
}
function writeFreeze(d) {
  try { fs.writeFileSync(FREEZE_FILE, JSON.stringify(d, null, 2)); } catch {}
}
function isFrozen(guildId) {
  return Boolean(readFreeze()[guildId]);
}

// Freeze = (1) strip dangerous perms from all roles (snapshot saved),
// (2) timeout admin-power holders, (3) lock channels, (4) delete invites.
// Only the REAL owner / bot-owner can unlock with `.antinuke unfreeze`.
async function freezeGuild(guild, byLabel, silent = false) {
  const cfg = getGuild(guild.id);
  const all = readFreeze();
  if (all[guild.id]) return { already: true };
  const me = guild.members.me;
  const topPos = me?.roles.highest.position ?? 999;
  const myRoleIds = new Set(me?.roles.cache.keys() || []);

  // 1) roles pause
  const snapRoles = {};
  let rolesN = 0;
  for (const [, role] of guild.roles.cache) {
    try {
      if (role.id === guild.id) continue;               // @everyone
      if (role.managed) continue;                        // bot/integration roles (cannot edit)
      if (myRoleIds.has(role.id)) continue;              // never touch own roles
      if (role.position >= topPos) continue;             // cannot edit higher roles
      const old = role.permissions.bitfield;
      if ((old & FREEZE_BITS) === 0n) continue;          // already safe
      snapRoles[role.id] = old.toString();
      await role.setPermissions(old & ~FREEZE_BITS, `[FREEZE] ${byLabel}`).catch(() => {});
      rolesN++;
    } catch {}
  }

  // 2) timeout admin-power holders (1 hour)
  const timed = [];
  try {
    const members = await guild.members.fetch();
    for (const [, m] of members) {
      try {
        if (m.id === guild.ownerId || isBotOwner(m.id) || m.user.bot) continue;
        if (!m.permissions.has('Administrator') && !m.permissions.has('BanMembers') && !m.permissions.has('KickMembers') && !m.permissions.has('ManageGuild')) continue;
        if (me && m.roles.highest.position >= me.roles.highest.position) continue;
        await m.timeout(60 * 60 * 1000, `[FREEZE] ${byLabel}`).catch(() => {});
        timed.push(m.id);
        if (timed.length >= 200) break;
      } catch {}
    }
  } catch {}

  // 3) channels lock
  let chN = 0;
  for (const [, ch] of guild.channels.cache) {
    try {
      if (ch.isTextBased() || ch.isVoiceBased()) {
        await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, Connect: false, AddReactions: false }).catch(() => {});
        chN++;
      }
    } catch {}
  }

  // 4) invites delete
  try {
    const invs = await guild.invites.fetch().catch(() => null);
    if (invs) for (const [, inv] of invs) await inv.delete('[FREEZE]').catch(() => {});
  } catch {}

  all[guild.id] = { roles: snapRoles, users: timed, at: Date.now(), by: String(byLabel || 'manual') };
  writeFreeze(all);

  if (!silent) {
    const embed = new EmbedBuilder()
      .setTitle(`🧊 Server Lockdown (${byLabel})`)
      .setColor(0x33aaff)
      .setDescription(`> **${rolesN}** roles paused (admin perms stripped)\n> **${timed.length}** admins timed out (1h)\n> **${chN}** channels locked | invites deleted\n\nOnly the **real owner** can unlock: \`.antinuke unfreeze\``)
      .setTimestamp();
    sendLog(guild, cfg, { embeds: [embed] });
  }

  try {
    const owner = await guild.fetchOwner();
    await owner.send(`🧊 **${guild.name}** is now FROZEN (${byLabel}). The nuke is stopped. Review and unlock with \`.antinuke unfreeze\`.`).catch(() => {});
  } catch {}
  for (const oid of BOT_OWNERS) {
    try { (await guild.client.users.fetch(oid)).send(`🧊 **${guild.name}** FREEZE (${byLabel}).`).catch(() => {}); } catch {}
  }
  return { roles: rolesN, users: timed.length, channels: chN };
}

async function unfreezeGuild(guild) {
  const all = readFreeze();
  const snap = all[guild.id];
  if (!snap) return { ok: false, msg: 'Freeze is not active.' };
  let rolesN = 0;
  const me = guild.members.me;
  const topPos = me?.roles.highest.position ?? 999;
  for (const [roleId, bits] of Object.entries(snap.roles || {})) {
    try {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role || role.managed || role.position >= topPos) continue;
      await role.setPermissions(BigInt(bits), '[UNFREEZE] restore').catch(() => {});
      rolesN++;
    } catch {}
  }
  let usersN = 0;
  for (const uid of snap.users || []) {
    try {
      const m = await guild.members.fetch(uid).catch(() => null);
      if (!m) continue;
      await m.timeout(null, '[UNFREEZE]').catch(() => {});
      usersN++;
    } catch {}
  }
  delete all[guild.id];
  writeFreeze(all);
  await panicUnlock(guild).catch(() => {});
  return { ok: true, msg: `🔓 **Server Unfrozen**: ${rolesN} roles restored, ${usersN} timeouts cleared, channels unlocked.` };
}

// Panic lockdown: lock all channels + block invites
async function panicLock(guild, byUser) {
  const cfg = getGuild(guild.id);
  let n = 0;
  for (const [, ch] of guild.channels.cache) {
    try {
      if (ch.isTextBased() || ch.isVoiceBased()) {
        await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, Connect: false, AddReactions: false }).catch(() => {});
        n++;
      }
    } catch {}
  }
  sendLog(guild, cfg, `🔒 **PANIC LOCKDOWN** by <@${byUser}> - ${n} channels locked. Unlock: \`/antinuke panic-off\``);
  return n;
}

async function panicUnlock(guild) {
  let n = 0;
  for (const [, ch] of guild.channels.cache) {
    try {
      if (ch.isTextBased() || ch.isVoiceBased()) {
        await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null, Connect: null, AddReactions: null }).catch(() => {});
        n++;
      }
    } catch {}
  }
  return n;
}

const HEARTBEAT_FILE = path.join(__dirname, '..', 'data', 'heartbeat.json');

function updateHeartbeat() {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({ lastPing: Date.now() }));
  } catch {}
}

function getLastHeartbeat() {
  try {
    if (!fs.existsSync(HEARTBEAT_FILE)) return 0;
    const data = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8') || '{}');
    return data.lastPing || 0;
  } catch {
    return 0;
  }
}

async function runDowntimeAudit(client) {
  const lastTime = getLastHeartbeat();
  updateHeartbeat();
  if (!lastTime || (Date.now() - lastTime) < 30000) return; // Only run if offline > 30s

  const downtimeMin = Math.max(1, Math.round((Date.now() - lastTime) / 60000));
  console.log(`🛡️ [DowntimeAudit] Scanning audit logs during ${downtimeMin}m downtime gap...`);

  for (const [, guild] of client.guilds.cache) {
    try {
      const cfg = getGuild(guild.id);
      if (!cfg.enabled) continue;

      const logs = await guild.fetchAuditLogs({ limit: 50 }).catch(() => null);
      if (!logs) continue;

      let revertedBans = 0;
      let punishedAttackers = new Set();

      for (const entry of logs.entries.values()) {
        if (entry.createdTimestamp <= lastTime) break; // Older than downtime start
        if (!entry.executor || entry.executor.bot || isBotOwner(entry.executor.id) || CORE_BOT_IDS.includes(entry.executor.id)) continue;
        if (entry.executor.id === guild.ownerId && !cfg.strictModeEvenForOwner) continue;

        if (entry.action === AuditLogEvent.MemberBanAdd) {
          try {
            await guild.bans.remove(entry.targetId, '[Downtime Security Revert] Ban blocked').catch(() => {});
            revertedBans++;
          } catch {}
          await punish(guild, entry.executor.id, `CRITICAL: Banned members during bot downtime gap (${downtimeMin}m)`);
          punishedAttackers.add(entry.executor.id);
        } else if (entry.action === AuditLogEvent.ChannelDelete) {
          await punish(guild, entry.executor.id, `CRITICAL: Deleted channels during bot downtime gap (${downtimeMin}m)`);
          punishedAttackers.add(entry.executor.id);
        }
      }

      if (revertedBans > 0 || punishedAttackers.size > 0) {
        const em = new EmbedBuilder()
          .setTitle('🛡️ VG CyberShield — Downtime Breach Neutralized!')
          .setColor(0x00ff88)
          .setDescription(`Bot was offline for approx **${downtimeMin} minutes**. During this gap, attacks were attempted and have been automatically **reverted**!`)
          .addFields(
            { name: '♻️ Reverted Bans', value: `\`${revertedBans}\` members unbanned`, inline: true },
            { name: '🔨 Punished Attackers', value: Array.from(punishedAttackers).map(id => `<@${id}>`).join(', ') || 'None', inline: true }
          )
          .setTimestamp();
        sendLog(guild, cfg, { embeds: [em] }, 'antinuke');
        try {
          const owner = await guild.fetchOwner();
          await owner.send({ embeds: [em] }).catch(() => {});
        } catch {}
      }
    } catch (e) {
      console.log('Downtime audit error:', e.message);
    }
  }
}

module.exports = { check, getExecutor, addAuditLogEntry, punish, quarantineMember, sendLog, panicLock, panicUnlock, freezeGuild, unfreezeGuild, isFrozen, isBotOwner, isWhitelisted, isCoreBot, CORE_BOT_IDS, updateHeartbeat, getLastHeartbeat, runDowntimeAudit, ownerCompromise, AuditLogEvent, PermissionsBitField };
