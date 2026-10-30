// WATCHDOG - 2nd token, same process. Active Dual-Guard.
// Protects the server simultaneously. If primary bot is offline/rate-limited, this bot catches everything!
const { Events, AuditLogEvent } = require('discord.js');
const { getGuild } = require('./store');
const AN = require('./antinuke');

function attachWatchdog(client, primaryClient) {
  // Realtime Audit Log hook for 0.03s dual defense
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    try {
      if (!entry || !entry.executor) return;
      // Core sister bots never punish each other
      if (entry.executor.id === client.user.id || (primaryClient && entry.executor.id === primaryClient.user?.id) || AN.CORE_BOT_IDS.includes(entry.executor.id)) return;
      // Rogue bot protection: external bots are NEVER immune unless whitelisted
      const cfg = getGuild(guild.id);
      if (AN.isSafe(entry.executor, guild, cfg)) return;

      if (entry.action === AuditLogEvent.MemberBanAdd) {
        if (AN.CORE_BOT_IDS.includes(entry.targetId) || entry.targetId === client.user.id || (primaryClient && entry.targetId === primaryClient.user?.id)) {
          try { await guild.bans.remove(entry.targetId, '[Watchdog CORE DEFENSE] Core Bot Banned - Instant Unban').catch(() => {}); } catch {}
          if (!AN.CORE_BOT_IDS.includes(entry.executor.id)) {
            await AN.punish(guild, entry.executor.id, `CRITICAL: Attempted to ban Core Bot <@${entry.targetId}>`);
          }
          return;
        }
        const punished = await AN.check(guild, entry.executor, 'BAN', `[Watchdog] banned <@${entry.targetId}>`, entry.targetId);
        if (punished) {
          try { await guild.bans.remove(entry.targetId, '[AntiNuke-Watchdog] Instant Revert - ban blocked').catch(() => {}); } catch {}
        }
      } else if (entry.action === AuditLogEvent.MemberKick) {
        await AN.check(guild, entry.executor, 'KICK', `[Watchdog] kicked <@${entry.targetId}>`, entry.targetId);
      } else if (entry.action === AuditLogEvent.ChannelDelete) {
        await AN.check(guild, entry.executor, 'CHANNEL_DELETE', `[Watchdog] deleted channel \`${entry.targetId}\``);
      } else if (entry.action === AuditLogEvent.RoleDelete) {
        await AN.check(guild, entry.executor, 'ROLE_DELETE', `[Watchdog] deleted role \`${entry.targetId}\``);
      } else if (entry.action === AuditLogEvent.MemberPrune) {
        await AN.check(guild, entry.executor, 'PRUNE', '[Watchdog] pruned server');
      }
    } catch {}
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    try {
      if (AN.CORE_BOT_IDS.includes(ban.user.id) || ban.user.id === client.user.id) {
        const ex = await AN.getExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        try { await ban.guild.bans.remove(ban.user.id, '[Watchdog CORE DEFENSE] Core Bot Banned - Instant Unban').catch(() => {}); } catch {}
        if (ex && !AN.CORE_BOT_IDS.includes(ex.id)) {
          await AN.punish(ban.guild, ex.id, `CRITICAL: Attempted to ban Core Bot <@${ban.user.id}>`);
        }
        return;
      }
      const ex = await AN.getExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      if (ex && (ex.id === client.user.id || AN.CORE_BOT_IDS.includes(ex.id) || AN.isSafe(ex, ban.guild, getGuild(ban.guild.id)))) return;
      const punished = await AN.check(ban.guild, ex, 'BAN', `[Watchdog] banned <@${ban.user.id}>`, ban.user.id);
      if (punished) {
        await ban.guild.bans.remove(ban.user.id, '[AntiNuke-Watchdog] Reverted').catch(() => {});
      }
    } catch {}
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      if (AN.CORE_BOT_IDS.includes(member.id)) {
        const ex = await AN.getExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
        if (ex && !AN.CORE_BOT_IDS.includes(ex.id)) {
          await AN.punish(member.guild, ex.id, `CRITICAL: Kicked Core Bot <@${member.id}>`);
        }
        return;
      }
      const ex = await AN.getExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
      if (ex && !AN.CORE_BOT_IDS.includes(ex.id) && !AN.isSafe(ex, member.guild, getGuild(member.guild.id))) {
        await AN.check(member.guild, ex, 'KICK', `[Watchdog] kicked <@${member.id}>`);
      }
    } catch {}
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (!member.user.bot) return;
      const ex = await AN.getExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
      if (!ex) return;
      const cfg = getGuild(member.guild.id);
      const allowed = cfg.whitelist?.includes(ex.id) || ex.id === member.guild.ownerId || AN.isBotOwner(ex.id);
      if (!allowed || cfg.strictModeEvenForOwner) {
        try { await member.kick('[AntiNuke-Watchdog] Unapproved bot add').catch(() => {}); } catch {}
        await AN.check(member.guild, ex, 'BOT_ADD', `added unapproved bot <@${member.id}>`);
      }
    } catch {}
  });

  client.on(Events.ChannelDelete, async (channel) => {
    try {
      if (!channel.guild) return;
      const ex = await AN.getExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
      if (ex && !ex.bot) await AN.check(channel.guild, ex, 'CHANNEL_DELETE', `deleted #${channel.name}`);
    } catch {}
  });

  client.on(Events.RoleDelete, async (role) => {
    try {
      const ex = await AN.getExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
      if (ex && !ex.bot) await AN.check(role.guild, ex, 'ROLE_DELETE', `deleted @${role.name}`);
    } catch {}
  });

  client.on(Events.RoleUpdate, async (oldR, newR) => {
    try {
      if (oldR.permissions.has('Administrator') || !newR.permissions.has('Administrator')) return;
      const ex = await AN.getExecutor(newR.guild, AuditLogEvent.RoleUpdate, newR.id);
      if (ex && !ex.bot) await AN.check(newR.guild, ex, 'MEMBER_ROLE_UPDATE', `gave ADMIN to @${newR.name}`);
    } catch {}
  });

  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    try {
      const added = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
      if (!added.size) return;
      const dangerous = added.some(r => r.permissions.has('Administrator') || r.permissions.has('BanMembers') || r.permissions.has('KickMembers'));
      if (!dangerous) return;
      const ex = await AN.getExecutor(newM.guild, AuditLogEvent.MemberRoleUpdate, newM.id);
      if (!ex || ex.bot || ex.id === newM.id) return;
      const isRealOwner = ex.id === newM.guild.ownerId || AN.isBotOwner(ex.id);
      if (!isRealOwner) {
        try { await newM.roles.remove(added, '[AntiNuke-Watchdog] Reverted dangerous role').catch(() => {}); } catch {}
        await AN.punish(newM.guild, ex.id, `[Watchdog] Attempted to assign dangerous role to <@${newM.id}>`);
      }
    } catch {}
  });

  // Emergency failover prefix: if primary bot is offline or disconnected, watchdog answers commands!
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;
      if (!primaryClient || primaryClient.ws.status !== 0) { // 0 = READY in discord.js
        if (msg.content.startsWith('.antinuke unfreeze') || msg.content.startsWith('.unfreeze')) {
          if (msg.author.id === msg.guild.ownerId || AN.isBotOwner(msg.author.id)) {
            const r = await AN.unfreezeGuild(msg.guild);
            return msg.reply(`🛡️ **[VG Cheats Watchdog Failover]** ${r.msg}`);
          }
        }
      }
    } catch {}
  });
}

module.exports = { attachWatchdog };
