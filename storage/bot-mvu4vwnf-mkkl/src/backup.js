// Server backup + restore (channel/role snapshot + member list + disaster recovery)
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { BACKUP_DIR } = require('./store');

function guildBackupPath(guildId) {
  return path.join(BACKUP_DIR, `${guildId}-latest.json`);
}

async function createBackup(guild) {
  let memberIds = [];
  try {
    const fetched = await guild.members.fetch().catch(() => guild.members.cache);
    memberIds = Array.from(fetched.filter(m => !m.user.bot).keys());
  } catch {
    memberIds = Array.from(guild.members.cache.filter(m => !m.user.bot).keys());
  }

  const data = {
    guildId: guild.id,
    name: guild.name,
    createdAt: new Date().toISOString(),
    memberIds,
    roles: guild.roles.cache
      .filter(r => r.id !== guild.id && !r.managed)
      .map(r => ({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position })),
    channels: guild.channels.cache.map(c => ({
      name: c.name, type: c.type,
      topic: c.topic ?? null, nsfw: c.nsfw ?? false,
      bitrate: c.bitrate ?? null, userLimit: c.userLimit ?? null,
      parentName: c.parent?.name ?? null, position: c.position ?? 0,
    })),
  };
  fs.writeFileSync(guildBackupPath(guild.id), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(BACKUP_DIR, `${guild.id}-${Date.now()}.json`), JSON.stringify(data, null, 2));
  return data;
}

function loadBackup(guildId) {
  const p = guildBackupPath(guildId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// Restore: recreate missing roles/channels + generate invite + reinvite members via DM
async function restoreBackup(guild, client, reinvite = true) {
  const snap = loadBackup(guild.id);
  if (!snap) return { ok: false, msg: '❌ No backup found. Run `.backup` first.' };
  let roles = 0, channels = 0;
  const existingRoles = new Set(guild.roles.cache.map(r => r.name));
  for (const r of (snap.roles || []).sort((a, b) => a.position - b.position)) {
    if (existingRoles.has(r.name)) continue;
    try { await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions) }); roles++; } catch {}
  }
  const existingCh = new Set(guild.channels.cache.map(c => `${c.name}|${c.type}`));
  const sorted = [...(snap.channels || [])].sort((a, b) => (a.type === 4 ? -1 : 0) - (b.type === 4 ? -1 : 0));
  const catMap = {};
  for (const c of guild.channels.cache.values()) if (c.type === 4) catMap[c.name] = c.id;
  for (const c of sorted) {
    if (existingCh.has(`${c.name}|${c.type}`)) continue;
    try {
      const opt = { name: c.name, type: c.type };
      if (c.topic) opt.topic = c.topic;
      if (c.parentName && catMap[c.parentName]) opt.parent = catMap[c.parentName];
      const created = await guild.channels.create(opt);
      if (created.type === 4) catMap[created.name] = created.id;
      channels++;
    } catch {}
  }

  // Member Re-invite DM
  let inviteUrl = null;
  let notifyCount = 0;
  if (reinvite && snap.memberIds?.length) {
    const textCh = guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has(['CreateInstantInvite'])) || guild.channels.cache.first();
    if (textCh) {
      try {
        const inv = await textCh.createInvite({ maxAge: 0, maxUses: 0, reason: '[Disaster Recovery] Re-inviting members after nuke' });
        inviteUrl = inv.url;
      } catch {}
    }

    if (inviteUrl) {
      const currentIds = new Set(guild.members.cache.keys());
      const missingIds = snap.memberIds.filter(id => !currentIds.has(id));
      notifyCount = missingIds.length;
      // Background async DM dispatch
      (async () => {
        for (const uid of missingIds) {
          try {
            const u = await (client?.users?.fetch(uid) || guild.client.users.fetch(uid)).catch(() => null);
            if (u) {
              const em = new EmbedBuilder()
                .setTitle(`🚨 [DISASTER RECOVERY] ${guild.name} Restored!`)
                .setColor(0x00ff88)
                .setDescription(`Server **${guild.name}** has been completely restored after a security incident!\n\nRejoin now with this official link:\n👉 **${inviteUrl}**`)
                .setFooter({ text: 'VG CyberShield™ Auto Disaster Recovery' })
                .setTimestamp();
              await u.send({ embeds: [em] }).catch(() => {});
              await new Promise(r => setTimeout(r, 400));
            }
          } catch {}
        }
      })();
    }
  }

  return {
    ok: true,
    msg: `✅ **Disaster Recovery Complete!**\n> Restored: \`${roles}\` roles + \`${channels}\` channels\n> Saved Members in Snapshot: \`${snap.memberIds?.length || 0}\` members\n` +
      (inviteUrl ? `> 📨 Re-invite DM link started for **${notifyCount}** members: **${inviteUrl}**` : '> Invite link could not be generated (missing CreateInstantInvite perm).')
  };
}

// Mass Event DM: Server Owner can send an event announcement directly to all members
async function sendMassEvent(guild, client, messageText, sender) {
  let members;
  try { members = await guild.members.fetch(); } catch { members = guild.members.cache; }
  const targets = members.filter(m => !m.user.bot);
  let sent = 0;
  let failed = 0;

  const embed = new EmbedBuilder()
    .setTitle(`📢 Official Event Announcement — ${guild.name}`)
    .setColor(0xff2222)
    .setDescription(messageText)
    .setFooter({ text: `Sent by Server Owner (${sender.tag}) • VG CyberShield™` })
    .setTimestamp();

  for (const [, m] of targets) {
    try {
      await m.send({ embeds: [embed] }).catch(() => null);
      sent++;
      await new Promise(r => setTimeout(r, 350));
    } catch {
      failed++;
    }
  }
  return { total: targets.size, sent, failed };
}

module.exports = { createBackup, restoreBackup, sendMassEvent };
