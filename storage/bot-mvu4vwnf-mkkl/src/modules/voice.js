// Voice (.j2c/.vcrole) + Voicemaster (.voice/.vcmod/.vcl/.vcu/.vch/.vcp/.vcpa/.vcma/.vcmute/.vcdeafen/.vclimit/.vcname)
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');

async function run(msg, args) {
  const [cmd, ...rest] = args;
  const cfg = getGuild(msg.guild.id);

  // ---- .j2c setup ----
  if (cmd === 'j2c') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
    // .j2c #voice-channel (#category optional)
    const vc = msg.mentions.channels.first() || msg.member.voice.channel;
    if (!vc) return msg.reply('`.j2c` — join a voice channel first or mention a #voice channel (Join-to-Create setup).'), true;
    cfg.j2c = { voiceChannelId: vc.id, categoryId: vc.parentId || null };
    saveGuild(msg.guild.id, cfg);
    try { await vc.setName('➕ Join to Create').catch(() => {}); } catch {}
    return msg.reply(`✅ J2C setup: joining ${vc} will create your own temp VC.`), true;
  }
  if (cmd === 'vcrole') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
    // .vcrole #voice <@role>  |  .vcrole list
    if (rest[0] === 'list' || (!msg.mentions.channels.first() && !msg.mentions.roles.first()))
      return msg.reply(cfg.vcrole.length ? cfg.vcrole.map(x => `<#${x.voiceChannelId}> → <@&${x.roleId}>`).join('\n') : '`.vcrole #voice <@role>` — auto-role on joining that VC.'), true;
    const vc = msg.mentions.channels.first();
    const role = msg.mentions.roles.first();
    if (!vc || !role) return msg.reply('`.vcrole #voice <@role>`'), true;
    cfg.vcrole = cfg.vcrole.filter(x => x.voiceChannelId !== vc.id);
    cfg.vcrole.push({ voiceChannelId: vc.id, roleId: role.id });
    saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ ${vc} join → ${role}`), true;
  }

  // ---- Voicemaster panel ----
  if (cmd === 'voice') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('❌ Admins only.'), true;
    const cat = msg.channel.parentId;
    const setup = await msg.guild.channels.create({ name: '🎙️ voice-setup', type: ChannelType.GuildText, parent: cat || undefined }).catch(() => msg.channel);
    const join = await msg.guild.channels.create({ name: '➕ Create VC', type: ChannelType.GuildVoice, parent: cat || undefined }).catch(() => null);
    cfg.voicemaster = { setupChannelId: setup.id, categoryId: cat || null, tempChannels: {} };
    if (join) cfg.j2c = { voiceChannelId: join.id, categoryId: cat || null };
    saveGuild(msg.guild.id, cfg);
    const em = new EmbedBuilder().setTitle('🎙️ Voicemaster').setColor(0x00ccff)
      .setDescription('Create and control your VC:\n`.vcmod @user` `.vcl` lock `.vcu` unlock `.vch` hide `.vcp` unhide\n`.vcpa @user` allow `.vcma @user` deny `.vcmute @user` `.vcdeafen`\n`.vclimit 5` `.vcname My Room`');
    await setup.send({ embeds: [em] }).catch(() => {});
    return msg.reply(`✅ Voicemaster setup: ${setup} ${join || ''}`), true;
  }

  const ownTemp = () => {
    const t = cfg.voicemaster?.tempChannels || {};
    const vc = msg.member.voice.channel;
    if (!vc || t[vc.id] !== msg.author.id) return null;
    return vc;
  };

  if (cmd === 'vcmod') {
    const vc = ownTemp();
    if (!vc) return msg.reply('❌ Join your temp VC first.'), true;
    const u = msg.mentions.users.first();
    if (!u) return msg.reply('`.vcmod <@user>` — give them control of your VC.'), true;
    cfg.voicemaster.tempChannels[vc.id] = u.id;
    saveGuild(msg.guild.id, cfg);
    return msg.reply(`✅ <@${u.id}> is now VC owner.`), true;
  }
  if (['vcl', 'vcu', 'vch', 'vcuh', 'vcp', 'vcd', 'vcm', 'vcmute', 'vcunmute', 'vcdeafen', 'vcundeafen', 'vclimit', 'vcname'].includes(cmd)) {
    const vc = ownTemp() || (isAdmin(msg.member, msg.guild) && msg.member.voice.channel);
    if (!vc) return msg.reply('❌ Join your temp VC (create one via Join-to-Create after `.voice` setup).'), true;
    const u = msg.mentions.members.first();
    try {
      if (cmd === 'vcl') await vc.permissionOverwrites.edit(msg.guild.roles.everyone, { Connect: false });
      if (cmd === 'vcu') await vc.permissionOverwrites.edit(msg.guild.roles.everyone, { Connect: null });
      if (cmd === 'vch') await vc.permissionOverwrites.edit(msg.guild.roles.everyone, { ViewChannel: false });
      if (cmd === 'vcuh' || cmd === 'vcp') await vc.permissionOverwrites.edit(msg.guild.roles.everyone, { ViewChannel: null });
      if (cmd === 'vcpa') { if (!u) return msg.reply('`.vcpa <@user>`'), true; await vc.permissionOverwrites.edit(u, { Connect: true, ViewChannel: true }); }
      if (cmd === 'vcma' || cmd === 'vcd') { if (!u) return msg.reply('`.vcma <@user>`'), true; await vc.permissionOverwrites.edit(u, { Connect: false }); }
      if (cmd === 'vcm' || cmd === 'vcmute') { if (!u) return msg.reply('`.vcmute <@user>`'), true; await u.voice.setMute(true).catch(() => {}); }
      if (cmd === 'vcunmute') { if (!u) return msg.reply('`.vcunmute <@user>`'), true; await u.voice.setMute(false).catch(() => {}); }
      if (cmd === 'vcdeafen') { if (!u) { await msg.member.voice.setDeaf(true).catch(() => {}); } else await u.voice.setDeaf(true).catch(() => {}); }
      if (cmd === 'vcundeafen') { if (!u) { await msg.member.voice.setDeaf(false).catch(() => {}); } else await u.voice.setDeaf(false).catch(() => {}); }
      if (cmd === 'vclimit') { const n = Math.min(99, Math.max(0, +rest[0] || 0)); await vc.setUserLimit(n).catch(() => {}); }
      if (cmd === 'vcname') { const n = rest.join(' ').slice(0, 30); if (n) await vc.setName(n).catch(() => {}); }
      return msg.reply('✅ Done'), true;
    } catch { return msg.reply('❌ Failed'), true; }
  }
  return null;
}

// J2C: temp VC + vcrole on join
async function voiceState(oldS, newS) {
  try {
    const guild = newS.guild || oldS.guild;
    const { getGuild, saveGuild } = require('../store');
    const cfg = getGuild(guild.id);
    // remove vcrole (old channel)
    if (oldS.channelId && cfg.vcrole?.length) {
      const map = cfg.vcrole.find(x => x.voiceChannelId === oldS.channelId);
      if (map && oldS.member) await oldS.member.roles.remove(map.roleId).catch(() => {});
    }
    if (!newS.channelId || !newS.member) {
      // delete temp VC if empty
      const t = cfg.voicemaster?.tempChannels || {};
      if (oldS.channelId && t[oldS.channelId]) {
        const ch = guild.channels.cache.get(oldS.channelId);
        if (ch && ch.members.size === 0) {
          await ch.delete().catch(() => {});
          delete cfg.voicemaster.tempChannels[oldS.channelId];
          saveGuild(guild.id, cfg);
        }
      }
      return;
    }
    // vcrole add
    const map = cfg.vcrole?.find(x => x.voiceChannelId === newS.channelId);
    if (map) await newS.member.roles.add(map.roleId).catch(() => {});
    // J2C
    if (cfg.j2c && newS.channelId === cfg.j2c.voiceChannelId) {
      const temp = await guild.channels.create({
        name: `🎙️ ${newS.member.displayName}`,
        type: ChannelType.GuildVoice,
        parent: cfg.j2c.categoryId || newS.channel?.parentId || undefined,
        permissionOverwrites: [
          { id: newS.member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.Connect] },
        ],
      }).catch(() => null);
      if (temp) {
        await newS.member.voice.setChannel(temp).catch(() => {});
        if (cfg.voicemaster) {
          cfg.voicemaster.tempChannels = cfg.voicemaster.tempChannels || {};
          cfg.voicemaster.tempChannels[temp.id] = newS.member.id;
          saveGuild(guild.id, cfg);
        }
      }
    }
  } catch {}
}

module.exports = { run, voiceState };
