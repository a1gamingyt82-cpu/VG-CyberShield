// .autoreact / .autorole / .massrole / .rolecreate / .roleicon / .serverlog / .logdelete
const { ChannelType } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');

async function run(msg, args) {
  const [cmd, sub, ...rest] = args;
  const cfg = getGuild(msg.guild.id);
  const adminOnly = () => { if (!isAdmin(msg.member, msg.guild)) { msg.reply('❌ Admins/owner only.'); return false; } return true; };

  if (cmd === 'autoreact') {
    if (!adminOnly()) return true;
    const ch = msg.mentions.channels.first() || msg.channel;
    const emoji = rest.join(' ') || args[1];
    if (!emoji) return msg.reply('`.autoreact #channel <emoji>` — reacts to every msg in that channel. To remove: `.autoreact remove #channel`'), true;
    if (sub === 'remove' || rest[0] === 'remove') {
      cfg.autoreact = cfg.autoreact.filter(x => x.channelId !== ch.id);
      saveGuild(msg.guild.id, cfg); return msg.reply(`✅ autoreact removed <#${ch.id}>`), true;
    }
    cfg.autoreact = cfg.autoreact.filter(x => x.channelId !== ch.id);
    cfg.autoreact.push({ channelId: ch.id, emoji });
    saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ autoreact: ${emoji} on <#${ch.id}>`), true;
  }

  if (cmd === 'autorole') {
    if (!adminOnly()) return true;
    const role = msg.mentions.roles.first();
    const target = (sub || 'all').toLowerCase(); // all/humans/bots
    if (sub === 'show') return msg.reply(`Autorole — all: ${cfg.autorole.all.map(id => `<@&${id}>`).join(' ') || '—'} | humans: ${cfg.autorole.humans.map(id => `<@&${id}>`).join(' ') || '—'} | bots: ${cfg.autorole.bots.map(id => `<@&${id}>`).join(' ') || '—'}`), true;
    if (sub === 'reset' || sub === 'disable') { cfg.autorole = { humans: [], bots: [], all: [] }; saveGuild(msg.guild.id, cfg); return msg.reply('✅ autorole reset'), true; }
    if (!role) return msg.reply('`.autorole all/humans/bots <@role>`'), true;
    if (!['all', 'humans', 'bots'].includes(target)) return msg.reply('`.autorole all/humans/bots <@role>`'), true;
    cfg.autorole[target] = [...new Set([...cfg.autorole[target], role.id])];
    saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ autorole [${target}] added ${role}`), true;
  }

  if (cmd === 'massrole') {
    if (!adminOnly()) return true;
    // .massrole all/humans/bots add <@role>  |  .massrole all/humans/bots remove <@role>
    const target = (sub || '').toLowerCase();
    const action = (rest[0] || '').toLowerCase();
    const role = msg.mentions.roles.first();
    if (!['all', 'humans', 'bots'].includes(target) || !['add', 'remove'].includes(action) || !role)
      return msg.reply('`.massrole all/humans/bots add <@role>` / `.massrole all/humans/bots remove <@role>`'), true;
    await msg.reply(`⏳ massrole ${action} running...`);
    let members = [...(await msg.guild.members.fetch()).values()];
    if (target === 'humans') members = members.filter(m => !m.user.bot);
    if (target === 'bots') members = members.filter(m => m.user.bot);
    let n = 0;
    for (const m of members) {
      try {
        if (action === 'add') await m.roles.add(role).catch(() => {});
        else await m.roles.remove(role).catch(() => {});
        n++;
        if (n % 10 === 0) await new Promise(r => setTimeout(r, 1000)); // rate-limit safe
      } catch {}
    }
    return msg.reply(`✅ massrole done: ${n} members`), true;
  }

  if (cmd === 'rolecreate') {
    if (!adminOnly()) return true;
    const name = rest.join(' ') || sub;
    if (!name) return msg.reply('`.rolecreate <name>`'), true;
    const r = await msg.guild.roles.create({ name }).catch(() => null);
    return msg.reply(r ? `✅ Role created: ${r}` : '❌ Role not created (check permission/role position)'), true;
  }

  if (cmd === 'roleicon') {
    if (!adminOnly()) return true;
    const role = msg.mentions.roles.first();
    const url = rest.find(a => a.startsWith('http'));
    if (!role || !url) return msg.reply('`.roleicon <@role> <image-url>` (server must be boosted)'), true;
    try { await role.setIcon(url); return msg.reply(`✅ ${role} icon set`), true; }
    catch { return msg.reply('❌ Icon not set (needs Level 2+ boost + permission)'), true; }
  }

  if (cmd === 'serverlog') {
    if (!adminOnly()) return true;
    const ch = msg.mentions.channels.first() || msg.channel;
    cfg.serverlog = ch.id; saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ Server-log channel: ${ch}`), true;
  }

  if (cmd === 'logdelete') {
    // deleted/edited msg log on/off
    if (!adminOnly()) return true;
    const v = ((sub || 'on') === 'on');
    cfg.logdelete = v; saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ logdelete ${v ? 'ON (deletes/edits will show in serverlog channel)' : 'OFF'}`), true;
  }

  return null;
}

// apply autorole on join
async function applyAutorole(member) {
  try {
    const cfg = getGuild(member.guild.id);
    const ids = new Set([...(cfg.autorole?.all || [])]);
    for (const id of (member.user.bot ? cfg.autorole?.bots : cfg.autorole?.humans) || []) ids.add(id);
    if (!member.user.bot && cfg.roles?.allMembers) ids.add(cfg.roles.allMembers);
    if (!ids.size) return;
    for (const id of ids) await member.roles.add(id).catch(() => {});
  } catch {}
}

module.exports = { run, applyAutorole };
