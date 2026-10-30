// .automod / .automod config / .antighostping / .automodwhitelist [@user panel | add | remove]
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');
const { isBotOwner } = require('../antinuke');

// Bypassable automod modules (panel chips)
const BYPASS_MODULES = {
  links: 'Anti-Link',
  spam: 'Anti-Spam',
  mentions: 'Anti-Mention Spam',
  caps: 'Anti-Caps',
  ghostping: 'Anti-Ghostping',
};
function bypassOf(cfg, userId) {
  return new Set(cfg.automod?.bypass?.[userId] || []);
}

// message filter - called from index.js MessageCreate
async function filter(msg) {
  if (!msg.guild || msg.author.bot) return false;
  const cfg = getGuild(msg.guild.id);
  const am = cfg.automod;
  if (cfg.automodWhitelist?.includes(msg.author.id) || am.automodWhitelist?.includes(msg.author.id)) return false;
  if (cfg.whitelist?.includes(msg.author.id)) return false;
  if (msg.member?.permissions.has('Administrator')) return false;
  const bypass = bypassOf(cfg, msg.author.id);
  const content = msg.content || '';

  // ghostping detect = message had a mention that was deleted/edited (index.js delete/update handler covers it)
  // here: mass mention / caps / spam-lines / invite-link
  const badMention = (msg.mentions.users.size + msg.mentions.roles.size) > (am.maxMentions ?? 4);
  const lines = content.split('\n').length > (am.maxLines ?? 8);
  const letters = content.replace(/[^a-zA-Z]/g, '');
  const caps = letters.length >= 10 && (letters.replace(/[^A-Z]/g, '').length / letters.length) * 100 > (am.maxCapsPct ?? 70);
  const hasInvite = am.invites && /(discord\.gg\/|discord\.com\/invite\/)/i.test(content);

  const hit =
    (badMention && !bypass.has('mentions')) ||
    (lines && !bypass.has('spam')) ||
    ((am.caps && caps) && !bypass.has('caps')) ||
    ((am.links && hasInvite && cfg.antiLink) && !bypass.has('links'));
  if (hit) {
    try { await msg.delete().catch(() => {}); } catch {}
    try {
      await msg.member?.timeout(5 * 60 * 1000, '[Automod] spam/caps/mention').catch(() => {});
      const w = await msg.channel.send(`⚠️ <@${msg.author.id}> automod: spam/caps/mass-mention block.`).catch(() => null);
      if (w) setTimeout(() => w.delete().catch(() => {}), 6000);
    } catch {}
    return true;
  }
  return false;
}

async function ghostpingAlert(msg) {
  // called on delete/update: warn if the msg had a mention
  if (!msg.guild || msg.author?.bot) return;
  const cfg = getGuild(msg.guild.id);
  if (!cfg.automod.ghostping) return;
  if (msg.member?.permissions.has('Administrator')) return;
  if (cfg.whitelist?.includes(msg.author.id) || cfg.automodWhitelist?.includes(msg.author.id) || cfg.automod?.automodWhitelist?.includes(msg.author.id)) return;
  if (bypassOf(cfg, msg.author.id).has('ghostping')) return;
  if (!msg.mentions || (msg.mentions.users.size === 0 && msg.mentions.roles.size === 0 && !msg.mentions.everyone)) return;
  const w = await msg.channel.send(`👻 <@${msg.author.id}> don't ghost-ping!`).catch(() => null);
  if (w) setTimeout(() => w.delete().catch(() => {}), 8000);
}

// Screenshot-jaisa bypass panel for one user
function buildBypassPanel(guildId, uid) {
  const cfg = getGuild(guildId);
  const got = bypassOf(cfg, uid);
  const chips = Object.entries(BYPASS_MODULES)
    .map(([k, label]) => `${got.has(k) ? '✅' : '💀'} \`${label}\``).join('\n');
  const em = new EmbedBuilder()
    .setColor(0xff2222)
    .setTitle('👑 VG Automod System')
    .setDescription(
      `🔴 Advanced Automod Protection Module\n\n${chips}\n\n❯ User: <@${uid}>`
    )
    .setFooter({ text: 'Powered By VG Cheats™' });
  const keys = Object.keys(BYPASS_MODULES);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`vg_bypass_sel:${uid}`)
    .setPlaceholder('Choose Modules to Grant Bypass')
    .setMinValues(1)
    .setMaxValues(keys.length)
    .addOptions(keys.map(k => ({
      label: BYPASS_MODULES[k].slice(0, 50), value: k,
      description: got.has(k) ? 'Bypass ON (click to keep)' : 'Grant bypass for this module',
      emoji: got.has(k) ? '✅' : '💀',
    })));
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`vg_bypass_all:${uid}`).setLabel('Grant All').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [em], components: [new ActionRowBuilder().addComponents(menu), row2] };
}

