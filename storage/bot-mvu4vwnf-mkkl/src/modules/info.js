// Info: .help / .invite / .ping / .uptime / .vanity  (+ Home / All Commands / module select)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { dot } = require('./helpers');

function navRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vg_home').setLabel('( 𝐇𝐨𝐦𝐞 )').setStyle(ButtonStyle.Secondary).setEmoji('<a:joya:1551154653201440828>'),
    new ButtonBuilder().setCustomId('vg_all').setLabel('( 𝐀𝐥𝐥 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 )').setStyle(ButtonStyle.Secondary).setEmoji('<a:joya:1551393231642829001>'),
  );
}

// Har module ka full panel (AeroX-style): title + desc + command chips
const MODULES = {
  antinuke: { icon: '<a:vgwarn:1559740808146591774>', title: '( 𝐀𝐧𝐭𝐢𝐧𝐮𝐤𝐞 & 𝐒𝐞𝐜𝐮𝐫𝐢𝐭𝐲 )', desc: 'Zero-Trust protection: Only Main Server Owner can ban. 0.03s reaction.', cmds: ['.antinuke', '.antinuke config', '.antinuke enable', '.antinuke disable', '.setup [all|roles|logs]', '.fixroles', '.eventrole <@role>', '.event <message>', '.dmall <message>', '.logs', '.antinuke onlyownerban on/off', '.antinuke zerotol on/off', '.backup', '.restore', '.nukerecovery', '.whitelist', '.whitelist add <@user>', '.whitelist remove <@user>', '.whitelist show', '.extraowner', '.extraowner add <@user>', '.extraowner remove <@user>', '.extraowner show'] },
  automod: { icon: '<a:vgwarn:1559740808146591774>', title: '( 𝐀𝐮𝐭𝐨𝐦𝐨𝐝 𝐒𝐲𝐬𝐭𝐞𝐦 )', desc: 'Zero-tolerance automated security engine.', cmds: ['.automod', '.automod config', '.antighostping', '.automodwhitelist @user (bypass panel)', '.automodwhitelist add <@user>', '.automodwhitelist remove <@user>'] },
  automation: { icon: '<a:joya:1551393231642829001>', title: '( 𝐀𝐮𝐭𝐨𝐦𝐚𝐭𝐢𝐨𝐧 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.autoreact', '.autorole', '.logdelete', '.massrole', '.rolecreate', '.roleicon', '.serverlog'] },
  autoresponder: { icon: '<a:joya:1551156450825474048>', title: '( 𝐀𝐮𝐭𝐨𝐫𝐞𝐬𝐩𝐨𝐧𝐝𝐞𝐫 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.aradd', '.arlist', '.arremove', '.arregrole', '.arreset', '.autoresponder'] },
  access: { icon: '<a:joya:1551154653201440828>', title: '( 𝐀𝐜𝐜𝐞𝐬𝐬 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.role add <user> <role>', '.role remove <user> <role>', '.temprole <user> <role> <time>', '.perms add user <@user>', '.perms add role-owner <@user>', '.perms rm user <@user>', '.perms list', '.perms reset'] },
  customrole: { icon: '<a:joya:1551393231642829001>', title: '( 𝐂𝐮𝐬𝐭𝐨𝐦𝐫𝐨𝐥𝐞 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.reqall', '.roleedit', '.roleremove', '.rolereset', '.rolesetup', '.roleshow'] },
  games: { icon: '<a:joya:1551393231642829001>', title: '( 𝐆𝐚𝐦𝐞𝐬 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.tod'] },
  giveaway: { icon: '<a:joya:1551154653201440828>', title: '( 𝐆𝐢𝐯𝐞𝐚𝐰𝐚𝐲 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.gdelete', '.gend', '.glist', '.greroll', '.gstart'] },
  info: { icon: '<a:joya:1551156450825474048>', title: '( 𝐈𝐧𝐟𝐨 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.help', '.invite', '.ping', '.uptime', '.vanity'] },
  moderation: { icon: '<a:vgwarn:1559740808146591774>', title: '( 𝐒𝐞𝐫𝐯𝐞𝐫 𝐌𝐨𝐝𝐞𝐫𝐚𝐭𝐢𝐨𝐧 )', desc: 'Advanced server management protocols.', cmds: ['.ban <@user>', '.unban <id>', '.kick <@user>', '.timeout <@user>', '.untimeout <@user>', '.role <user> <role>', '.rrole <user> <role>', '.lock', '.unlock', '.lockall', '.unlockall', '.purge <1-100>', '.purgebots', '.nickname', '.steal <emoji>', '.list'] },
  music: { icon: '<a:joya:1551393231642829001>', title: '( 𝐌𝐮𝐬𝐢𝐜 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'High-quality music streaming with full queue control.', cmds: ['.play <song/url>', '.video <song/url>', '.pause', '.resume', '.skip', '.stop', '.nowplaying', '.queue', '.shuffle', '.clear', '.loop', '.volume <1-100>', '.247', '.mhelp', '.musicrole', '.remove musicrole'] },
  premium: { icon: '<a:joya:1551154653201440828>', title: '( 𝐏𝐫𝐞𝐦𝐢𝐮𝐦 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.antialt', '.nightmode', '.premium', '.setlogo <image>', '.removelogo', '.resetbotbanner', '.setbotbanner'] },
  ticket: { icon: '<a:vgtick:1559740802324893798>', title: '( 𝐓𝐢𝐜𝐤𝐞𝐭 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Private support tickets for your server.', cmds: ['.ticket setup [#channel]', '.ticket [support|report]', '.ticket image <url>', '.ticket removeimage', '.close'] },
  util: { icon: '<a:joya:1551156450825474048>', title: '( 𝐔𝐭𝐢𝐥 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.afk', '.avatar', '.banner', '.bi', '.serverinfo', '.userinfo', '.roles', '.snipe', '.prefix', '.report', '.upi', '.musicrole', '.musicvc'] },
  voice: { icon: '<a:joya:1551393231642829001>', title: '( 𝐕𝐨𝐢𝐜𝐞 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.j2c', '.vcrole'] },
  voicemaster: { icon: '<a:joya:1551154653201440828>', title: '( 𝐕𝐨𝐢𝐜𝐞𝐦𝐚𝐬𝐭𝐞𝐫 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Complete list of active commands for this component.', cmds: ['.voice', '.vcmod', '.vcl / .vcu', '.vch / .vcuh', '.vcp / .vcd', '.vcpa / .vcma', '.vcmute / .vcunmute', '.vcdeafen / .vcundeafen', '.vclimit / .vcname'] },
  welcome: { icon: '<a:joya:1551154653201440828>', title: '( 𝐖𝐞𝐥𝐜𝐨𝐦𝐞 𝐌𝐨𝐝𝐮𝐥𝐞 )', desc: 'Customizable welcome embed with Animated GIF banner.', cmds: ['.welcome #channel', '.welcome banner <url/GIF>', '.welcome banner remove', '.welcome message <text>', '.welcome ping <text>', '.welcome title <text>', '.welcome color <#hex>', '.welcome test', '.welcome off'] },
};
const ORDER = ['antinuke', 'automod', 'automation', 'autoresponder', 'access', 'customrole', 'games', 'giveaway', 'info', 'moderation', 'music', 'premium', 'ticket', 'util', 'voice', 'voicemaster', 'welcome'];

