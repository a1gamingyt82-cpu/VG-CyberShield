// Ticket: .ticket setup / .ticket [support|report] / .ticket image / .close (+ panel buttons/select)
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');
const { bannerFile } = require('./antinukeCmds');

const TYPES = {
  support: { label: '( 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 )', emoji: '<a:joya:1551154653201440828>', style: ButtonStyle.Success, title: '<a:joya:1551154653201440828> ( 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐓𝐢𝐜𝐤𝐞𝐭 )', optDesc: 'Open a private support ticket for help' },
  report: { label: '( 𝐑𝐞𝐩𝐨𝐫𝐭 )', emoji: '<a:vgwarn:1559740808146591774>', style: ButtonStyle.Danger, title: '<a:vgwarn:1559740808146591774> ( 𝐑𝐞𝐩𝐨𝐫𝐭 𝐓𝐢𝐜𝐤𝐞𝐭 )', optDesc: 'Report a rule breaker or player' },
};

function ownerFooter(client) {
  return { text: '( 𝐕𝐆 𝐂𝐡𝐞𝐚𝐭𝐬 𝐎𝐰𝐧𝐞𝐫 - 𝐕𝐞𝐫𝐦𝐚𝐉𝐢 👑 )', iconURL: 'https://cdn.discordapp.com/emojis/1551154653201440828.gif' };
}
function uname(user) { return (user.username || 'user').toLowerCase().replace(/\W/g, '').slice(0, 20) || 'user'; }

// Professional support panel with mathematical bold font & animated icons
function buildPanel(guild, client) {
  const cfg = getGuild(guild.id);
  const avatar = client.user.displayAvatarURL({ size: 128 });
  const em = new EmbedBuilder()
    .setColor(0x2f7bff)
    .setAuthor({ name: '( 𝐕𝐆 𝐂𝐲𝐛𝐞𝐫𝐒𝐡𝐢𝐞𝐥𝐝 • 𝐓𝐢𝐜𝐤𝐞𝐭 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 )', iconURL: 'https://cdn.discordapp.com/emojis/1551154653201440828.gif' })
    .setTitle('<a:joya:1551154653201440828> ( 𝐇𝐞𝐥𝐩 & 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐏𝐚𝐧𝐞𝐥 )')
    .setThumbnail(avatar)
    .setDescription(
      '### <a:joya:1551154653201440828> **Hello & Welcome**\n\n' +
      '> <a:joya:1551156450825474048> Welcome to **VG Cheats Official Support**\n' +
      '> <a:joya:1551156450825474048> Our staff and moderation team will respond to you shortly\n\n' +
      '### <a:joya:1551393231642829001> **Instructions:**\n' +
      '> <a:joya:1551156450825474048> Click the **[ ( 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 ) ]** button below for general assistance.\n' +
      '> <a:joya:1551156450825474048> Click the **[ ( 𝐑𝐞𝐩𝐨𝐫𝐭 ) ]** button to file a report.\n\n' +
      '*<a:vgwarn:1559740808146591774> Please do not spam or mass ping staff members.*\n\n' +
      '**<a:vgtick:1559740802324893798> Thank you for choosing VG Cheats!**\n— **( 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐓𝐞𝐚𝐦 )**'
    )
    .setFooter(ownerFooter(client));
  const files = [];
  if (cfg.ticket?.image) em.setImage(cfg.ticket.image);
  else { em.setImage('attachment://vg-banner.png'); files.push(bannerFile()); }
  const menu = new StringSelectMenuBuilder()
    .setCustomId('vg_ticket_select')
    .setPlaceholder('『 ( 𝐒𝐞𝐥𝐞𝐜𝐭 𝐏𝐚𝐧𝐞𝐥 ) 』')
    .addOptions(Object.entries(TYPES).map(([k, t]) => ({
      label: `${t.label} ( 𝐓𝐢𝐜𝐤𝐞𝐭 )`, value: k, description: t.optDesc.slice(0, 100), emoji: t.emoji,
    })));
  const btns = new ActionRowBuilder().addComponents(
    Object.entries(TYPES).map(([k, t]) =>
      new ButtonBuilder().setCustomId(`vg_ticket_${k}`).setLabel(t.label).setStyle(t.style).setEmoji(t.emoji))
  );
  return { embeds: [em], files, components: [new ActionRowBuilder().addComponents(menu), btns] };
}

function findTicket(guild, user) {
  const u = uname(user);
  return guild.channels.cache.find(c =>
    c.name === `support-${u}` || c.name === `report-${u}` ||
    c.name === `ticket-${u}` || c.name === `ticket-${u.replace(/\W/g, '-')}`) || null;
}
function isTicketChannel(ch) {
  return ch && /^(ticket|support|report)-/.test(ch.name);
}

