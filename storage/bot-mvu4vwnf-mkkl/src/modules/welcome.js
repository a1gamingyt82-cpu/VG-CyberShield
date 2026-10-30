// Welcome Module: Fully customizable welcome card & animated GIF banner system
// Screenshot-2 Style: Ping above embed + sleek dark embed + custom letter description + full-width animated GIF/image banner
const { EmbedBuilder } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');

async function run(msg, args) {
  const [cmd, sub, ...rest] = args;
  if (cmd !== 'greet' && cmd !== 'welcome') return null;
  const cfg = getGuild(msg.guild.id);
  cfg.greet = cfg.greet || {};

  // Extract raw un-split message body after prefix and command name (.welcome or .greet)
  const prefix = cfg.prefix || '.';
  let rawBody = msg.content || '';
  if (rawBody.startsWith(prefix)) {
    rawBody = rawBody.slice(prefix.length).trimStart();
  }
  rawBody = rawBody.replace(/^(welcome|greet)\s*/i, '');

  // .welcome / .welcome config (Show settings dashboard)
  if (!sub || sub === 'config' || sub === 'status') {
    const isConfigured = Boolean(cfg.greet.channelId);
    const arrow = '<a:joya:1551156450825474048>';
    const em = new EmbedBuilder()
      .setColor(0xff2222)
      .setTitle('<a:joya:1551154653201440828> ( 𝐕𝐆 𝐖𝐞𝐥𝐜𝐨𝐦𝐞 & 𝐀𝐧𝐢𝐦𝐚𝐭𝐞𝐝 𝐁𝐚𝐧𝐧𝐞𝐫 𝐒𝐲𝐬𝐭𝐞𝐦 )')
      .setDescription(
        `**Status:** ${isConfigured ? '<a:vgtick:1559740802324893798> `ACTIVE`' : '<a:vgwarn:1559740808146591774> `NOT CONFIGURED`'}\n` +
        `**Channel:** ${cfg.greet.channelId ? `<#${cfg.greet.channelId}>` : '`Not Set`'}\n` +
        `**Banner (Image/GIF):** ${cfg.greet.banner ? `[View Banner](${cfg.greet.banner})` : '`None`'}\n` +
        `**Color:** \`${cfg.greet.color || '#2b2d31'}\`\n\n` +
        `### <a:joya:1551393231642829001> ( 𝐂𝐮𝐬𝐭𝐨𝐦𝐢𝐳𝐚𝐭𝐢𝐨𝐧 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 ):\n` +
        `${arrow} \`.welcome #channel\` — Set welcome channel\n` +
        `${arrow} \`.welcome banner <url>\` — Set banner image or animated GIF (or attach an image)\n` +
        `${arrow} \`.welcome banner remove\` — Remove current banner\n` +
        `${arrow} \`.welcome message <text>\` — Set embed message description\n` +
        `${arrow} \`.welcome ping <text>\` — Set user mention text above embed\n` +
        `${arrow} \`.welcome title <text>\` — Set embed title / author\n` +
        `${arrow} \`.welcome color #hex\` — Set embed color (e.g. \`#ff0033\`)\n` +
        `${arrow} \`.welcome test\` — Preview live welcome message\n` +
        `${arrow} \`.welcome off\` — Disable welcome system\n\n` +
        `**Available Variables:**\n` +
        `\`{user}\` = Mention (@User) • \`{username}\` = Username • \`{server}\` = Server Name • \`{count}\` = Member Count`
      )
      .setFooter({ text: 'Supports full Animated GIFs and HD Banners • ( 𝐕𝐆 𝐂𝐲𝐛𝐞𝐫𝐒𝐡𝐢𝐞𝐥𝐝 )' });

    if (cfg.greet.banner) {
      em.setImage(cfg.greet.banner);
    }

    return msg.reply({ embeds: [em] }), true;
  }

  if (!isAdmin(msg.member, msg.guild)) return msg.reply('<a:vgcross:1559740805206515743> Admins/owner only.'), true;

  // .welcome off
  if (sub === 'off' || sub === 'disable') {
    cfg.greet.enabled = false;
    cfg.greet.channelId = null;
    saveGuild(msg.guild.id, cfg);
    return msg.reply('<a:vgtick:1559740802324893798> Welcome System has been turned **OFF**.'), true;
  }

  // .welcome test
  if (sub === 'test') {
    const ch = cfg.greet.channelId ? (msg.guild.channels.cache.get(cfg.greet.channelId) || await msg.guild.channels.fetch(cfg.greet.channelId).catch(() => null) || msg.channel) : msg.channel;
    await sendWelcome(msg.guild, msg.member, msg.client, ch.id);
    return msg.reply(`<a:vgtick:1559740802324893798> Live Welcome Preview sent to ${ch}!`), true;
  }

  // .welcome banner <url> / attach file / .welcome banner remove
  if (sub === 'banner' || sub === 'image' || sub === 'gif') {
    const action = (rest[0] || '').toLowerCase();
    if (action === 'remove' || action === 'off' || action === 'reset') {
      cfg.greet.banner = null;
      saveGuild(msg.guild.id, cfg);
      return msg.reply('<a:vgtick:1559740802324893798> Welcome banner removed! Messages will now be sent cleanly without a banner.'), true;
    }

    const url = rest[0] || msg.attachments.first()?.url;
    if (!url) {
      return msg.reply(
        '<a:joya:1551154653201440828> **Usage:** `.welcome banner <image/gif url>`\n' +
        '> Or attach an image/GIF and type `.welcome banner`\n' +
        '> **Note:** Animated GIFs are 100% supported!'
      ), true;
    }

    cfg.greet.banner = url;
    saveGuild(msg.guild.id, cfg);

    const em = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('<a:vgtick:1559740802324893798> ( 𝐖𝐞𝐥𝐜𝐨𝐦𝐞 𝐁𝐚𝐧𝐧𝐞𝐫 𝐒𝐚𝐯𝐞𝐝! )')
      .setDescription('Your welcome banner (Image / Animated GIF) has been saved! See preview below.\nTo test, type `.welcome test`.')
      .setImage(url);

    return msg.reply({ embeds: [em] }), true;
  }



  // .welcome ping <text>
  if (sub === 'ping') {
    const text = rawBody.replace(/^ping\s*/i, '').trim();
    if (text === 'off') {
      cfg.greet.pingText = '';
      saveGuild(msg.guild.id, cfg);
      return msg.reply('<a:vgtick:1559740802324893798> Above-embed user ping turned OFF.'), true;
    }
    if (!text) {
      return msg.reply('<a:joya:1551156450825474048> **Usage:** `.welcome ping Welcome {user} to {server}!` (Or `.welcome ping off`)'), true;
    }
    cfg.greet.pingText = text;
    saveGuild(msg.guild.id, cfg);
    return msg.reply('<a:vgtick:1559740802324893798> **Ping text updated!**'), true;
  }

  // .welcome title <text> / .welcome author <text>
  if (sub === 'title' || sub === 'author') {
    const text = rawBody.replace(/^(title|author)\s*/i, '').trim();
    if (!text) return msg.reply('<a:joya:1551156450825474048> **Usage:** `.welcome title <Your Title / Server Name>`'), true;
    cfg.greet.title = text;
    saveGuild(msg.guild.id, cfg);
    return msg.reply('<a:vgtick:1559740802324893798> **Welcome embed title updated!**'), true;
  }

  // .welcome color <#hex>
  if (sub === 'color') {
    const hex = rest[0];
    if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      return msg.reply('<a:joya:1551393231642829001> **Usage:** `.welcome color #ff0033` (Hex color code)'), true;
    }
    cfg.greet.color = hex.startsWith('#') ? hex : `#${hex}`;
    saveGuild(msg.guild.id, cfg);
    return msg.reply(`<a:vgtick:1559740802324893798> Welcome embed color set to \`${cfg.greet.color}\`!`), true;
  }

  // .welcome here / .welcome set / .welcome channel [#channel] (Set target welcome channel)
  if (sub === 'here' || sub === 'set' || sub === 'channel') {
    const chMention = msg.mentions.channels.first();
    const targetChannel = chMention || msg.channel;
    cfg.greet.channelId = targetChannel.id;
    cfg.greet.enabled = true;
    saveGuild(msg.guild.id, cfg);
    return msg.reply(
      `<a:vgtick:1559740802324893798> **Welcome Channel Set to ${targetChannel}!**\n` +
      `> All welcome messages will now be sent to ${targetChannel}.\n` +
      `> Set your welcome text using: \`.welcome <message>\`\n` +
      `> Test preview using: \`.welcome test\``
    ), true;
  }

  // .welcome #channel (When ONLY a channel mention is passed)
  if (msg.mentions.channels.size === 1 && rest.length === 0 && (sub.startsWith('<#') || sub.startsWith('#'))) {
    const targetChannel = msg.mentions.channels.first();
    cfg.greet.channelId = targetChannel.id;
    cfg.greet.enabled = true;
    saveGuild(msg.guild.id, cfg);
    return msg.reply(
      `<a:vgtick:1559740802324893798> **Welcome Channel Set to ${targetChannel}!**\n` +
      `> All welcome messages will now be sent to ${targetChannel}.\n` +
      `> Test preview using: \`.welcome test\``
    ), true;
  }

  // Welcome message handler (.welcome message <text> OR direct .welcome <text>)
  if (sub === 'message' || sub === 'desc' || sub === 'text') {
    rawBody = rawBody.replace(/^(message|desc|text)\s*/i, '').trim();
  }

  // Check if user specified target channel on the LAST line (e.g. '.welcome #welcome' or '<#id>')
  const lines = rawBody.split('\n');
  const lastLine = lines[lines.length - 1].trim();
  const lastLineMatch = lastLine.match(/^\.?welcome\s+<#(\d+)>$/i) ||
                        lastLine.match(/^<#(\d+)>$/) ||
                        lastLine.match(/^\.?welcome\s+#([a-zA-Z0-9_\-]+)$/i);

  if (lastLineMatch) {
    let targetCh = null;
    if (lastLineMatch[1]) {
      targetCh = msg.guild.channels.cache.get(lastLineMatch[1]) ||
                 msg.guild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase() === lastLineMatch[1].toLowerCase());
    }
    if (targetCh) {
      cfg.greet.channelId = targetCh.id;
      cfg.greet.enabled = true;
      // Remove ONLY the last line containing the welcome channel command
      lines.pop();
      rawBody = lines.join('\n').trim();
    }
  }

  if (rawBody.trim()) {
    cfg.greet.message = rawBody.trim();
    cfg.greet.enabled = true;
    if (!cfg.greet.channelId) {
      cfg.greet.channelId = msg.channel.id;
    }
    saveGuild(msg.guild.id, cfg);

    const targetCh = msg.guild.channels.cache.get(cfg.greet.channelId) || msg.channel;
    return msg.reply(
      `<a:vgtick:1559740802324893798> **Welcome Message Saved!**\n` +
      `> **Welcome Channel:** ${targetCh} (Welcome messages will be sent here)\n` +
      `> **Interactive Links:** Channel mentions like \`#rules\` remain clickable!\n` +
      `> To preview the live welcome card: \`.welcome test\``
    ), true;
  }

  return msg.reply(
    '<a:vgwarn:1559740808146591774> **Usage:**\n' +
    '• `.welcome here` — Set current channel as welcome channel\n' +
    '• `.welcome #channel` — Set target welcome channel\n' +
    '• `.welcome <message with #rules etc.>` — Save welcome message\n' +
    '• `.welcome test` — Test live preview'
  ), true;
}

// Sends the welcome card to target channel
async function sendWelcome(guild, member, client, customChannelId = null) {
  try {
    const { getGuild } = require('../store');
    const cfg = getGuild(guild.id);
    if (!cfg.greet) return;
    const targetId = customChannelId || cfg.greet.channelId;
    if (!targetId) return;

    const ch = guild.channels.cache.get(targetId) || await guild.channels.fetch(targetId).catch(() => null);
    if (!ch) return;

    const format = (str) => String(str || '')
      .replace(/\{user\}/g, `<@${member.id}>`)
      .replace(/\{username\}/g, member.user.username)
      .replace(/\{membername\}/g, member.user.username)
      .replace(/\{server\}/g, guild.name)
      .replace(/\{count\}/g, String(guild.memberCount));

    const pingRaw = cfg.greet.pingText !== undefined
      ? cfg.greet.pingText
      : 'Welcome {user} to **{server}**!';

    const descRaw = cfg.greet.message ||
      "Hello and welcome! We're excited to have you here.\n\n" +
      "This is one of the most trusted panel communities. " +
      "Whether you're looking for top panels, cheats, and exclusive tools, you've come to the right place.";

    const titleRaw = cfg.greet.title || guild.name;

    // Color: default dark sleek 0x2b2d31 or custom
    let embedColor = 0x2b2d31;
    if (cfg.greet.color) {
      try { embedColor = parseInt(cfg.greet.color.replace('#', ''), 16); } catch {}
    }

    const em = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({
        name: format(titleRaw),
        iconURL: guild.iconURL({ dynamic: true }) || member.user.displayAvatarURL({ dynamic: true })
      })
      .setDescription(format(descRaw));

    // Big full-width banner image / animated GIF (Screenshot-2 style)
    if (cfg.greet.banner) {
      em.setImage(cfg.greet.banner);
    }

    const content = pingRaw ? format(pingRaw) : null;
    await ch.send({
      content,
      embeds: [em]
    }).catch(() => {});
  } catch (err) {
    console.log('Error sending welcome message:', err.message);
  }
}

module.exports = { run, sendWelcome };