function modulePanel(key) {
  const m = MODULES[key];
  if (!m) return null;
  const em = new EmbedBuilder()
    .setTitle(`${iconFor(key)} ${m.title}`)
    .setColor(0xff2222)
    .setDescription(m.desc + '\n─────────────────────');
  // chips, 2-column jaisa feel: ek field me saare
  em.addFields({ name: 'Commands', value: m.cmds.map(c => `${dot()} \`${c}\``).join('\n').slice(0, 3800) || '—' });
  em.setFooter({ text: '© — ( 𝐕𝐆 𝐂𝐲𝐛𝐞𝐫𝐒𝐡𝐢𝐞𝐥𝐝 )' });
  return em;
}

function selectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('vg_select')
    .setPlaceholder('『 ( 𝐒𝐞𝐥𝐞𝐜𝐭 𝐌𝐨𝐝𝐮𝐥𝐞 ) 』')
    .addOptions(ORDER.map(k => ({
      label: MODULES[k].title.slice(0, 50),
      value: k,
      emoji: menuEmoji(k),
    })));
  return new ActionRowBuilder().addComponents(menu);
}

// Module icons: red PNGs (assets/module-icons/*.png) -> server emoji upload karke
// config.js > defaults.moduleEmojis me IDs paste karo. Khali = unicode fallback.
let CUSTOM = {};
try { CUSTOM = require('../../config').defaults?.moduleEmojis || {}; } catch {}
function iconFor(k) {
  const c = CUSTOM[k];
  return (typeof c === 'string' && c.trim()) ? c.trim() : ICONS[k];
}
// Select-menu ke liye: custom '<a:name:id>' ho to id & animated nikalo
function menuEmoji(k) {
  const c = CUSTOM[k] || ICONS[k];
  if (typeof c === 'string') {
    const m = c.match(/<(a)?:([a-zA-Z0-9_]+):(\d+)>/);
    if (m) return { animated: Boolean(m[1]), name: m[2], id: m[3] };
  }
  return ICONS[k];
}
const ICONS = {
  antinuke: '<a:vgwarn:1559740808146591774>',
  automod: '<a:vgwarn:1559740808146591774>',
  automation: '<a:joya:1551393231642829001>',
  autoresponder: '<a:joya:1551156450825474048>',
  access: '<a:joya:1551154653201440828>',
  customrole: '<a:joya:1551393231642829001>',
  games: '<a:joya:1551393231642829001>',
  giveaway: '<a:joya:1551154653201440828>',
  info: '<a:joya:1551156450825474048>',
  moderation: '<a:vgwarn:1559740808146591774>',
  music: '<a:joya:1551393231642829001>',
  premium: '<a:joya:1551154653201440828>',
  ticket: '<a:vgtick:1559740802324893798>',
  util: '<a:joya:1551156450825474048>',
  voice: '<a:joya:1551393231642829001>',
  voicemaster: '<a:joya:1551154653201440828>',
  welcome: '<a:joya:1551154653201440828>',
};

