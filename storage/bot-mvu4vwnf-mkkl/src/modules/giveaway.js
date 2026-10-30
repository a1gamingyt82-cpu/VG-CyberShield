// Giveaway: .gstart / .gend / .gdelete / .glist / .greroll
const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('./helpers');

const active = new Map(); // messageId -> {prize, winners, endsAt, channelId, guildId, timeout}

function parseDur(s) {
  const m = String(s || '').match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;
  return +m[1] * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]]);
}

async function endGiveaway(client, messageId, reroll = false) {
  const g = active.get(messageId);
  if (!g) return null;
  try {
    const ch = await client.channels.fetch(g.channelId).catch(() => null);
    if (!ch) return null;
    const m = await ch.messages.fetch(messageId).catch(() => null);
    if (!m) return null;
    const users = (await m.reactions.resolve('🎉')?.users.fetch().catch(() => null));
    const entrants = users ? [...users.values()].filter(u => !u.bot) : [];
    const wins = [];
    while (wins.length < g.winners && entrants.length) {
      wins.push(entrants.splice(Math.floor(Math.random() * entrants.length), 1)[0]);
    }
    await m.reply(wins.length ? `🎉 **GIVEAWAY ${reroll ? 'REROLL' : 'END'}** — ${g.prize}\nWinner: ${wins.map(u => `<@${u.id}>`).join(' ')}` : `🎉 Giveaway ended — no entries.`).catch(() => {});
    if (!reroll) active.delete(messageId);
    return wins;
  } catch { return null; }
}

async function run(msg, args, client) {
  const [cmd, ...rest] = args;
  if (!['gstart', 'gend', 'gdelete', 'glist', 'greroll'].includes(cmd)) return null;
  if (!isAdmin(msg.member, msg.guild) && !msg.member.permissions.has('ManageMessages')) return msg.reply('❌ No permission.'), true;

  if (cmd === 'glist') {
    const mine = [...active.values()].filter(g => g.guildId === msg.guild.id);
    return msg.reply(mine.length ? mine.map(g => `🎁 ${g.prize} — <#${g.channelId}> (<t:${Math.floor(g.endsAt / 1000)}:R>)`).join('\n') : 'No active giveaways.'), true;
  }
  if (cmd === 'gstart') {
    // .gstart <10m> <1w> <prize...>
    const [durS, winS, ...prizeA] = rest;
    const dur = parseDur(durS);
    const winners = parseInt((winS || '1').replace('w', ''));
    if (!dur || !winners || !prizeA.length) return msg.reply('`.gstart <10m/1h/1d> <winners: 1w> <prize>`\nExample: `.gstart 1h 1w Nitro`'), true;
    const prize = prizeA.join(' ');
    const em = new EmbedBuilder().setTitle(`🎁 ${prize}`).setColor(0xff55ff)
      .setDescription(`React 🎉 to enter!\nWinners: **${winners}**\nEnds: <t:${Math.floor((Date.now() + dur) / 1000)}:R>\nHost: <@${msg.author.id}>`);
    const m = await msg.channel.send({ embeds: [em] });
    await m.react('🎉').catch(() => {});
    const g = { prize, winners, endsAt: Date.now() + dur, channelId: msg.channel.id, guildId: msg.guild.id };
    g.timeout = setTimeout(() => endGiveaway(client, m.id), dur);
    active.set(m.id, g);
    return undefined, true;
  }
  if (cmd === 'gend' || cmd === 'greroll' || cmd === 'gdelete') {
    const id = rest[0]?.match(/\d{15,25}/)?.[0] || msg.reference?.messageId;
    const targetId = id || [...active.keys()].reverse().find(k => active.get(k).guildId === msg.guild.id);
    if (!targetId) return msg.reply('Give giveaway ID or reply to its message.'), true;
    if (cmd === 'gdelete') {
      const g = active.get(targetId);
      clearTimeout(g?.timeout);
      active.delete(targetId);
      try { const ch = await msg.client.channels.fetch(g.channelId); (await ch.messages.fetch(targetId)).delete().catch(() => {}); } catch {}
      return msg.reply('✅ Giveaway deleted'), true;
    }
    await endGiveaway(client, targetId, cmd === 'greroll');
    return msg.reply('✅ Done'), true;
  }
}
module.exports = { run, endGiveaway };
