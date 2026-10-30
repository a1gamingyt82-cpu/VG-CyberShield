// .role / .temprole / .perms  (Access Module)
const { getGuild } = require('../store');
const { isAdmin, parseMember } = require('./helpers');

function ms(str) {
  const m = String(str || '').match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;
  const n = +m[1];
  return n * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]]);
}

async function run(msg, args) {
  const [cmd, sub, ...rest] = args;

  if (cmd === 'role') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
    // .role add <user> <role> | .role remove <user> <role>
    const member = await parseMember(msg.guild, rest[0]);
    const role = msg.mentions.roles.first();
    if (!['add', 'remove'].includes(sub) || !member || !role) return msg.reply('`.role add <user> <role>` / `.role remove <user> <role>`'), true;
    try {
      if (sub === 'add') await member.roles.add(role);
      else await member.roles.remove(role);
      return msg.reply(`✅ ${role} ${sub === 'add' ? 'given to' : 'removed from'} → ${member}`), true;
    } catch { return msg.reply('❌ Fail — keep my role ABOVE that role.'), true; }
  }

  if (cmd === 'temprole') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
    // .temprole <user> <role> <time: 10m/1h/1d>
    const member = await parseMember(msg.guild, sub);
    const role = msg.mentions.roles.first();
    const dur = ms(rest[rest.length - 1]);
    if (!member || !role || !dur) return msg.reply('`.temprole <user> <role> <10m/1h/1d>`'), true;
    try {
      await member.roles.add(role);
      msg.reply(`✅ ${member} given ${role} (for ${rest[rest.length - 1]})`);
      setTimeout(() => member.roles.remove(role).catch(() => {}), dur);
      return true;
    } catch { return msg.reply('❌ Fail'), true; }
  }

  if (cmd === 'perms') {
    // .perms add user <@user> | .perms add role <@role> | .perms rm ... | .perms list | .perms config | .perms reset
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;
    const { saveGuild } = require('../store');
    const cfg = getGuild(msg.guild.id);
    const action = sub; // add/rm/list/config/reset
    if (action === 'list' || action === 'config' || !action) {
      return msg.reply(`🔑 Perms = extra access to my commands.\nWhitelist: ${cfg.whitelist.length} users\nExtraOwner: ${cfg.extraOwners.map(id => `<@${id}>`).join(' ') || '—'}\n\`.perms add user <@user>\` = whitelist\n\`.perms add role-owner <@user>\` = extraowner`), true;
    }
    if (action === 'reset') { cfg.whitelist = []; cfg.extraOwners = []; saveGuild(msg.guild.id, cfg); return msg.reply('✅ perms reset'), true; }
    const kind = rest[0]; // user/role/role-owner
    const user = msg.mentions.users.first();
    if (action === 'add' && kind === 'user' && user) {
      if (!cfg.whitelist.includes(user.id)) cfg.whitelist.push(user.id);
      saveGuild(msg.guild.id, cfg); return msg.reply(`✅ <@${user.id}> given command access (whitelist)`), true;
    }
    if (action === 'add' && kind === 'role-owner' && user) {
      if (!cfg.extraOwners.includes(user.id)) cfg.extraOwners.push(user.id);
      saveGuild(msg.guild.id, cfg); return msg.reply(`✅ <@${user.id}> extraowner`), true;
    }
    if ((action === 'rm' || action === 'remove') && user) {
      cfg.whitelist = cfg.whitelist.filter(x => x !== user.id);
      cfg.extraOwners = cfg.extraOwners.filter(x => x !== user.id);
      saveGuild(msg.guild.id, cfg); return msg.reply('✅ Removed'), true;
    }
    return msg.reply('`.perms add user <@user>` / `.perms add role-owner <@user>` / `.perms rm user <@user>` / `.perms list` / `.perms reset`'), true;
  }
  return null;
}

module.exports = { run };
