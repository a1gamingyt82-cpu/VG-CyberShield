// Shared helpers for prefix commands
const { PermissionFlagsBits } = require('discord.js');
const { getGuild } = require('../store');
const { isBotOwner } = require('../antinuke');

function isAdmin(member, guild) {
  if (!member || !guild) return false;
  const cfg = getGuild(guild.id);
  return member.permissions.has(PermissionFlagsBits.Administrator)
    || guild.ownerId === member.id
    || isBotOwner(member.id)
    || cfg.extraOwners?.includes(member.id);
}
function isMod(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ModerateMembers)
    || member.permissions.has(PermissionFlagsBits.ManageMessages)
    || isAdmin(member, member.guild);
}
async function needBotPerm(guild, perm, msg) {
  const me = guild.members.me;
  if (!me?.permissions.has(perm)) {
    await msg.reply(`<a:vgcross:1559740805206515743> Missing permission: \`${perm}\`. Please move my role to the top and grant Administrator.`).catch(() => {});
    return false;
  }
  return true;
}
function parseUser(msg, arg) {
  if (!arg) return msg.mentions.users.first() || null;
  const id = arg.replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || null;
}
async function parseMember(guild, arg) {
  if (!arg) return null;
  const id = arg.replace(/[<@!>]/g, '');
  return guild.members.fetch(id).catch(() => null);
}
// Tick/cross/dot: animated defaults (uploaded to the bot server) - per-server override via .antinuke tick/cross
const DEFAULT_TICK = '<a:vgtick:1559740802324893798>';
const DEFAULT_CROSS = '<a:vgcross:1559740805206515743>';
const DEFAULT_DOT = '<a:joya:1551156450825474048>'; // animated red pointer arrow
const DEFAULT_WARN = '<a:vgwarn:1559740808146591774>';
const DEFAULT_CROWN = '<a:joya:1551154653201440828>';
const DEFAULT_ARROW = '<a:joya:1551156450825474048>';
const DEFAULT_STAR = '<a:joya:1551393231642829001>';

const ANIM_ICONS = {
  crown: DEFAULT_CROWN,
  star: DEFAULT_STAR,
  arrow: DEFAULT_ARROW,
  dot: DEFAULT_DOT,
  tick: DEFAULT_TICK,
  cross: DEFAULT_CROSS,
  warn: DEFAULT_WARN,
};

function tick(cfg) { return (cfg && cfg.tickEmoji) || DEFAULT_TICK; }
function cross(cfg) { return (cfg && cfg.crossEmoji) || DEFAULT_CROSS; }
function dot(cfg) { return (cfg && cfg.dotEmoji) || DEFAULT_DOT; }
function warn(cfg) { return DEFAULT_WARN; }
function crown() { return DEFAULT_CROWN; }
function arrow() { return DEFAULT_ARROW; }
function star() { return DEFAULT_STAR; }

// Auto-use animated emojis named "tick"/"cross" if the server has them
async function autoAnimEmojis(guild, cfg, save) {
  try {
    let changed = false;
    const emojis = guild.emojis.cache.size ? guild.emojis.cache : await guild.emojis.fetch().catch(() => null);
    if (!emojis) return false;
    const anim = [...emojis.values()].filter(e => e.animated);
    if (!cfg.tickEmoji) {
      const f = anim.find(e => /tick|check|verify|done|yes|verified/i.test(e.name));
      if (f) { cfg.tickEmoji = `<a:${f.name}:${f.id}>`; changed = true; }
    }
    if (!cfg.crossEmoji) {
      const f = anim.find(e => /cross|no|wrong|cancel|deny/i.test(e.name));
      if (f) { cfg.crossEmoji = `<a:${f.name}:${f.id}>`; changed = true; }
    }
    if (changed && save) save();
    return changed;
  } catch { return false; }
}

function getWelcomeCard(client) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const me = client.user;
  const supportURL = process.env.SUPPORT_URL || 'https://discord.gg/vgcheats';
  const inviteURL = `https://discord.com/oauth2/authorize?client_id=${me.id}&permissions=8&scope=bot%20applications.commands`;

  const em = new EmbedBuilder()
    .setColor(0xff2222)
    .setThumbnail(me.displayAvatarURL({ size: 512, extension: 'png' }))
    .setDescription(
      `## <a:joya:1551154653201440828> Thanks for adding VG CyberShield!\n\n` +
      `> <a:joya:1551156450825474048> Ready to secure your server? Use \`.setup\` to get started!\n` +
      `> <a:joya:1551156450825474048> Unlock everything with \`.help\` and see what I'm capable of\n` +
      `> <a:joya:1551156450825474048> Join the elite at our **[Support Server](${supportURL})** for exclusive updates & VIP support\n\n` +
      `*Powered By VG Cheats™*`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Support ↗').setStyle(ButtonStyle.Link).setURL(supportURL),
    new ButtonBuilder().setLabel('Invite ↗').setStyle(ButtonStyle.Link).setURL(inviteURL),
  );

  return { embeds: [em], components: [row] };
}

function toMathBold(text) {
  if (!text) return '';
  const boldCaps = 0x1D400; // '𝐀'
  const boldSmall = 0x1D41A; // '𝐚'
  const boldDigits = 0x1D7CE; // '𝟎'
  return String(text).replace(/[A-Za-z0-9]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(boldCaps + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(boldSmall + (code - 97));
    if (code >= 48 && code <= 57) return String.fromCodePoint(boldDigits + (code - 48));
    return ch;
  });
}

module.exports = { isAdmin, isMod, needBotPerm, parseUser, parseMember, tick, cross, dot, warn, arrow, crown, star, autoAnimEmojis, getWelcomeCard, toMathBold, ANIM_ICONS };
