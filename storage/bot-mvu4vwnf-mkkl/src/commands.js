// Slash commands: /whitelist /antinuke /backup /restore /quarantine
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuild, saveGuild } = require('./store');
const { panicLock, panicUnlock, isBotOwner } = require('./antinuke');
const { createBackup, restoreBackup } = require('./backup');

function isAdmin(interaction) {
  const cfg = getGuild(interaction.guildId);
  return interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    || interaction.guild.ownerId === interaction.user.id
    || isBotOwner(interaction.user.id)
    || cfg.extraOwners?.includes(interaction.user.id);
}

const commands = [
  new SlashCommandBuilder().setName('antinuke').setDescription('AntiNuke on/off + settings')
    .addSubcommand(s => s.setName('status').setDescription('Show current settings'))
    .addSubcommand(s => s.setName('on').setDescription('Turn AntiNuke ON'))
    .addSubcommand(s => s.setName('off').setDescription('Turn AntiNuke OFF'))
    .addSubcommand(s => s.setName('strict-on').setDescription('Strict mode ON (limits owners/whitelist too - stops token grab)'))
    .addSubcommand(s => s.setName('strict-off').setDescription('Strict mode OFF (owner/whitelist unlimited)'))
    .addSubcommand(s => s.setName('punish').setDescription('Set punishment')
      .addStringOption(o => o.setName('type').setDescription('ban/kick/quarantine').setRequired(true).addChoices(
        { name: 'ban', value: 'ban' }, { name: 'kick', value: 'kick' }, { name: 'quarantine', value: 'quarantine' })))
    .addSubcommand(s => s.setName('log-channel').setDescription('Set log channel')
      .addChannelOption(o => o.setName('channel').setDescription('log channel').setRequired(true)))
    .addSubcommand(s => s.setName('panic').setDescription('🔒 EMERGENCY: lock all channels'))
    .addSubcommand(s => s.setName('panic-off').setDescription('🔓 Open lockdown'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('whitelist').setDescription('Safe users list')
    .addSubcommand(s => s.setName('add').setDescription('Whitelist a user')
      .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove from whitelist')
      .addUserOption(o => o.setName('user').setDescription('user').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('Show list'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('backup').setDescription('Back up the server (roles+channels)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('restore').setDescription('Restore server from backup (after nuke)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('quarantine').setDescription('Strip all roles from a member and jail them')
    .addUserOption(o => o.setName('user').setDescription('user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
].map(c => c.toJSON());

async function handle(interaction) {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  const cfg = getGuild(interaction.guild.id);
  const { quarantineMember, sendLog } = require('./antinuke');

  if (interaction.commandName === 'antinuke') {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admins/owner only.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') {
      return interaction.reply({
        ephemeral: true,
        content: `🛡️ **AntiNuke Status**\nEnabled: \`${cfg.enabled}\`\nStrict (limits owner too): \`${cfg.strictModeEvenForOwner}\`\nZero-tolerance (non-whitelist 1st-hit punish): \`${cfg.zeroTolerance !== false}\`\nPunishment: \`${cfg.punish}\`\nAntiLink: \`${cfg.antiLink}\` | AntiEveryone: \`${cfg.antiEveryone}\`\nWhitelist: ${cfg.whitelist?.length || 0} users\nLog: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'not set'}`,
      });
    }
    if (sub === 'on') { cfg.enabled = true; saveGuild(interaction.guild.id, cfg); return interaction.reply('✅ AntiNuke **ON**.'); }
    if (sub === 'off') {
      const isOwner = interaction.guild.ownerId === interaction.user.id || isBotOwner(interaction.user.id);
      if (!isOwner) return interaction.reply({ content: '⛔ **ACCESS DENIED:** Only the Server Owner can turn AntiNuke OFF!', ephemeral: true });
      cfg.enabled = false; saveGuild(interaction.guild.id, cfg); return interaction.reply('⛔ AntiNuke **OFF**.');
    }
    if (sub === 'strict-on') { cfg.strictModeEvenForOwner = true; saveGuild(interaction.guild.id, cfg); return interaction.reply('✅ **Strict ON** - owners/whitelist are rate-limited too. Token-grab hackers get caught.'); }
    if (sub === 'strict-off') { cfg.strictModeEvenForOwner = false; saveGuild(interaction.guild.id, cfg); return interaction.reply('⚠️ **Strict OFF** - owner/whitelist unlimited. (Token-grab risk!)'); }
    if (sub === 'punish') {
      cfg.punish = interaction.options.getString('type'); saveGuild(interaction.guild.id, cfg);
      return interaction.reply(`✅ Punishment set: \`${cfg.punish}\``);
    }
    if (sub === 'log-channel') {
      cfg.logChannelId = interaction.options.getChannel('channel').id; saveGuild(interaction.guild.id, cfg);
      return interaction.reply(`✅ Log channel set: <#${cfg.logChannelId}>`);
    }
    if (sub === 'panic') {
      await interaction.deferReply();
      const n = await panicLock(interaction.guild, interaction.user.id);
      return interaction.editReply(`🔒 **LOCKDOWN ON** - ${n} channels locked. Open with \`/antinuke panic-off\``);
    }
    if (sub === 'panic-off') {
      await interaction.deferReply();
      const n = await panicUnlock(interaction.guild);
      return interaction.editReply(`🔓 **LOCKDOWN OFF** - ${n} channels unlocked.`);
    }
  }

  if (interaction.commandName === 'whitelist') {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admins/owner only.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const u = interaction.options.getUser('user');
    const isOwner = interaction.guild.ownerId === interaction.user.id || isBotOwner(interaction.user.id);

    if (sub === 'add') {
      if (!isOwner) return interaction.reply({ content: '⛔ **ACCESS DENIED:** Only the Server Owner can add users to Whitelist!', ephemeral: true });
      if (!cfg.whitelist.includes(u.id)) cfg.whitelist.push(u.id);
      saveGuild(interaction.guild.id, cfg);
      return interaction.reply(`✅ <@${u.id}> whitelisted. (Still rate-limited in strict mode)`);
    }
    if (sub === 'remove') {
      if (!isOwner) return interaction.reply({ content: '⛔ **ACCESS DENIED:** Only the Server Owner can remove users from Whitelist!', ephemeral: true });
      cfg.whitelist = cfg.whitelist.filter(x => x !== u.id);
      saveGuild(interaction.guild.id, cfg);
      return interaction.reply(`✅ <@${u.id}> removed from whitelist.`);
    }
    if (sub === 'list') {
      return interaction.reply({ ephemeral: true, content: cfg.whitelist.length ? `📋 Whitelist:\n${cfg.whitelist.map(id => `<@${id}> (\`${id}\`)`).join('\n')}` : 'Whitelist is empty.' });
    }
  }

  if (interaction.commandName === 'backup') {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admins/owner only.', ephemeral: true });
    await interaction.deferReply();
    const d = await createBackup(interaction.guild);
    return interaction.editReply(`✅ Backup done: **${d.roles.length} roles + ${d.channels.length} channels** saved. Run \`/restore\` after a nuke.`);
  }

  if (interaction.commandName === 'restore') {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admins/owner only.', ephemeral: true });
    await interaction.deferReply();
    const r = await restoreBackup(interaction.guild);
    return interaction.editReply(r.msg);
  }

  if (interaction.commandName === 'quarantine') {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admins/owner only.', ephemeral: true });
    const u = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Manual quarantine';
    const mem = await interaction.guild.members.fetch(u.id).catch(() => null);
    if (!mem) return interaction.reply({ content: 'Member not found.', ephemeral: true });
    await quarantineMember(interaction.guild, mem, reason);
    sendLog(interaction.guild, cfg, `⛓️ <@${u.id}> quarantined by <@${interaction.user.id}>: ${reason}`);
    return interaction.reply(`⛓️ <@${u.id}> quarantined.`);
  }
}

module.exports = { commands, handle };