function canGrant(member, guild, userId) {
  if (!member || !guild) return false;
  if (guild.ownerId === userId || isBotOwner(userId)) return true;
  try { return member.permissions.has(PermissionFlagsBits.Administrator); } catch { return false; }
}

async function run(msg, args) {
  const [cmd, sub, ...rest] = args;
  if (cmd === 'automod') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.');
    const cfg = getGuild(msg.guild.id);
    if (!sub || sub === 'config') {
      const a = cfg.automod;
      return msg.reply({
        embeds: [new EmbedBuilder().setTitle('🤖 Automod Config').setColor(0xff3333).setDescription(
          `Ghostping: \`${a.ghostping}\` | Caps: \`${a.caps}\` | Spam-lines: \`${a.spam}\` | Links: \`${a.links}\` | Invites: \`${a.invites}\`\nMaxMentions: \`${a.maxMentions}\` MaxLines: \`${a.maxLines}\`\nWhitelist: ${(a.automodWhitelist || []).length} users`
        )],
      });
    }
    const map = { ghostping: 'ghostping', caps: 'caps', spam: 'spam', links: 'links', invites: 'invites' };
    if (map[sub] && ['on', 'off'].includes(rest[0])) {
      cfg.automod[map[sub]] = rest[0] === 'on'; saveGuild(msg.guild.id, cfg);
      return msg.reply(`✅ automod ${sub} = \`${rest[0]}\``);
    }
    return msg.reply('`.automod [config|ghostping/caps/spam/links/invites on/off]`');
  }
  if (cmd === 'antighostping') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.');
    const cfg = getGuild(msg.guild.id);
    const v = (sub || 'on') === 'on';
    cfg.automod.ghostping = v; saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ antighostping ${v ? 'ON' : 'OFF'}`);
  }
  if (cmd === 'automodwhitelist') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins/owner only.');
    const cfg = getGuild(msg.guild.id);
    cfg.automod.automodWhitelist = cfg.automod.automodWhitelist || [];
    const users = [...msg.mentions.users.values()];
    // .automodwhitelist @user — bypass panel (screenshot style)
    if (!sub && users.length) {
      await msg.channel.send(buildBypassPanel(msg.guild.id, users[0].id)).catch(() => {});
      return true;
    }
    if (sub === 'add') {
      for (const u of users) if (!cfg.automod.automodWhitelist.includes(u.id)) cfg.automod.automodWhitelist.push(u.id);
      saveGuild(msg.guild.id, cfg);
      return msg.reply(`✅ Automod full-bypass: ${users.map(u => `<@${u.id}>`).join(' ') || '—'}\nPer-module panel ke liye: \`.automodwhitelist @user\``), true;
    }
    if (sub === 'remove') {
      const ids = new Set([...users.map(u => u.id), ...(rest.join(' ').match(/\d{15,25}/g) || [])]);
      cfg.automod.automodWhitelist = cfg.automod.automodWhitelist.filter(x => !ids.has(x));
      cfg.automod.bypass = cfg.automod.bypass || {};
      for (const id of ids) delete cfg.automod.bypass[id];
      saveGuild(msg.guild.id, cfg);
      return msg.reply('✅ Automod whitelist + bypass remove.'), true;
    }
    return msg.reply(`Automod whitelist (${cfg.automod.automodWhitelist.length}): ${cfg.automod.automodWhitelist.map(id => `<@${id}>`).join(' ') || '—'}\nPanel: \`.automodwhitelist @user\``), true;
  }
  return null;
}

// Bypass panel interactions (select = grant chosen, Grant All = sab)
async function handleInteraction(i) {
  const [base, uid] = String(i.customId).split(':');
  if (!uid || !i.guild) { await i.deferUpdate().catch(() => {}); return; }
  if (!canGrant(i.member, i.guild, i.user.id)) {
    await i.reply({ content: '❌ Admins/owner only.', ephemeral: true }).catch(() => {});
    return;
  }
  const cfg = getGuild(i.guild.id);
  cfg.automod = cfg.automod || {};
  cfg.automod.bypass = cfg.automod.bypass || {};
  const set = new Set(cfg.automod.bypass[uid] || []);
  if (base === 'vg_bypass_all') {
    for (const k of Object.keys(BYPASS_MODULES)) set.add(k);
  } else if (base === 'vg_bypass_sel') {
    for (const v of i.values || []) if (BYPASS_MODULES[v]) set.add(v);
  } else { await i.deferUpdate().catch(() => {}); return; }
  cfg.automod.bypass[uid] = [...set];
  saveGuild(i.guild.id, cfg);
  const names = [...set].map(k => BYPASS_MODULES[k]).join(', ');
  await i.update(buildBypassPanel(i.guild.id, uid)).catch(() => {});
  await i.followUp({ content: `✅ <@${uid}> bypass: ${names}`, ephemeral: true }).catch(() => {});
}

module.exports = { run, filter, ghostpingAlert, handleInteraction, buildBypassPanel, BYPASS_MODULES };