function totalCommands() {
  return Object.values(MODULES).reduce((n, m) => n + m.cmds.length, 0) + 12;
}

function homeButtons(client) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('( 𝐈𝐧𝐯𝐢𝐭𝐞 𝐌𝐞 )')
      .setStyle(ButtonStyle.Link)
      .setEmoji('<a:joya:1551154653201440828>')
      .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`),
  );
  if (process.env.SUPPORT_URL) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('( 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐒𝐞𝐫𝐯𝐞𝐫 )')
        .setStyle(ButtonStyle.Link)
        .setEmoji('<a:joya:1551393231642829001>')
        .setURL(process.env.SUPPORT_URL)
    );
  }
  return row;
}

function buildHome(client) {
  const arrow = '<a:joya:1551156450825474048>';
  const lines = ORDER.map(k => `${iconFor(k)} » ${MODULES[k].title.replace(/ Module$/, '').replace('Antinuke & Security', 'Antinuke').replace('Server Moderation', 'Moderation').replace('Util Module', 'Util')}`).join('\n');
  return new EmbedBuilder()
    .setTitle(`<a:joya:1551154653201440828> Hey, I'm ${client.user.username}™`)
    .setColor(0xff2222)
    .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
    .setDescription(
      `A powerful Next-Gen Antinuke bot with the Best Features.\n\n` +
      `${arrow} My Prefix is \`.\`\n` +
      `${arrow} Total Commands: \`${totalCommands()}\`\n` +
      `${arrow} Use \`.setup\` to get started!\n\n` +
      lines
    )
    .setImage('attachment://vg-animated.gif')
    .setFooter({ text: 'Powered By VG CyberShield™ • Ultra Defense Engine' });
}

function animPath() {
  const path = require('path');
  const fs = require('fs');
  const gif = path.join(__dirname, '..', '..', 'assets', 'vg-animated.gif');
  if (fs.existsSync(gif)) return { attachment: gif, name: 'vg-animated.gif' };
  return { attachment: path.join(__dirname, '..', '..', 'assets', 'vg-animated.png'), name: 'vg-animated.png' };
}