async function openTicket(guild, user, type, client) {
  const t = TYPES[type] || TYPES.support;
  const existing = findTicket(guild, user);
  if (existing) return { existing };
  const ch = await guild.channels.create({
    name: `${type}-${uname(user)}`.slice(0, 30),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });
  const em = new EmbedBuilder()
    .setColor(type === 'report' ? 0xed4245 : 0x2ecc71)
    .setTitle(t.title)
    .setThumbnail(client.user.displayAvatarURL({ size: 128 }))
    .setDescription(
      `### <a:joya:1551154653201440828> Hello <@${user.id}>\n\n` +
      `> <a:joya:1551156450825474048> Please state your issue or inquiry clearly so our team can help you promptly.\n\n` +
      `*<a:vgwarn:1559740808146591774> Do not spam or mention staff repeatedly*\n\n` +
      `**<a:vgtick:1559740802324893798> Thanks for your patience!**\n— **( 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐓𝐞𝐚𝐦 )**`
    )
    .setFooter(ownerFooter(client));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vg_ticket_close').setLabel('( 𝐂𝐥𝐨𝐬𝐞 𝐓𝐢𝐜𝐤𝐞𝐭 )').setStyle(ButtonStyle.Danger).setEmoji('<a:vgcross:1559740805206515743>')
  );
  await ch.send({ content: `<@${user.id}>`, embeds: [em], components: [row] }).catch(() => {});
  return { channel: ch };
}

async function run(msg, args, client) {
  const [cmd, sub, ...rest] = args;
  if (cmd !== 'ticket' && cmd !== 'close') return null;

  if (cmd === 'close') {
    if (!isTicketChannel(msg.channel)) return msg.reply('<a:vgcross:1559740805206515743> This is not a ticket channel.'), true;
    await msg.reply('<a:vgwarn:1559740808146591774> Ticket closing in 5 seconds...');
    setTimeout(() => msg.channel.delete().catch(() => {}), 5000);
    return true;
  }

  // .ticket setup [#channel] — send panel
  if (sub === 'setup') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('<a:vgcross:1559740805206515743> Admins only.'), true;
    const ch = msg.mentions.channels.first() || msg.channel;
    await ch.send(buildPanel(msg.guild, client)).catch(() => {});
    return msg.reply(`<a:vgtick:1559740802324893798> Ticket panel sent to ${ch}.`), true;
  }
  // .ticket image <url/attach> — change panel image
  if (sub === 'image') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('<a:vgcross:1559740805206515743> Admins only.'), true;
    const url = rest[0] || msg.attachments.first()?.url;
    if (!url || !/^https?:\/\//.test(url)) return msg.reply('<a:vgwarn:1559740808146591774> Usage: `.ticket image <image-url>` or attach an image.'), true;
    const cfg = getGuild(msg.guild.id);
    cfg.ticket = cfg.ticket || {};
    cfg.ticket.image = url;
    saveGuild(msg.guild.id, cfg);
    return msg.reply(`<a:vgtick:1559740802324893798> Ticket panel image updated! Preview with: \`.ticket setup\``), true;
  }
  // .ticket removeimage — restore default banner
  if (sub === 'removeimage' || sub === 'resetimage') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('<a:vgcross:1559740805206515743> Admins only.'), true;
    const cfg = getGuild(msg.guild.id);
    cfg.ticket = cfg.ticket || {};
    cfg.ticket.image = null;
    saveGuild(msg.guild.id, cfg);
    return msg.reply('<a:vgtick:1559740802324893798> Custom panel image removed. Restored default VG banner.'), true;
  }
  // .ticket [support|report] — open a ticket
  const type = sub === 'report' ? 'report' : 'support';
  try {
    const r = await openTicket(msg.guild, msg.author, type, client);
    if (r.existing) return msg.reply(`<a:vgwarn:1559740808146591774> You already have an open ticket: ${r.existing}`), true;
    return msg.reply(`<a:vgtick:1559740802324893798> Ticket created: ${r.channel}`), true;
  } catch { return msg.reply('<a:vgcross:1559740805206515743> Failed to open ticket. Please grant the bot **Manage Channels** permission.'), true; }
}

// Panel buttons + select + close-button
async function handleInteraction(i, client) {
  const id = String(i.customId);
  if (id === 'vg_ticket_close') {
    if (!isTicketChannel(i.channel)) { await i.reply({ content: '<a:vgcross:1559740805206515743> This is not a ticket channel.', ephemeral: true }).catch(() => {}); return; }
    await i.reply('<a:vgwarn:1559740808146591774> Ticket closing in 5 seconds...').catch(() => {});
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    return;
  }
  const type = id === 'vg_ticket_select' ? i.values?.[0] : id.replace('vg_ticket_', '');
  if (!TYPES[type]) { await i.deferUpdate().catch(() => {}); return; }
  await i.deferReply({ ephemeral: true }).catch(() => {});
  try {
    const r = await openTicket(i.guild, i.user, type, client);
    if (r.existing) await i.editReply(`<a:vgwarn:1559740808146591774> You already have an open ticket: ${r.existing}`).catch(() => {});
    else await i.editReply(`<a:vgtick:1559740802324893798> **${TYPES[type].label}** ticket opened: ${r.channel}`).catch(() => {});
  } catch {
    await i.editReply('<a:vgcross:1559740805206515743> Failed to open ticket. Please grant the bot **Manage Channels** permission.').catch(() => {});
  }
}

module.exports = { run, handleInteraction, buildPanel, openTicket, TYPES };
