// Customrole: .rolesetup / .roleshow / .roleedit / .roleremove / .rolereset / .reqall
const { ChannelType, EmbedBuilder } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');

async function run(msg, args) {
  const [cmd, ...rest] = args;
  if (!['rolesetup', 'roleshow', 'roleedit', 'roleremove', 'rolereset', 'reqall'].includes(cmd)) return null;
  const cfg = getGuild(msg.guild.id);

  if (cmd === 'rolesetup') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
    cfg.customrole = { setupChannelId: msg.channel.id };
    saveGuild(msg.guild.id, cfg);
    return msg.reply('✅ Custom-role setup in this channel! Anyone can now type `.reqall <role-name>` to make their own role (1 per user).'), true;
  }
  if (cmd === 'roleshow') {
    const mine = msg.guild.roles.cache.filter(r => r.name.startsWith(`👤 ${msg.author.username}`) || r.name === `👤 ${msg.author.id}`);
    return msg.reply(mine.size ? `Your roles: ${mine.map(r => r.toString()).join(' ')}` : 'You have no custom role. Make one with `.reqall <name>`.'), true;
  }
  if (cmd === 'reqall') {
    if (!cfg.customrole) return msg.reply('❌ Admin must run `.rolesetup` first.'), true;
    const name = rest.join(' ').slice(0, 30);
    if (!name) return msg.reply('`.reqall <role-name>`'), true;
    const exists = msg.guild.roles.cache.find(r => r.members.has(msg.author.id) && r.name.startsWith('👤'));
    if (exists) return msg.reply(`You already have a role: ${exists}`), true;
    try {
      const r = await msg.guild.roles.create({ name: `👤 ${name}` });
      await msg.member.roles.add(r).catch(() => {});
      return msg.reply(`✅ Your role was created: ${r}`), true;
    } catch { return msg.reply('❌ Fail — keep my role higher.'), true; }
  }
  if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
  if (cmd === 'roleedit') {
    const role = msg.mentions.roles.first();
    const color = rest.find(a => /^#?[0-9a-fA-F]{6}$/.test(a));
    const newName = rest.filter(a => a !== role?.toString() && a !== color).join(' ');
    if (!role) return msg.reply('`.roleedit <@role> [new-name] [#color]`'), true;
    try {
      if (newName) await role.setName(newName);
      if (color) await role.setColor(color.startsWith('#') ? color : '#' + color);
      return msg.reply(`✅ ${role} update`), true;
    } catch { return msg.reply('❌ Fail'), true; }
  }
  if (cmd === 'roleremove') {
    const role = msg.mentions.roles.first();
    if (!role) return msg.reply('`.roleremove <@role>`'), true;
    await role.delete().catch(() => {});
    return msg.reply('✅ Role delete'), true;
  }
  if (cmd === 'rolereset') {
    const customs = msg.guild.roles.cache.filter(r => r.name.startsWith('👤'));
    for (const [, r] of customs) await r.delete().catch(() => {});
    return msg.reply(`✅ ${customs.size} custom roles cleared`), true;
  }
}
module.exports = { run };
