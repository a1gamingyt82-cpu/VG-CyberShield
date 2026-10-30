// .aradd / .arlist / .arremove / .arregrole / .arreset / .autoresponder
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');

async function run(msg, args) {
  const [cmd, ...rest] = args;
  if (!['aradd', 'arlist', 'arremove', 'arregrole', 'arreset', 'autoresponder'].includes(cmd)) return null;
  const cfg = getGuild(msg.guild.id);

  if (cmd === 'autoresponder') {
    return msg.reply(
      `🤖 **Autoresponder** (${cfg.autoresponder.length})\n` +
      '`.aradd <trigger> | <reply>` — exact match\n`.arregrole <trigger> | <@role>` — trigger par role\n`.arlist` / `.arremove <trigger>` / `.arreset`'
    ), true;
  }
  if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.'), true;

  if (cmd === 'arlist') {
    if (!cfg.autoresponder.length) return msg.reply('No autoresponses.'), true;
    return msg.reply(cfg.autoresponder.map((a, i) => `${i + 1}. \`${a.trigger}\` → ${a.roleId ? `<@&${a.roleId}> (role)` : a.response}`).join('\n').slice(0, 1800)), true;
  }
  if (cmd === 'arreset') { cfg.autoresponder = []; saveGuild(msg.guild.id, cfg); return msg.reply('✅ Autoresponder reset'), true; }
  if (cmd === 'arremove') {
    const t = rest.join(' ').toLowerCase();
    cfg.autoresponder = cfg.autoresponder.filter(a => a.trigger.toLowerCase() !== t);
    saveGuild(msg.guild.id, cfg); return msg.reply('✅ Removed (if it existed)'), true;
  }
  if (cmd === 'aradd' || cmd === 'arregrole') {
    const full = rest.join(' ').split('|').map(s => s.trim());
    if (full.length < 2) return msg.reply(cmd === 'aradd' ? '`.aradd <trigger> | <reply>`' : '`.arregrole <trigger> | <@role>`'), true;
    const [trigger, second] = full;
    if (cmd === 'aradd') {
      cfg.autoresponder = cfg.autoresponder.filter(a => a.trigger.toLowerCase() !== trigger.toLowerCase());
      cfg.autoresponder.push({ trigger, response: second, match: 'exact' });
    } else {
      const role = msg.mentions.roles.first();
      if (!role) return msg.reply('`.arregrole <trigger> | <@role>`'), true;
      cfg.autoresponder = cfg.autoresponder.filter(a => a.trigger.toLowerCase() !== trigger.toLowerCase());
      cfg.autoresponder.push({ trigger, roleId: role.id, match: 'exact' });
    }
    saveGuild(msg.guild.id, cfg);
    return msg.reply('✅ Autoresponse saved'), true;
  }
}

async function check(msg) {
  if (!msg.guild || msg.author.bot) return false;
  const cfg = getGuild(msg.guild.id);
  const text = (msg.content || '').toLowerCase().trim();
  const hit = cfg.autoresponder.find(a => text === a.trigger.toLowerCase());
  if (!hit) return false;
  try {
    if (hit.roleId) {
      await msg.member?.roles.add(hit.roleId).catch(() => {});
      await msg.reply(`✅ You got <@&${hit.roleId}>!`).catch(() => {});
    } else {
      await msg.reply(hit.response).catch(() => {});
    }
  } catch {}
  return true;
}

module.exports = { run, check };