function buildCmds() {
  const em = new EmbedBuilder()
    .setTitle('<a:joya:1551154653201440828> ( 𝐀𝐥𝐥 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 )')
    .setColor(0xff2222)
    .setDescription('Every module line-by-line — for full detail type `.help <module>` (e.g. `.help moderation`).');
  const rows = [
    ['antinuke', 'nuke-block, whitelist, extraowner, freeze, day-cap'],
    ['automod', 'ghostping, caps/spam/link filter, bypass whitelist'],
    ['automation', 'autoreact, autorole, massrole, server-log'],
    ['autoresponder', 'auto-reply or auto-role on trigger'],
    ['access', 'give/remove roles, temprole, perms'],
    ['customrole', 'create a role with your own name'],
    ['games', 'truth-or-dare'],
    ['giveaway', 'start/end/reroll giveaways'],
    ['info', 'help, ping, uptime, invite, vanity'],
    ['moderation', 'ban/kick/timeout/lock/purge/steal'],
    ['music', 'play/video/queue/loop/volume, 24/7 continuous music'],
    ['premium', 'anti-alt, nightmode, bot avatar'],
    ['ticket', 'open/close support tickets'],
    ['util', 'afk, avatar, snipe, serverinfo, upi'],
    ['voice', 'join-to-create, VC join role'],
    ['voicemaster', 'control your VC: lock/limit/name/mute'],
    ['welcome', 'welcome message for new members with animated GIF banner'],
  ];
  const titles = { antinuke: '( 𝐀𝐧𝐭𝐢𝐧𝐮𝐤𝐞 & 𝐒𝐞𝐜𝐮𝐫𝐢𝐭𝐲 )', automod: '( 𝐀𝐮𝐭𝐨𝐦𝐨𝐝 𝐒𝐲𝐬𝐭𝐞𝐦 )', moderation: '( 𝐒𝐞𝐫𝐯𝐞𝐫 𝐌𝐨𝐝𝐞𝐫𝐚𝐭𝐢𝐨𝐧 )' };
  for (const [k, d] of rows) {
    const t = titles[k] || MODULES[k].title;
    em.addFields({ name: `${iconFor(k)} ${t}`, value: `\`.help ${k}\` — ${d}`, inline: false });
  }
  em.setFooter({ text: 'VG CyberShield • ( 𝐀𝐥𝐥 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 )' });
  return em;
}

async function run(msg, args, client) {
  const [cmd, ...rest] = args;
  if (cmd === 'help') {
    const q = (rest[0] || '').toLowerCase();
    if (q.includes('antinuke') || q === 'nuke') {
      const { antinukeHelpEmbed, navRow, bannerFile } = require('./antinukeCmds');
      return msg.reply({ embeds: [antinukeHelpEmbed()], files: [bannerFile()], components: [navRow()] }), true;
    }
    const key = ORDER.find(k => k === q || MODULES[k].title.toLowerCase().includes(q));
    if (q && key) {
      return msg.reply({ embeds: [modulePanel(key)], components: [navRow(), selectRow()] }), true;
    }
    try { await msg.author.send({ embeds: [buildCmds()] }).catch(() => {}); } catch {}
    return msg.reply({ embeds: [buildHome(client)], files: [animPath()], components: [homeButtons(client), navRow(), selectRow()] }), true;
  }
  if (cmd === 'ping') {
    const m = await msg.reply('<a:joya:1551393231642829001> Ping...');
    const round = m.createdTimestamp - msg.createdTimestamp;
    await m.edit(`<a:vgtick:1559740802324893798> **( 𝐏𝐨𝐧𝐠! )**\nWS: \`${client.ws.ping}ms\` | Round-trip: \`${round}ms\``).catch(() => {});
    return true;
  }
  if (cmd === 'uptime') {
    const s = Math.floor(process.uptime());
    return msg.reply(`<a:joya:1551154653201440828> **( 𝐔𝐩𝐭𝐢𝐦𝐞 ):** ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`), true;
  }
  if (cmd === 'invite') {
    const { getWelcomeCard } = require('./helpers');
    return msg.reply(getWelcomeCard(client)), true;
  }
  if (cmd === 'vanity') {
    const v = msg.guild.vanityURLCode;
    return msg.reply(v ? `<a:joya:1551393231642829001> **( 𝐕𝐚𝐧𝐢𝐭𝐲 ):** \`discord.gg/${v}\` (uses: ${msg.guild.vanityURLUses ?? '?'})` : '<a:vgcross:1559740805206515743> This server has no vanity URL (requires Level 3 boost).'), true;
  }
  return null;
}

// Buttons + Select menu
async function handleButton(i, client) {
  if (i.customId === 'vg_home') {
    await i.update({ embeds: [buildHome(client)], files: [animPath()], components: [homeButtons(client), navRow(), selectRow()] }).catch(() => {});
  } else if (i.customId === 'vg_all') {
    await i.update({ embeds: [buildCmds()], components: [navRow(), selectRow()] }).catch(() => {});
  }
}
async function handleSelect(i) {
  const key = i.values?.[0];
  const panel = modulePanel(key);
  if (!panel) { await i.deferUpdate().catch(() => {}); return; }
  if (key === 'antinuke') {
    const { antinukeHelpEmbed, navRow, bannerFile } = require('./antinukeCmds');
    await i.update({ embeds: [antinukeHelpEmbed()], files: [bannerFile()], components: [navRow(), selectRow()] }).catch(() => {});
    return;
  }
  await i.update({ embeds: [panel], components: [navRow(), selectRow()] }).catch(() => {});
}

module.exports = { run, handleButton, handleSelect, buildHome, buildCmds, modulePanel, MODULES, ORDER };
