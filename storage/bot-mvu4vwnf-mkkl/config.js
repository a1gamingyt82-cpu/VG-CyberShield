// Central config - separate settings per server (data/guilds.json)
module.exports = {
  defaults: {
    prefix: '.',
    enabled: true, // antinuke master
    strictModeEvenForOwner: true,
    limits: {
      BAN: { count: 1, perSec: 10 },
      KICK: { count: 2, perSec: 10 },
      CHANNEL_CREATE: { count: 3, perSec: 15 },
      CHANNEL_DELETE: { count: 2, perSec: 15 },
      ROLE_CREATE: { count: 3, perSec: 15 },
      ROLE_DELETE: { count: 2, perSec: 15 },
      WEBHOOK: { count: 2, perSec: 15 },
      BOT_ADD: { count: 1, perSec: 60 },
      UNBAN: { count: 2, perSec: 15 },
      GUILD_UPDATE: { count: 2, perSec: 20 },
      MEMBER_ROLE_UPDATE: { count: 4, perSec: 15 },
      EMOJI_DELETE: { count: 3, perSec: 20 },
      PRUNE: { count: 1, perSec: 60 },
      // extra: also catch slow nukes
      EMOJI_CREATE: { count: 4, perSec: 30 },
      INVITE_CREATE: { count: 4, perSec: 30 },
      THREAD: { count: 4, perSec: 30 },
      ROLE_UPDATE: { count: 4, perSec: 20 },
      INTEGRATION: { count: 2, perSec: 60 },
      TIMEOUT_SPAM: { count: 4, perSec: 30 },
      AUTOMOD_RULE: { count: 2, perSec: 30 },
      EVENT_CREATE: { count: 3, perSec: 60 },
    },
    // DAY CAPS = the slow-nuke cure. Applies to admins/whitelist too (in strict mode)
    // Nobody can ban/kick more than this per 24h - crossing = instant punish.
    // (Any id/extraowner - only the BOT owner is exempt. Applies in non-strict too.)
    // wlBan/wlKick = WHITELIST walo ke liye AUR SAKHT cap (ID grab hone pe bhi max 4-5 ban, uske baad wo khud ban).
    dayCaps: { ban: 10, kick: 10, wlBan: 5, wlKick: 5, windowH: 24 },
    autoFreeze: true, // on mass-nuke: pause top roles + lock (only the real owner unlocks)
    protectBotRole: true, // revert + punish anyone weakening my role
    lockdownOnOwnerCompromise: true, // owner account nuking (can't ban owner): lock full server + alert
    punish: 'ban',
    // ZERO-TOLERANCE: whitelist/extraowner me NAHI hai to pehli dangerous harkat (ban/kick/channel/role...) pe hi instant punish.
    // true = 1st hit punish (koi free chance nahi) | false = purana rate-limit (2/10s) + day-cap
    zeroTolerance: true,
    onlyOwnerCanBan: true, // ZERO-TRUST: Only the Main Server Owner (and bot owner) can ban. Admins cannot ban!
    quarantineRoleName: '⚠️ QUARANTINED',
    antiLink: true,
    antiEveryone: true,
    antiWebhookSpam: true,
    linkTimeoutMin: 10,
    everyoneTimeoutMin: 10,
    linkAllowList: ['discord.gg/', 'discord.com/invite/', 'youtube.com', 'youtu.be'],
    autoRevert: true,
    autoBackupHours: 6,
    logChannelId: null,
    logs: {
      antinuke: null,
      mod: null,
      member: null,
      message: null,
    },
    roles: {
      quarantine: null,
      unbypassable: null,
      unbypass: null,
      event: null,
      allMembers: null,
    },
    eventRoleId: null,
    tickEmoji: null, // animated tick override: .antinuke tick <emoji>
    crossEmoji: null, // animated cross override: .antinuke cross <emoji>
    dotEmoji: null, // animated bullet override
    // ---- module icons (custom server emojis) ----
    // PNGs: assets/module-icons/*.png (red, screenshot-style)
    // Upload: node scripts/upload-module-emojis.js  -> jo IDs mile, yaha paste karo.
    // Format: '<:vg_antinuke:123456789012345678>'
    moduleEmojis: {
      // antinuke: '', automod: '', automation: '', autoresponder: '',
      // access: '', customrole: '', games: '', giveaway: '',
      // info: '', moderation: '', music: '', premium: '',
      // ticket: '', util: '', voice: '', voicemaster: '', welcome: '',
    },
    // ---- modules ----
    whitelist: [],
    extraOwners: [],
    automod: { ghostping: true, caps: true, spam: true, links: true, invites: true, maxMentions: 4, maxLines: 8, maxCapsPct: 70, automodWhitelist: [], bypass: {} },
    autorole: { humans: [], bots: [], all: [] },
    autoreact: [], // [{channelId, emoji}]
    autoresponder: [], // [{trigger, response, match: 'exact'|'contains'}]
    serverlog: null,
    logdelete: true,
    j2c: null, // {voiceChannelId, categoryId}
    vcrole: [], // [{voiceChannelId, roleId}]
    voicemaster: null, // {setupChannelId, categoryId, tempChannels: {channelId: ownerId}}
    greet: null, // {channelId, message}
    ticket: { image: null }, // custom ticket-panel image URL (.ticket image) — khali = default VG banner
    afk: {}, // {userId: {reason, since}}
    nightmode: null, // {roleId}
    antialt: { enabled: false, minDays: 7 },
    musicvc: null,
    musicrole: null,
    upi: { vpa: '', name: 'VG CHEATS' },
    customrole: null, // {setupChannelId}
    snipeCache: {},
  },
};
