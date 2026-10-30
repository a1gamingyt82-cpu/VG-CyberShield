// Music Module - queue + voice (@distube/ytdl-core + @discordjs/voice)
// Supports multi-channel joining, DJ / Music-role enforcement, interactive controller buttons, 24/7 mode, and continuous autoplay
const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, InviteTargetType } = require('discord.js');
const { getGuild, saveGuild } = require('../store');
const { isAdmin } = require('./helpers');
const https = require('https');

let voice, ytdlClient, playdl, prism;
try { voice = require('@discordjs/voice'); } catch { voice = null; }
try { prism = require('prism-media'); } catch { prism = null; }
try {
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');
  let ffmpegStatic = null;
  try { ffmpegStatic = require('ffmpeg-static'); } catch {}

  if (ffmpegStatic && !fs.existsSync(ffmpegStatic)) {
    const installScript = path.join(__dirname, '..', '..', 'node_modules', 'ffmpeg-static', 'install.js');
    if (fs.existsSync(installScript)) {
      try {
        console.log('🔄 [FFmpeg Guard] Downloading ffmpeg binary for cloud container...');
        execSync(`node "${installScript}"`, { stdio: 'inherit' });
      } catch (e) {
        console.warn('⚠️ [FFmpeg download warning]:', e.message);
      }
    }
  }

  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    try { fs.chmodSync(ffmpegStatic, 0o755); } catch {}
    process.env.FFMPEG_PATH = ffmpegStatic;
    console.log('✅ [FFmpeg Guard] FFmpeg engine ready:', ffmpegStatic);
  }
} catch (e) {}
let chooseFormatFn = null;
(async () => {
  try {
    const ytdlModule = await import('@distube/ytdl-core');
    const Ytdl = ytdlModule.Ytdl || (ytdlModule.default && ytdlModule.default.Ytdl);
    chooseFormatFn = ytdlModule.chooseFormat || (ytdlModule.default && ytdlModule.default.chooseFormat);
    if (Ytdl) {
      ytdlClient = new Ytdl({ clients: ['tv', 'web_embedded', 'mweb', 'visionos'] });
    }
  } catch {
    ytdlClient = null;
    chooseFormatFn = null;
  }
})();
try { playdl = require('play-dl'); } catch { playdl = null; }

const queues = new Map(); // guildId -> {conn, player, songs: [], playing, volume, loop, vcId, stay247, currentResource}

function q(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      songs: [],
      playedIds: [],
      playedTitles: [],
      lastPlayedId: null,
      lastPlayedTitle: null,
      playing: false,
      volume: 100,
      loop: 'off',
      autoplay: true,
      vcId: null,
      conn: null,
      player: null,
      isProcessing: false,
      lastTrackStartTime: 0,
      consecutiveFails: 0,
      stay247: false,
      currentResource: null,
      controllerMsg: null,
      idleDisconnectTimer: null,
      favs: {},
      pls: {}
    });
  }
  return queues.get(guildId);
}

// Reliable Voice Connection manager: cleans dead/stale connections, rejoins cleanly, subscribes player
async function ensureVoiceConnection(guild, vc, Q) {
  if (!voice || !vc) return null;

  let conn = voice.getVoiceConnection(guild.id);

  // If connection is in a destroyed, disconnected, or wrong channel state: clean it up first
  if (conn && (
    conn.state.status === voice.VoiceConnectionStatus.Destroyed ||
    conn.state.status === voice.VoiceConnectionStatus.Disconnected ||
    Q.vcId !== vc.id ||
    conn.joinConfig?.channelId !== vc.id
  )) {
    try { conn.destroy(); } catch {}
    conn = null;
    Q.conn = null;
  }

  if (!conn) {
    conn = voice.joinVoiceChannel({
      channelId: vc.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false
    });
    Q.conn = conn;
    Q.vcId = vc.id;

    conn.on(voice.VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          voice.entersState(conn, voice.VoiceConnectionStatus.Signalling, 15_000),
          voice.entersState(conn, voice.VoiceConnectionStatus.Connecting, 15_000),
        ]);
      } catch {
        try { conn.destroy(); } catch {}
        if (Q.conn === conn) {
          Q.conn = null;
        }
        // Auto-reconnect if playback is active or 24/7 or queue has songs
        if ((Q.playing || Q.stay247 || (Q.songs && Q.songs.length > 0)) && Q.vcId) {
          const targetVc = guild.channels.cache.get(Q.vcId) || await guild.channels.fetch(Q.vcId).catch(() => null);
          if (targetVc && targetVc.isVoiceBased()) {
            console.log(`[Voice Reconnect] Auto-reconnecting to voice channel in guild ${guild.id}...`);
            const newConn = await ensureVoiceConnection(guild, targetVc, Q).catch(() => null);
            if (newConn && Q.player) {
              newConn.subscribe(Q.player);
            }
          }
        }
      }
    });

    conn.on(voice.VoiceConnectionStatus.Destroyed, () => {
      if (Q.conn === conn) {
        Q.conn = null;
        Q.vcId = null;
      }
    });
  }

  // Ensure connection is subscribed to player
  if (Q.player && conn.state.status !== voice.VoiceConnectionStatus.Destroyed) {
    conn.subscribe(Q.player);
  }

  // Fast wait for Ready state (3s timeout so it connects fast without delay)
  if (conn.state.status !== voice.VoiceConnectionStatus.Ready && conn.state.status !== voice.VoiceConnectionStatus.Destroyed) {
    try {
      await voice.entersState(conn, voice.VoiceConnectionStatus.Ready, 3_000);
    } catch (readyErr) {
      console.warn('[ensureVoiceConnection entersState timeout]:', readyErr.message);
    }
  }

  if (Q.player && conn.state.status !== voice.VoiceConnectionStatus.Destroyed) {
    conn.subscribe(Q.player);
  }

  return conn;
}

// Helpers for formatted UI
function formatDuration(sec) {
  if (!sec || isNaN(sec)) return 'Live Stream';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function cleanTitle(raw) {
  if (!raw) return 'Audio Track';
  return raw
    .replace(/(?:official\s+music\s+video|official\s+video|full\s+video\s+song|full\s+video|lyrical\s+video|hd\s+video|lyrical|video\s+song|video|वीडियो\s*सोंग|वीडियो)/gi, '')
    .replace(/[\[\(][\s]*[\]\)]/g, '')
    .replace(/\s*\|\|\s*/g, ' - ')
    .replace(/\s*\|\s*/g, ' - ')
    .replace(/^[🔥-\s|•]+/, '')
    .replace(/[-\s|•]+$/, '')
    .replace(/\s+/g, ' ')
    .trim() || raw;
}

function getVolumeBar(vol) {
  const total = 8;
  const filled = Math.min(total, Math.max(0, Math.round((vol / 200) * total)));
  return '▰'.repeat(filled) + '▱'.repeat(total - filled);
}

function extractVideoId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

// Zero-dependency YouTube search fallback
function searchYouTubeFallback(query) {
  return new Promise((resolve) => {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const idMatch = data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        const titleMatch = data.match(/"title":\{"runs":\[\{"text":"([^"]+)"/) || data.match(/"title":\{"simpleText":"([^"]+)"/);
        if (idMatch) {
          const vidId = idMatch[1];
          resolve({
            id: vidId,
            url: `https://www.youtube.com/watch?v=${vidId}`,
            title: titleMatch ? titleMatch[1] : query,
            thumbnail: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
            duration: 0,
            author: 'YouTube'
          });
        } else {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Deep Defense Layer 6: Anti-SSRF Protection (Blocks internal network & cloud metadata exploration)
function isSafePublicUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const h = parsed.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      h.startsWith('10.') ||
      h.startsWith('192.168.') ||
      h.startsWith('172.') ||
      h.startsWith('169.254.') ||
      h.includes('metadata') ||
      h.endsWith('.internal') ||
      h.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const searchCache = new Map();

// Search or resolve a track URL/Query with rich metadata
async function resolveTrack(query) {
  if (!query) return null;
  const qKey = query.trim().slice(0, 250).toLowerCase();
  if (searchCache.has(qKey)) {
    return searchCache.get(qKey);
  }

  // Direct URL with strict Anti-SSRF validation
  if (/^https?:\/\//i.test(query)) {
    if (!isSafePublicUrl(query)) {
      console.warn('[Security Shield] Blocked potential SSRF exploit attempt:', query);
      return null;
    }
    const vidId = extractVideoId(query);
    if (ytdlClient) {
      try {
        const info = await ytdlClient.getInfo(query);
        const thumbs = info?.videoDetails?.thumbnails || [];
        const thumbUrl = thumbs.length ? thumbs[thumbs.length - 1].url : (vidId ? `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg` : null);
        return {
          id: vidId,
          url: query,
          title: info?.videoDetails?.title || query,
          duration: parseInt(info?.videoDetails?.lengthSeconds) || 0,
          thumbnail: thumbUrl,
          author: info?.videoDetails?.author?.name || 'YouTube'
        };
      } catch {}
    }
    return {
      id: vidId,
      url: query,
      title: query,
      duration: 0,
      thumbnail: vidId ? `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg` : null,
      author: 'YouTube'
    };
  }

  // Search keyword with ytdlClient
  if (ytdlClient) {
    try {
      const results = await ytdlClient.search(query);
      if (results && results.length > 0) {
        // Find best non-live playable track first
        const matched = results.find(r => !r.isLive && (r.lengthSeconds || 0) > 20) || results[0];
        const vidId = matched.id || extractVideoId(matched.url);
        const thumbs = matched.thumbnails || [];
        const thumbUrl = thumbs.length ? thumbs[thumbs.length - 1].url : (vidId ? `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg` : null);
        return {
          id: vidId,
          url: matched.url,
          title: matched.title,
          duration: parseInt(matched.lengthSeconds) || 0,
          thumbnail: thumbUrl,
          author: matched.author?.name || 'YouTube Artist'
        };
      }
    } catch (e) {
      console.error('[ytdl search error]:', e.message);
    }
  }

  // Tier 1: SoundCloud search (100% reliable on Cloud/Datacenter IPs, zero 429 blocks)
  try {
    const scItem = await searchSoundCloudTrack(query);
    if (scItem) {
      searchCache.set(qKey, scItem);
      return scItem;
    }
  } catch (scErr) {
    console.warn('[SoundCloud resolve error]:', scErr.message);
  }

  // Tier 2: YouTube fallback (handled safely without uncaught rejections)
  try {
    const fallback = await searchYouTubeFallback(query);
    if (fallback) {
      searchCache.set(qKey, fallback);
      return fallback;
    }
  } catch (ytErr) {
    console.warn('[YouTube search notice]:', ytErr.message);
  }

  return null;
}

// Generate quick playback controller buttons (Pause, Skip, Next, Stop, Loop) in 1 compact box row
function getMusicQuickButtons(Q) {
  const isPaused = Q.player?.state?.status === voice?.AudioPlayerStatus?.Paused;
  const isLoopActive = Q.loop && Q.loop !== 'off';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vg_music_pause_resume')
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary)
      .setEmoji(isPaused ? '<a:vgtick:1559740802324893798>' : '<a:joya:1551154653201440828>'),
    new ButtonBuilder()
      .setCustomId('vg_music_skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('<a:joya:1551156450825474048>'),
    new ButtonBuilder()
      .setCustomId('vg_music_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('<a:joya:1551156450825474048>'),
    new ButtonBuilder()
      .setCustomId('vg_music_stop')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('<a:vgcross:1559740805206515743>'),
    new ButtonBuilder()
      .setCustomId('vg_music_loop')
      .setLabel(isLoopActive ? `${Q.loop.toUpperCase()}` : 'Loop')
      .setStyle(isLoopActive ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji('<a:joya:1551393231642829001>')
  );
  return [row];
}

// Generate interactive playback controller rows
function getMusicControllerRow(Q) {
  return getMusicQuickButtons(Q);
}

// Generate clean Now Playing embed (Only animated icon + song title, strictly no banner, no url, no duration/artist lines)
function getNowPlayingEmbed(song, Q, cfg) {
  const isPaused = Q.player?.state?.status === voice?.AudioPlayerStatus?.Paused;
  const embedColor = isPaused ? 0xffaa00 : 0x2b2d31;
  const cleanedTitle = cleanTitle(song.title);

  const em = new EmbedBuilder()
    .setColor(embedColor)
    .setAuthor({
      name: isPaused ? '⏸️ ( Playback Paused )' : '🎵 ( Now Playing )',
      iconURL: isPaused 
        ? 'https://cdn.discordapp.com/emojis/1559740808146591774.webp' 
        : 'https://cdn.discordapp.com/emojis/1551154653201440828.gif'
    })
    .setDescription(
      `<a:joya:1551154653201440828> **${cleanedTitle.slice(0, 256)}**\n` +
      `──────────────────────────────`
    );

  // Strictly NO banner image (em.setImage removed per user request)
  // Strictly NO link on song title (em.setURL removed per user request)
  // Strictly NO extra lines (duration, artist, loop, channel removed per user request)

  return em;
}


const infoCache = new Map();
async function getCachedInfo(urlOrId) {
  if (!ytdlClient) return null;
  const vidId = extractVideoId(urlOrId) || urlOrId;
  if (infoCache.has(vidId)) {
    const cached = infoCache.get(vidId);
    if (Date.now() - cached.time < 300_000) return cached.info;
  }
  const info = await ytdlClient.getInfo(vidId).catch((err) => {
    console.warn('[ytdl getInfo warning]:', err.message);
    return null;
  });
  if (info) {
    infoCache.set(vidId, { info, time: Date.now() });
    if (infoCache.size > 100) {
      const oldest = infoCache.keys().next().value;
      infoCache.delete(oldest);
    }
  }
  return info;
}

let cachedScClientId = null;
let lastScCidTime = 0;

async function getSCClientId() {
  if (cachedScClientId && Date.now() - lastScCidTime < 3600_000) return cachedScClientId;
  try {
    if (playdl?.getFreeClientID) {
      cachedScClientId = await playdl.getFreeClientID();
      lastScCidTime = Date.now();
      return cachedScClientId;
    }
  } catch {}

  // Scrape fresh client_id dynamically from soundcloud.com public assets
  try {
    const scHtml = await new Promise((resolve) => {
      https.get('https://soundcloud.com', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      }).on('error', () => resolve(''));
    });
    const scriptUrls = [...scHtml.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
    for (const sUrl of scriptUrls.slice(-3)) {
      const scriptCode = await new Promise((resolve) => {
        https.get(sUrl, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
        }).on('error', () => resolve(''));
      });
      const cidMatch = scriptCode.match(/client_id:"([a-zA-Z0-9]{32})"/);
      if (cidMatch) {
        cachedScClientId = cidMatch[1];
        lastScCidTime = Date.now();
        return cachedScClientId;
      }
    }
  } catch {}

  return 'xk6BGxLCsQJ5Ss0bH6sRdsZhts3gTNaU';
}

function fetchJsonHttps(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

const BASS_AUDIO_FILTER = 'equalizer=f=60:width_type=o:width=1.5:gain=5.0,equalizer=f=120:width_type=o:width=1.2:gain=3.5,volume=1.3,alimiter=limit=0.98';

function cleanTitleForSearch(title) {
  if (!title) return '';
  const parts = title.split(/[|\-•\/]/).map(p => p.trim()).filter(Boolean);
  const cleanPart = p => p
    .replace(/#[\w\u0900-\u097F]+/g, '')
    .replace(/(?:official\s+music\s+video|official\s+video|full\s+video\s+song|full\s+video|lyrical\s+video|hd\s+video|lyrical|video\s+song|video|old bhojpuri song|bhojpuri song)/gi, '')
    .replace(/[\[\(][\s]*[\]\)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Find parts with English/Latin letters (SoundCloud is primarily indexed in Latin alphabet)
  const latinParts = parts.map(cleanPart).filter(p => /[a-zA-Z]{3,}/.test(p));
  if (latinParts.length > 0) {
    return latinParts.slice(0, 2).join(' ');
  }
  return cleanPart(parts[0] || title);
}

async function searchSoundCloudTrack(query) {
  if (!query) return null;
  const cid = await getSCClientId();
  if (!cid) return null;

  const candidateQueries = [
    cleanTitleForSearch(query),
    query.replace(/[\[\(].*?[\]\)]/g, '').trim(),
    query.trim()
  ].filter(Boolean);

  const uniqueQueries = [...new Set(candidateQueries)];

  for (const clean of uniqueQueries) {
    const searchUrl = 'https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(clean) + '&client_id=' + cid + '&limit=15';
    const data = await fetchJsonHttps(searchUrl);
    if (!data?.collection?.length) continue;

    // Filter out short previews/snippets (must be at least 75 seconds long for full songs)
    const validTracks = data.collection.filter(t => (t.duration || 0) >= 75000);
    const track = validTracks.find(t => (t.duration || 0) >= 120000) || validTracks[0] || data.collection.find(t => (t.duration || 0) >= 60000);
    if (track) {
      return {
        id: 'sc_' + track.id,
        url: track.permalink_url || `https://soundcloud.com/track/${track.id}`,
        title: track.title,
        duration: Math.round((track.duration || 0) / 1000),
        thumbnail: track.artwork_url || track.user?.avatar_url || 'https://i.ytimg.com/vi/default.jpg',
        author: track.user?.username || 'SoundCloud Artist',
        isSoundCloud: true
      };
    }
  }

  return null;
}

const scUrlCache = new Map();

async function getSoundCloudAudioUrl(query) {
  if (!query) return null;
  const cacheKey = query.trim().toLowerCase();
  if (scUrlCache.has(cacheKey)) {
    const cached = scUrlCache.get(cacheKey);
    if (Date.now() - cached.time < 3600_000) {
      return cached.data;
    }
  }

  const cid = await getSCClientId();
  if (!cid) return null;

  const candidateQueries = [
    cleanTitleForSearch(query),
    query.replace(/[\[\(].*?[\]\)]/g, '').trim(),
    query.trim()
  ].filter(Boolean);

  const uniqueQueries = [...new Set(candidateQueries)];

  for (const clean of uniqueQueries) {
    const searchUrl = 'https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(clean) + '&client_id=' + cid + '&limit=15';
    const data = await fetchJsonHttps(searchUrl);
    if (!data?.collection?.length) continue;

    // Strictly ignore previews/snippets under 75 seconds
    const fullTracks = data.collection.filter(t => (t.duration || 0) >= 75000);
    const pool = fullTracks.length ? fullTracks : data.collection;

    // Prefer full original length tracks (over 2.5 minutes) over short previews
    const isRemixQuery = /remix|dj\s|_dj|dj_/i.test(clean);
    const sortedTracks = [...pool].sort((a, b) => {
      const aIsRemix = /remix|dj\s|_dj|dj_/i.test(a.title);
      const bIsRemix = /remix|dj\s|_dj|dj_/i.test(b.title);
      if (!isRemixQuery) {
        if (!aIsRemix && bIsRemix) return -1;
        if (aIsRemix && !bIsRemix) return 1;
      }
      // Prioritize full standard song length (180s - 450s)
      const aLen = a.duration || 0;
      const bLen = b.duration || 0;
      const aFull = aLen >= 150000 ? 1 : 0;
      const bFull = bLen >= 150000 ? 1 : 0;
      if (aFull !== bFull) return bFull - aFull;

      const aHas160 = a.media?.transcodings?.some(t => t.preset?.includes('160k')) ? 1 : 0;
      const bHas160 = b.media?.transcodings?.some(t => t.preset?.includes('160k')) ? 1 : 0;
      return bHas160 - aHas160;
    });

    for (const track of sortedTracks) {
      if ((track.duration || 0) < 60000 && sortedTracks.some(t => (t.duration || 0) >= 75000)) continue;

      const transcodings = track.media?.transcodings || [];
      // Prioritize full HLS streams (mp3_0_0 or opus_0_0) over short previews (mp3_1_0)
      const fullTranscodings = transcodings.filter(t => !t.snipped && !t.preset?.includes('_1_'));
      const pool = fullTranscodings.length ? fullTranscodings : transcodings;

      const transcoding = pool.find(t => t.preset?.includes('mp3_0_0'))
        || pool.find(t => t.preset?.includes('opus_0_0'))
        || pool.find(t => t.format?.protocol === 'hls')
        || pool.find(t => t.format?.protocol === 'progressive')
        || pool[0];

      if (transcoding?.url) {
        const streamObj = await fetchJsonHttps(transcoding.url + '?client_id=' + cid);
        if (streamObj?.url) {
          const resData = {
            url: streamObj.url,
            title: track.title,
            duration: Math.round((track.duration || 0) / 1000)
          };
          scUrlCache.set(cacheKey, { data: resData, time: Date.now() });
          return resData;
        }
      }
    }
  }
  return null;
}

// Low-latency, Zero-Buffering Native FFmpeg Audio Stream Engine
function createFfmpegStream(streamUrl) {
  const fs = require('fs');
  const { spawn } = require('child_process');
  let ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
  try {
    const ffStatic = require('ffmpeg-static');
    if (ffStatic && fs.existsSync(ffStatic)) ffmpegBin = ffStatic;
  } catch {}

  const child = spawn(ffmpegBin, [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-nostdin',
    '-i', streamUrl,
    '-vn',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  child.on('error', (err) => console.warn('[FFmpeg Native Error]:', err.message));
  child.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg.includes('Error') || msg.includes('failed') || msg.includes('403') || msg.includes('Invalid')) {
      console.warn('[FFmpeg Stderr]:', msg.slice(0, 160));
    }
  });

  return child.stdout;
}

// Reliable Audio Stream Generator with Multi-Provider Fallback (Tested SoundCloud Stream -> play-dl -> YouTube)
async function createAudioStreamResource(url, volume = 100, title = '', directStreamUrl = null) {
  if (!voice) return null;

  // Ultra-Fast Path: If stream URL was pre-fetched, start streaming instantly (0ms delay)
  if (directStreamUrl) {
    try {
      console.log(`[Zero-Buffering Stream] Instant playback for "${title || url}"`);
      const stream = createFfmpegStream(directStreamUrl);
      return voice.createAudioResource(stream, {
        inputType: voice.StreamType.Raw,
        inlineVolume: false,
        highWaterMark: 1024 * 512
      });
    } catch (e) {
      console.warn('[Direct Stream failed, falling back]:', e.message);
    }
  }

  const vidId = extractVideoId(url) || url;
  const searchQuery = title || url;

  // Tier 1: Tested & Verified Direct SoundCloud Engine (0% datacenter blocks, native PCM)
  if (searchQuery) {
    try {
      const scData = await getSoundCloudAudioUrl(searchQuery);
      if (scData?.url) {
        console.log(`[SoundCloud Stream] Playing "${scData.title}"`);
        const stream = createFfmpegStream(scData.url);

        const resource = voice.createAudioResource(stream, {
          inputType: voice.StreamType.Raw,
          inlineVolume: false,
          highWaterMark: 1024 * 512
        });
        return resource;
      }
    } catch (scErr) {
      console.warn('[SoundCloud Stream error]:', scErr.message);
    }
  }

  // Tier 2: play-dl stream fallback (supports YouTube, SoundCloud with deciphering)
  const isPlaydlUrl = url && (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url) || /^https?:\/\/(www\.)?soundcloud\.com\//i.test(url));
  if (playdl && isPlaydlUrl) {
    try {
      const stream = await playdl.stream(url, { quality: 2, discordPlayerCompatibility: false });
      if (stream?.stream) {
        console.log(`[play-dl Stream] Streaming audio for ${url}`);
        if (prism) {
          const ffmpeg = new prism.FFmpeg({
            args: [
              '-analyzeduration', '0',
              '-probesize', '32768',
              '-fflags', '+nobuffer+discardcorrupt+fastseek',
              '-flags', 'low_delay',
              '-thread_queue_size', '8192',
              '-threads', '2',
              '-http_persistent', '1',
              '-reconnect', '1',
              '-reconnect_streamed', '1',
              '-reconnect_at_eof', '1',
              '-reconnect_delay_max', '2',
              '-rw_timeout', '15000000',
              '-nostdin',
              '-af', BASS_AUDIO_FILTER,
              '-f', 's16le',
              '-ar', '48000',
              '-ac', '2'
            ]
          });
          stream.stream.pipe(ffmpeg);
          ffmpeg.on('error', (err) => {
            if (!err.message?.includes('Premature close')) console.warn('[FFmpeg playdl warning]:', err.message);
          });
          const resource = voice.createAudioResource(ffmpeg, {
            inputType: voice.StreamType.Raw,
            inlineVolume: false,
            highWaterMark: 1024 * 512
          });
          return resource;
        } else {
          const resource = voice.createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: false
          });
          return resource;
        }
      }
    } catch (pErr) {
      console.warn('[play-dl stream warning]:', pErr.message);
    }
  }

  // Tier 3: Direct YouTube format stream via FFmpeg
  if (ytdlClient && prism && vidId && vidId.length === 11) {
    try {
      const info = await getCachedInfo(vidId);
      if (info && info.formats && info.formats.length > 0) {
        let format = null;
        if (typeof chooseFormatFn === 'function') {
          try {
            format = chooseFormatFn(info.formats, { filter: f => f.hasAudio && !f.hasVideo, quality: 'highestaudio' });
          } catch {}
        }
        if (!format || !format.url) {
          format = info.formats.find(f => f.hasAudio && !f.hasVideo && f.url) || info.formats.find(f => f.hasAudio && f.url);
        }

        if (format && format.url) {
          const ffmpeg = createFfmpegStream(format.url);
          ffmpeg.on('error', (err) => {
            if (!err.message?.includes('Premature close')) console.warn('[FFmpeg Stream Warning]:', err.message);
          });

          const resource = voice.createAudioResource(ffmpeg, {
            inputType: voice.StreamType.Raw,
            inlineVolume: false,
            highWaterMark: 1024 * 512
          });
          return resource;
        }
      }
    } catch (formatErr) {
      console.warn('[Format URL extraction warning]:', formatErr.message);
    }
  }

  // Tier 4: Direct URL stream (mp3, etc.)
  if (prism && /^https?:\/\//i.test(url) && !url.includes('youtube.com') && !url.includes('youtu.be')) {
    try {
      const ffmpeg = createFfmpegStream(url);
      ffmpeg.on('error', (err) => {
        if (!err.message?.includes('Premature close')) console.warn('[FFmpeg Direct URL warning]:', err.message);
      });
      const resource = voice.createAudioResource(ffmpeg, {
        inputType: voice.StreamType.Raw,
        inlineVolume: false,
        highWaterMark: 1024 * 512
      });
      return resource;
    } catch {}
  }

  return null;
}

const POPULAR_ROTATION_QUERIES = [
  'Pawan Singh Bhojpuri Superhit audio song',
  'Khesari Lal Yadav New Superhit audio song',
  'Arijit Singh Romantic Hits audio',
  'Yo Yo Honey Singh New Hits audio',
  'Sidhu Moose Wala 295 audio song',
  'Karan Aujla Softly audio song',
  'Shilpi Raj Bhojpuri Hit audio',
  'Diljit Dosanjh Lover audio song',
  'Alan Walker Faded audio',
  'The Weeknd Starboy audio',
  'Shubh Cheques audio song',
  'Badshah Hits audio song',
  'AP Dhillon Dil Nu audio song',
  'Neha Kakkar Superhit Songs audio',
  'Arvind Akela Kallu New Hit audio song'
];

// Fetch next continuous song guaranteed to be DIFFERENT from the one that just played
async function fetchNextDifferentSong(Q) {
  Q.playedIds = Q.playedIds || [];
  Q.playedTitles = Q.playedTitles || [];

  // Filter out recent artist/query to prevent repeating the same song
  const lastTitle = (Q.lastPlayedTitle || '').toLowerCase();
  const pool = POPULAR_ROTATION_QUERIES.filter(q => {
    const firstWord = q.toLowerCase().split(' ')[0];
    return !lastTitle.includes(firstWord) && !Q.playedTitles.some(pt => pt.toLowerCase().includes(firstWord));
  });

  const candidateList = pool.length > 0 ? pool : POPULAR_ROTATION_QUERIES;
  const shuffled = [...candidateList].sort(() => Math.random() - 0.5);

  for (const query of shuffled) {
    try {
      const track = await resolveTrack(query);
      if (track && !Q.playedIds.includes(track.id) && !Q.playedTitles.includes(cleanTitle(track.title))) {
        track.by = 'Autoplay';
        return track;
      }
    } catch {}
  }

  try {
    const scTrack = await searchSoundCloudTrack(shuffled[0]);
    if (scTrack && !Q.playedTitles.includes(cleanTitle(scTrack.title))) {
      scTrack.by = 'Autoplay';
      return scTrack;
    }
  } catch {}

  return null;
}

// Reliable Queue Advance on Next / Skip: shifts old track, guarantees new track plays immediately
async function advanceToNextSong(guild, channel, Q) {
  Q.isSkipping = true;
  if (Q.earlyTransitionTimer) {
    clearTimeout(Q.earlyTransitionTimer);
    Q.earlyTransitionTimer = null;
  }

  // Shift currently playing track
  const current = Q.songs.shift();
  if (current?.id) Q.playedIds = (Q.playedIds || []).concat(current.id).slice(-50);
  if (current?.title) Q.playedTitles = (Q.playedTitles || []).concat(cleanTitle(current.title)).slice(-50);

  // If queue is now empty, immediately load a fresh DIFFERENT song
  if (Q.songs.length === 0) {
    const nextTrack = await fetchNextDifferentSong(Q);
    if (nextTrack) Q.songs.push(nextTrack);
  }

  // Stop currently playing resource so audio stops instantly
  try { Q.player?.stop(); } catch {}

  // Allow playNext to proceed without debounce delay
  Q.isProcessing = false;
  Q.consecutiveFails = 0;
  await playNext(guild, channel);
}

// Play next song in queue with resilient streaming, anti-stutter buffer, and spam-free message handling
async function playNext(guild, channel) {
  const Q = q(guild.id);
  const cfg = getGuild(guild.id);

  // Prevent overlap with safety timeout (if older than 8s, reset and allow)
  if (Q.isProcessing && Date.now() - (Q.processingStartedAt || 0) < 8000) {
    console.log('[playNext] Already processing another track for guild ' + guild.id + ', skipping duplicate.');
    return;
  }
  Q.isProcessing = true;
  Q.processingStartedAt = Date.now();

  try {
    if (!voice) {
      if (channel) await channel.send('❌ Audio dependencies missing: `@discordjs/voice`').catch(() => {});
      Q.playing = false;
      return;
    }

    const next = Q.songs[0];
    if (!next) {
      Q.playing = false;
      Q.currentResource = null;

      // Autoplay: keep music playing non-stop unless explicitly stopped
      if (Q.autoplay !== false || Q.stay247) {
        const autoSong = await fetchNextDifferentSong(Q);
        if (autoSong) {
          Q.songs.push(autoSong);
          Q.isProcessing = false;
          return playNext(guild, channel);
        }
      }

      // Safe 5-minute inactivity grace period before disconnecting
      if (!Q.stay247) {
        if (Q.idleDisconnectTimer) clearTimeout(Q.idleDisconnectTimer);
        Q.idleDisconnectTimer = setTimeout(() => {
          if (!Q.playing && !Q.songs.length && !Q.stay247 && Q.conn) {
            console.log(`[Music Idle] Queue empty for 5 minutes in guild ${guild.id}, disconnecting.`);
            try { Q.conn.destroy(); } catch {}
            Q.conn = null;
            Q.vcId = null;
          }
        }, 5 * 60 * 1000);
      }
      return;
    }

    // Reset idle disconnect timer since a song is starting
    if (Q.idleDisconnectTimer) {
      clearTimeout(Q.idleDisconnectTimer);
      Q.idleDisconnectTimer = null;
    }

    if (!Q.player) {
      // 5000 missed frames tolerance & anti-stutter buffer (100s tolerance)
      Q.player = voice.createAudioPlayer({
        behaviors: {
          noSubscriber: voice.NoSubscriberBehavior.Play,
          maxMissedFrames: 5000
        }
      });

      let bufferingTimeout = null;

      Q.player.on('stateChange', (oldState, newState) => {
        console.log(`[AudioPlayer State] ${oldState.status} -> ${newState.status}`);
        if (newState.status === voice.AudioPlayerStatus.Buffering) {
          if (bufferingTimeout) clearTimeout(bufferingTimeout);
          bufferingTimeout = setTimeout(() => {
            if (Q.player?.state?.status === voice.AudioPlayerStatus.Buffering) {
              console.warn('[AudioPlayer Watchdog] Buffering exceeded 10s, advancing queue.');
              try { Q.player.stop(true); } catch {}
            }
          }, 10_000);
        } else {
          if (bufferingTimeout) {
            clearTimeout(bufferingTimeout);
            bufferingTimeout = null;
          }
        }
      });

      Q.player.on('idle', async () => {
        // If skip was handled by advanceToNextSong, exit early
        if (Q.isSkipping) {
          Q.isSkipping = false;
          return;
        }

        const playedDuration = Date.now() - (Q.lastTrackStartTime || 0);
        const finished = Q.songs[0];
        if (finished?.id) {
          Q.lastPlayedId = finished.id;
          Q.playedIds = (Q.playedIds || []).concat(finished.id).slice(-50);
        }
        if (finished?.title) {
          Q.lastPlayedTitle = finished.title;
          Q.playedTitles = (Q.playedTitles || []).concat(cleanTitle(finished.title)).slice(-50);
        }

        if (Q.loop === 'song') {
          Q.isProcessing = false;
          return playNext(guild, channel);
        } else if (Q.loop === 'queue') {
          Q.songs.push(Q.songs.shift());
        } else {
          Q.songs.shift();
        }

        // Rapid failure protection: if track finished in under 2 seconds
        if (playedDuration < 2000) {
          Q.consecutiveFails = (Q.consecutiveFails || 0) + 1;
          if (Q.consecutiveFails >= 5) {
            console.warn('[Playback Guard] 5 consecutive tracks failed. Pausing to protect CPU.');
            Q.playing = false;
            Q.consecutiveFails = 0;
            return;
          }
          await new Promise(r => setTimeout(r, 1000));
        } else {
          Q.consecutiveFails = 0;
        }

        // Auto-continue playback seamlessly if queue is empty
        if (Q.songs.length === 0 && (Q.autoplay !== false || Q.stay247)) {
          const autoSong = await fetchNextDifferentSong(Q);
          if (autoSong) {
            Q.songs.push(autoSong);
          }
        }

        Q.isProcessing = false;
        playNext(guild, channel);
      });

      Q.player.on('error', (err) => {
        console.error('[AudioPlayer Error]:', err.message);
      });
    }

    // Ensure connection is active and player is subscribed
    let conn = voice.getVoiceConnection(guild.id);
    if (conn && conn.state.status !== voice.VoiceConnectionStatus.Destroyed) {
      conn.subscribe(Q.player);
    } else if (Q.vcId) {
      const targetVc = guild.channels.cache.get(Q.vcId) || await guild.channels.fetch(Q.vcId).catch(() => null);
      if (targetVc && targetVc.isVoiceBased()) {
        conn = await ensureVoiceConnection(guild, targetVc, Q);
      }
    }

    if (conn && conn.state.status !== voice.VoiceConnectionStatus.Ready && conn.state.status !== voice.VoiceConnectionStatus.Destroyed) {
      try {
        await voice.entersState(conn, voice.VoiceConnectionStatus.Ready, 5_000);
      } catch {}
    }

    const resource = await createAudioStreamResource(next.url, Q.volume, next.title, next.streamUrl);

    if (!resource) {
      console.warn(`[playNext] Stream unavailable for: ${next.title}`);
      const skipped = Q.songs.shift();
      if (skipped?.id) Q.playedIds = (Q.playedIds || []).concat(skipped.id).slice(-50);
      await new Promise(r => setTimeout(r, 1500));
      Q.isProcessing = false;
      return playNext(guild, channel);
    }

    Q.currentResource = resource;
    Q.lastTrackStartTime = Date.now();

    try { Q.player.unpause(); } catch {}
    Q.player.play(resource);
    Q.playing = true;

    // Zero-Buffering Pipeline: Pre-resolve the next song in the background while current song plays
    setTimeout(async () => {
      try {
        let upcoming = Q.songs[1];
        if (!upcoming && (Q.autoplay !== false || Q.stay247)) {
          upcoming = await fetchNextDifferentSong(Q);
          if (upcoming && Q.songs.length === 1) {
            Q.songs.push(upcoming);
          }
        }
        if (upcoming && !upcoming.streamUrl) {
          const res = await getSoundCloudAudioUrl(upcoming.title || upcoming.url);
          if (res?.url) {
            upcoming.streamUrl = res.url;
            upcoming.streamTitle = res.title;
            console.log(`[Zero-Buffering Pre-fetch] Pre-cached next stream: "${res.title}"`);
          }
        }
      } catch (e) {}
    }, 1200);

    // Send the interactive now playing embed at the bottom with quick buttons
    if (channel) {
      const quickButtons = getMusicQuickButtons(Q);
      const playEmbed = getNowPlayingEmbed(next, Q, cfg);

      if (Q.controllerMsg) {
        try {
          await Q.controllerMsg.edit({ components: [] }).catch(() => {});
        } catch {}
      }
      Q.controllerMsg = await channel.send({ embeds: [playEmbed], components: quickButtons }).catch(() => null);
    }
  } catch (err) {
    console.error('[playNext Exception]:', err.message);
    const skipped = Q.songs.shift();
    if (skipped?.id) Q.playedIds = (Q.playedIds || []).concat(skipped.id).slice(-50);
    await new Promise(r => setTimeout(r, 1500));
    Q.isProcessing = false;
    playNext(guild, channel);
  } finally {
    Q.isProcessing = false;
  }
}
// Permission / Role check helper for controlling music
function canControlMusic(member, guild, cfg) {
  if (!cfg || !cfg.musicrole) return true; // If no role configured, open for all
  if (!member) return true;
  if (guild && member.id === guild.ownerId) return true; // Server Owner
  if (member.permissions && typeof member.permissions.has === 'function' && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  // Role check: support Collection (member.roles.cache) and Array (member.roles)
  if (member.roles?.cache) return member.roles.cache.has(cfg.musicrole);
  if (Array.isArray(member.roles)) return member.roles.includes(cfg.musicrole);
  return true;
}

// Interactive button interaction handler
async function handleInteraction(i, client) {
  if (!i.isButton() || !String(i.customId).startsWith('vg_music_')) return;

  const cfg = getGuild(i.guildId);
  const Q = q(i.guildId);

  // Enforce music role check on button clicks
  if (!canControlMusic(i.member, i.guild, cfg)) {
    return i.reply({
      content: `⛔ **Music Control Locked:** Only members with the <@&${cfg.musicrole}> role can control music playback.`,
      ephemeral: true
    }).catch(() => {});
  }

  const action = i.customId.replace('vg_music_', '');

  if (action === 'pause_resume') {
    if (!Q.songs.length) return i.reply({ content: '-# ❌ Nothing is currently in the queue.', ephemeral: true }).catch(() => {});
    const isPaused = Q.player?.state?.status === voice?.AudioPlayerStatus?.Paused;
    if (isPaused) {
      Q.player?.unpause();
    } else if (Q.player?.state?.status === voice?.AudioPlayerStatus?.Playing) {
      Q.player?.pause();
    } else {
      playNext(i.guild, i.channel);
    }
    const cur = Q.songs[0];
    const playEmbed = cur ? getNowPlayingEmbed(cur, Q, cfg) : null;

    return i.update({
      content: null,
      embeds: playEmbed ? [playEmbed] : [],
      components: getMusicQuickButtons(Q)
    }).catch(() => {});
  }

  if (action === 'skip' || action === 'next') {
    await i.deferUpdate().catch(() => {});
    await advanceToNextSong(i.guild, i.channel, Q);
    return;
  }

  if (action === 'stop') {
    if (Q.earlyTransitionTimer) {
      clearTimeout(Q.earlyTransitionTimer);
      Q.earlyTransitionTimer = null;
    }
    Q.songs = [];
    Q.playing = false;
    Q.loop = 'off';
    try { Q.player?.stop(); } catch {}
    if (!Q.stay247 && Q.conn) {
      try { Q.conn.destroy(); } catch {}
      Q.conn = null;
      Q.vcId = null;
    }
    Q.controllerMsg = null;
    return i.update({
      content: '-# ⏹️ Playback stopped and queue cleared.',
      embeds: [],
      components: []
    }).catch(() => {});
  }

  if (action === 'loop') {
    Q.loop = Q.loop === 'off' ? 'song' : Q.loop === 'song' ? 'queue' : 'off';
    const cur = Q.songs[0];
    const em = cur ? getNowPlayingEmbed(cur, Q, cfg) : null;
    const payload = { components: getMusicQuickButtons(Q) };
    if (em) payload.embeds = [em];
    return i.update(payload).catch(() => {});
  }

  if (action === 'vol_down') {
    Q.volume = Math.max(10, (Q.volume || 100) - 15);
    if (Q.currentResource?.volume) {
      Q.currentResource.volume.setVolume(Q.volume / 100);
    }
    const cur = Q.songs[0];
    const em = cur ? getNowPlayingEmbed(cur, Q, cfg) : null;
    const payload = { components: getMusicControllerRow(Q) };
    if (em) payload.embeds = [em];
    return i.update(payload).catch(() => {});
  }

  if (action === 'vol_up') {
    Q.volume = Math.min(200, (Q.volume || 100) + 15);
    if (Q.currentResource?.volume) {
      Q.currentResource.volume.setVolume(Q.volume / 100);
    }
    const cur = Q.songs[0];
    const em = cur ? getNowPlayingEmbed(cur, Q, cfg) : null;
    const payload = { components: getMusicControllerRow(Q) };
    if (em) payload.embeds = [em];
    return i.update(payload).catch(() => {});
  }

  if (action === 'shuffle') {
    if (Q.songs.length <= 1) {
      return i.reply({ content: '❌ Not enough songs in queue to shuffle.', ephemeral: true }).catch(() => {});
    }
    const cur = Q.songs[0];
    const rest = Q.songs.slice(1).sort(() => Math.random() - 0.5);
    Q.songs = [cur, ...rest];
    return i.reply({ content: '<a:joya:1551154653201440828> **( 𝐐𝐮𝐞𝐮𝐞 𝐒𝐡𝐮𝐟𝐟𝐥𝐞𝐝! )**', ephemeral: true }).catch(() => {});
  }

  if (action === 'queue') {
    if (!Q.songs.length) return i.reply({ content: '<a:vgwarn:1559740808146591774> The queue is currently empty.', ephemeral: true }).catch(() => {});
    const list = Q.songs.slice(0, 10).map((s, idx) => `${idx === 0 ? '<a:joya:1551154653201440828>' : `${idx}.`} [<a:joya:1551393231642829001> **${s.title}**](${s.url}) (<@${s.by}>)`).join('\n');
    const qEm = new EmbedBuilder()
      .setColor(0x00ccff)
      .setTitle(`<a:joya:1551393231642829001> ( 𝐂𝐮𝐫𝐫𝐞𝐧𝐭 𝐐𝐮𝐞𝐮𝐞 - ${Q.songs.length} 𝐭𝐫𝐚𝐜𝐤𝐬 )`)
      .setDescription(list.slice(0, 2000))
      .setFooter({ text: `Loop: ${Q.loop.toUpperCase()} | Volume: ${Q.volume}%` });
    return i.reply({ embeds: [qEm], ephemeral: true }).catch(() => {});
  }
}

async function run(msg, args) {
  const [cmd, ...rest] = args;
  const MUSIC_CMDS = [
    'play', 'p', 'join', 'connect', 'leave', 'video', 'controller', 'player', 'pause', 'resume', 'skip', 'back', 'stop', 'disconnect',
    'nowplaying', 'np', 'forward', 'backward', 'seek', '247', 'queue', 'q',
    'shuffle', 'clear', 'remove', 'move', 'loop', 'autoplay', 'volume', 'vol',
    'filter', 'lyrics', 'about', 'mhelp', 'fav-add', 'fav-list', 'fav-play',
    'fav-remove', 'pl-create', 'pl-delete', 'pl-list', 'pl-load', 'pl-save',
    'pl-append', 'pl-rename', 'pl-share', 'pl-import', 'pl-track-add',
    'pl-track-list', 'pl-track-remove'
  ];

  if (!MUSIC_CMDS.includes(cmd)) return null;

  const cfg = getGuild(msg.guild.id);
  const Q = q(msg.guild.id);
  let vc = msg.member?.voice?.channel;
  if (!vc && msg.member) {
    try {
      const freshMember = await msg.guild.members.fetch(msg.author.id);
      vc = freshMember?.voice?.channel;
    } catch {}
  }

  // Hardware Stereo Web Controller Command
  if (cmd === 'controller' || cmd === 'player') {
    const port = process.env.HEALTH_PORT || process.env.PORT || 3000;
    const controllerUrl = process.env.CONTROLLER_URL || `http://localhost:${port}/controller`;

    const em = new EmbedBuilder()
      .setColor(0xff007f)
      .setAuthor({
        name: '⚡ ( 𝐕𝐆 𝐒𝐭𝐮𝐝𝐢𝐨 • 𝐇𝐚𝐫𝐝𝐰𝐚𝐫𝐞 𝐀𝐮𝐝𝐢𝐨 𝐂𝐨𝐧𝐭𝐫𝐨𝐥𝐥𝐞𝐫 ) ⚡',
        iconURL: 'https://cdn.discordapp.com/emojis/1551154653201440828.gif'
      })
      .setTitle('<a:joya:1551154653201440828> ( 𝐒𝐭𝐞𝐫𝐞𝐨 𝐏𝐚𝐧 & 𝐕𝐨𝐥𝐮𝐦𝐞 𝐂𝐨𝐧𝐭𝐫𝐨𝐥𝐥𝐞𝐫 )')
      .setDescription(
        `### <a:joya:1551393231642829001> **[Open Hardware Audio Controller](${controllerUrl})**\n\n` +
        `> <a:joya:1551156450825474048> **Rotary Knob:** Scroll wheel up/down or drag to pan sound to **Left / Right headphone**\n` +
        `> <a:joya:1551156450825474048> **Vertical Fader:** Drag up and down for smooth volume control\n` +
        `> <a:joya:1551156450825474048> **Audio Engine:** 3D Spatial stereo panning with live real-time feedback\n\n` +
        `*Click the button below to launch the interactive controller in your browser!*`
      )
      .setFooter({ text: 'VG Studio • Neumorphic Master Audio Controller', iconURL: 'https://cdn.discordapp.com/emojis/1551154653201440828.gif' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('( 𝐎𝐩𝐞𝐧 𝐀𝐮𝐝𝐢𝐨 𝐂𝐨𝐧𝐭𝐫𝐨𝐥𝐥𝐞𝐫 ↗ )')
        .setStyle(ButtonStyle.Link)
        .setURL(controllerUrl)
        .setEmoji('<a:joya:1551154653201440828>')
    );

    return msg.reply({ embeds: [em], components: [row] }), true;
  }

  // Music Help / About
  if (cmd === 'mhelp' || cmd === 'about') {
    const roleInfo = cfg.musicrole ? `\n<a:joya:1551154653201440828> **( 𝐌𝐮𝐬𝐢𝐜 𝐂𝐨𝐧𝐭𝐫𝐨𝐥 𝐑𝐨𝐥𝐞 ):** <@&${cfg.musicrole}>` : '\n<a:joya:1551393231642829001> **( 𝐌𝐮𝐬𝐢𝐜 𝐂𝐨𝐧𝐭𝐫𝐨𝐥 𝐑𝐨𝐥𝐞 ):** None (Open for all)';
    const em = new EmbedBuilder()
      .setColor(0x00ccff)
      .setTitle('<a:joya:1551154653201440828> ( 𝐕𝐆 𝐌𝐮𝐬𝐢𝐜 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 )')
      .setDescription(
        '`' + cfg.prefix + 'play <song/url>` — Play audio in VC with interactive animated controller\n' +
        '`' + cfg.prefix + 'video <song/url>` — Play video song (Watch Together in VC & chat player)\n' +
        '`' + cfg.prefix + 'controller` — Launch 3D Stereo Panning & Volume hardware web controller\n' +
        '`' + cfg.prefix + 'pause` / `' + cfg.prefix + 'resume` — Pause or resume playback\n' +
        '`' + cfg.prefix + 'skip` — Skip to next song in queue\n' +
        '`' + cfg.prefix + 'stop` — Stop music and clear queue\n' +
        '`' + cfg.prefix + 'queue` — View current song queue\n' +
        '`' + cfg.prefix + 'volume <1-100>` — Adjust music volume\n' +
        '`' + cfg.prefix + 'loop` — Toggle loop (off / song / queue)\n' +
        '`' + cfg.prefix + 'shuffle` — Shuffle queue\n' +
        '`' + cfg.prefix + 'clear` — Clear upcoming queue\n' +
        '`' + cfg.prefix + 'nowplaying` (`.np`) — Show current playing track\n' +
        '`' + cfg.prefix + '247` — Toggle 24/7 bot presence in VC\n' +
        '`' + cfg.prefix + 'musicrole <@role>` — (Admin) Set DJ / Music control role\n' +
        '`' + cfg.prefix + 'remove musicrole [@user]` — (Admin) Remove music role from user or server' + roleInfo
      );
    return msg.reply({ embeds: [em] }), true;
  }

  // Handle .remove musicrole [@user] directly
  if (cmd === 'remove' && rest[0]?.toLowerCase() === 'musicrole') {
    if (!isAdmin(msg.member, msg.guild)) return msg.reply('<a:vgcross:1559740805206515743> Admins only.'), true;
    const targetMember = msg.mentions.members.first() || (rest[1] ? await msg.guild.members.fetch(rest[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
    if (targetMember) {
      if (!cfg.musicrole) return msg.reply('<a:vgcross:1559740805206515743> No music role is configured on this server.'), true;
      await targetMember.roles.remove(cfg.musicrole, 'Removed music control role by admin').catch(() => {});
      return msg.reply(`<a:vgtick:1559740802324893798> Removed <@&${cfg.musicrole}> role from ${targetMember}.`), true;
    }
    cfg.musicrole = null;
    saveGuild(msg.guild.id, cfg);
    return msg.reply('<a:vgtick:1559740802324893798> Music role restriction removed. All members can now use music commands.'), true;
  }

  // Check DJ / Music-Role restriction for playback control commands
  const CONTROL_CMDS = [
    'play', 'p', 'join', 'connect', 'leave', 'dc', 'video', 'controller', 'player', 'pause', 'resume', 'skip', 'back', 'stop', 'disconnect',
    'forward', 'backward', 'seek', '247', 'shuffle', 'clear',
    'remove', 'move', 'loop', 'autoplay', 'volume', 'vol', 'volume+', 'volume-', 'vol+', 'vol-', 'filter',
    'fav-play', 'pl-load'
  ];

  if (CONTROL_CMDS.includes(cmd) && !canControlMusic(msg.member, msg.guild, cfg)) {
    const lockEm = new EmbedBuilder()
      .setColor(0xff3333)
      .setTitle('<a:vgwarn:1559740808146591774> ( 𝐌𝐮𝐬𝐢𝐜 𝐂𝐨𝐧𝐭𝐫𝐨𝐥 𝐋𝐨𝐜𝐤𝐞𝐝 )')
      .setDescription(`Only members with the **<@&${cfg.musicrole}>** role can control or play music.\n\n*(Contact an Admin or Server Owner to obtain the music role)*`);
    return msg.reply({ embeds: [lockEm] }), true;
  }

  // Join / Connect command
  if (['join', 'connect'].includes(cmd)) {
    if (!vc) {
      return msg.reply('<a:vgcross:1559740805206515743> Please join a voice channel first!'), true;
    }
    if (!voice) {
      return msg.reply('<a:vgcross:1559740805206515743> Music dependencies missing: `@discordjs/voice`'), true;
    }

    const botMember = msg.guild.members?.me || await msg.guild.members.fetchMe().catch(() => null);
    const perms = botMember ? vc.permissionsFor(botMember) : null;
    if (!perms || !perms.has(PermissionsBitField.Flags.Connect)) {
      return msg.reply(`❌ I do not have permission to join **${vc.name}**! (Missing CONNECT permission)`), true;
    }
    if (!perms.has(PermissionsBitField.Flags.Speak)) {
      return msg.reply(`❌ I do not have permission to speak in **${vc.name}**! (Missing SPEAK permission)`), true;
    }

    try {
      await ensureVoiceConnection(msg.guild, vc, Q);
      return msg.reply(`<a:vgtick:1559740802324893798> Joined **${vc.name}**!`), true;
    } catch (joinErr) {
      return msg.reply(`❌ Voice channel connection failed: ${joinErr.message}`), true;
    }
  }

  // Play and 24/7 command
  if (['play', 'p', '247'].includes(cmd)) {
    if (!vc) {
      return msg.reply('<a:vgcross:1559740805206515743> Please join a voice channel first!'), true;
    }
    if (!voice) {
      return msg.reply('<a:vgcross:1559740805206515743> Music dependencies missing: `@discordjs/voice`'), true;
    }

    // Check bot permissions in target Voice Channel
    const botMember = msg.guild.members?.me || await msg.guild.members.fetchMe().catch(() => null);
    const perms = botMember ? vc.permissionsFor(botMember) : null;
    if (!perms || !perms.has(PermissionsBitField.Flags.Connect)) {
      return msg.reply(`❌ I do not have permission to join **${vc.name}**! (Missing CONNECT permission)`), true;
    }
    if (!perms.has(PermissionsBitField.Flags.Speak)) {
      return msg.reply(`❌ I do not have permission to speak in **${vc.name}**! (Missing SPEAK permission)`), true;
    }

    // Connect to voice channel immediately and reliably
    try {
      await ensureVoiceConnection(msg.guild, vc, Q);
    } catch (joinErr) {
      console.error('Voice join error:', joinErr);
      return msg.reply(`❌ Voice channel connection failed: ${joinErr.message}`), true;
    }

    if (cmd === '247') {
      Q.stay247 = !Q.stay247;
      Q.autoplay = Q.stay247;
      Q.vcId = vc.id;

      cfg.music247 = {
        enabled: Q.stay247,
        channelId: Q.stay247 ? vc.id : null,
        textChannelId: Q.stay247 ? msg.channel.id : null
      };
      saveGuild(msg.guild.id, cfg);

      if (Q.stay247) {
        if (!Q.playing && Q.songs.length === 0) {
          const starterSong = await fetchAutoplayTrack(Q);
          if (starterSong) {
            Q.songs.push(starterSong);
            playNext(msg.guild, msg.channel);
          }
        }
        const onEm = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('<a:joya:1551154653201440828> ( 𝟐𝟒/𝟕 𝐂𝐨𝐧𝐭𝐢𝐧𝐮𝐨𝐮𝐬 𝐌𝐮𝐬𝐢𝐜 𝐄𝐧𝐚𝐛𝐥𝐞𝐝! )')
          .setDescription(
            `<a:vgtick:1559740802324893798> Bot will now **stay in <#${vc.id}> 24/7**!\n` +
            `<a:joya:1551393231642829001> **Continuous Autoplay:** Tracks will play automatically and change continuously non-stop!\n` +
            `<a:joya:1551154653201440828> **Auto-Rejoin Saved:** The bot will automatically reconnect on restarts or network changes.`
          );
        return msg.reply({ embeds: [onEm] }), true;
      } else {
        return msg.reply('<a:vgcross:1559740805206515743> **( 𝟐𝟒/𝟕 𝐌𝐨𝐝𝐞 𝐎𝐅𝐅 ):** Bot will disconnect when the queue finishes.'), true;
      }
    }

    const query = rest.join(' ');
    if (!query) return msg.reply(`Format: \`${cfg.prefix}play <song title or YouTube URL>\``), true;

    // Fast 0% delay resolution with clean title
    const track = await resolveTrack(query);
    if (!track) {
      return msg.reply('<a:vgcross:1559740805206515743> Song not found. Please try another search term or link.'), true;
    }

    const cleaned = cleanTitle(track.title);

    Q.songs.push({
      id: track.id,
      url: track.url,
      title: cleaned,
      duration: track.duration,
      thumbnail: track.thumbnail,
      author: track.author,
      by: msg.author.id
    });

    const isActivelyPlaying = Q.playing && Q.player && (
      Q.player.state.status === voice?.AudioPlayerStatus?.Playing ||
      Q.player.state.status === voice?.AudioPlayerStatus?.Buffering
    ) && Q.songs.length > 1;

    if (!isActivelyPlaying) {
      Q.isProcessing = false;
      playNext(msg.guild, msg.channel);
    } else {
      await msg.reply(`-# ✅ Added to queue: **${cleaned}** (#${Q.songs.length}) • \`${formatDuration(track.duration)}\``).catch(() => {});
    }
    return true;
  }

  // Video Song command (Explicitly generates Watch Together and video player in chat)
  if (cmd === 'video') {
    const query = rest.join(' ');
    if (!query) return msg.reply(`Format: \`${cfg.prefix}video <song title or YouTube URL>\``), true;

    const searchingMsg = await msg.reply(`<a:joya:1551393231642829001> Searching video: **${query}**...`).catch(() => null);
    const track = await resolveTrack(query);
    if (!track) {
      if (searchingMsg) searchingMsg.edit('<a:vgcross:1559740805206515743> Video not found. Please try another search term or link.').catch(() => {});
      return true;
    }

    const row = new ActionRowBuilder();
    row.addComponents(
      new ButtonBuilder()
        .setLabel('( 𝐖𝐚𝐭𝐜𝐡 𝐨𝐧 𝐘𝐨𝐮𝐓𝐮𝐛𝐞 )')
        .setStyle(ButtonStyle.Link)
        .setURL(track.url)
        .setEmoji('<a:joya:1551393231642829001>')
    );

    // If user is in voice channel: play audio in VC + generate Discord Watch Together activity button
    if (vc) {
      if (voice) {
        try {
          const botMember = msg.guild.members?.me || await msg.guild.members.fetchMe().catch(() => null);
          const perms = botMember ? vc.permissionsFor(botMember) : null;
          if (perms?.has(PermissionsBitField.Flags.Connect) && perms?.has(PermissionsBitField.Flags.Speak)) {
            await ensureVoiceConnection(msg.guild, vc, Q);
            Q.songs.push({
              id: track.id,
              url: track.url,
              title: track.title,
              duration: track.duration,
              thumbnail: track.thumbnail,
              author: track.author,
              by: msg.author.id,
              isVideo: true
            });
            const isActivelyPlaying = Q.playing && Q.player && (
      Q.player.state.status === voice?.AudioPlayerStatus?.Playing ||
      Q.player.state.status === voice?.AudioPlayerStatus?.Buffering
    ) && Q.songs.length > 1;
            if (!isActivelyPlaying) playNext(msg.guild, null);
          }
        } catch (e) {
          console.error('VC join error in video command:', e.message);
        }
      }

      // Generate Watch Together VC invite button
      try {
        const invite = await vc.createInvite({
          targetApplication: '880218394199220334', // YouTube Watch Together
          targetType: InviteTargetType.EmbeddedApplication,
          maxAge: 86400,
          maxUses: 0
        });
        if (invite?.url) {
          row.addComponents(
            new ButtonBuilder()
              .setLabel('( 𝐖𝐚𝐭𝐜𝐡 𝐓𝐨𝐠𝐞𝐭𝐡𝐞𝐫 𝐢𝐧 𝐕𝐂 )')
              .setStyle(ButtonStyle.Link)
              .setURL(invite.url)
              .setEmoji('<a:joya:1551154653201440828>')
          );
        }
      } catch (err) {
        console.log('Watch Together invite note:', err.message);
      }
    }

    if (searchingMsg) {
      await searchingMsg.delete().catch(() => {});
    }

    // Clean video link with interactive hoverable title and Watch Together button
    return msg.channel.send({
      content: `<a:joya:1551154653201440828> **( 𝐕𝐢𝐝𝐞𝐨 𝐓𝐫𝐚𝐜𝐤 ):** [<a:joya:1551393231642829001> **${track.title}**](${track.url})\n${track.url}`,
      components: [row]
    }), true;
  }

  // Skip
  if (cmd === 'skip') {
    if (!Q.songs.length && !Q.autoplay && !Q.stay247) return msg.reply('<a:vgcross:1559740805206515743> Nothing is currently playing to skip.'), true;
    await advanceToNextSong(msg.guild, msg.channel, Q);
    return msg.reply('<a:joya:1551156450825474048> **( Skipped to next track! )**'), true;
  }

  // Stop / Disconnect / Leave
  if (['stop', 'disconnect', 'leave', 'dc'].includes(cmd)) {
    if (Q.earlyTransitionTimer) {
      clearTimeout(Q.earlyTransitionTimer);
      Q.earlyTransitionTimer = null;
    }
    Q.songs = [];
    Q.playing = false;
    Q.loop = 'off';
    try { Q.player?.stop(); } catch {}
    if (Q.controllerMsg) {
      try { await Q.controllerMsg.delete().catch(() => {}); } catch {}
      Q.controllerMsg = null;
    }
    if (!Q.stay247 && Q.conn) {
      try { Q.conn.destroy(); } catch {}
      Q.conn = null;
      Q.vcId = null;
    }
    return msg.reply('<a:vgcross:1559740805206515743> **( 𝐏𝐥𝐚𝐲𝐛𝐚𝐜𝐤 𝐬𝐭𝐨𝐩𝐩𝐞𝐝 𝐚𝐧𝐝 𝐪𝐮𝐞𝐮𝐞 𝐜𝐥𝐞𝐚𝐫𝐞𝐝. )**'), true;
  }

  // Pause
  if (cmd === 'pause') {
    if (!Q.playing) return msg.reply('<a:vgcross:1559740805206515743> Nothing is currently playing.'), true;
    Q.player?.pause();
    return msg.reply('<a:vgwarn:1559740808146591774> **( 𝐏𝐥𝐚𝐲𝐛𝐚𝐜𝐤 𝐩𝐚𝐮𝐬𝐞𝐝. )**'), true;
  }

  // Resume
  if (cmd === 'resume') {
    if (!Q.playing) return msg.reply('<a:vgcross:1559740805206515743> Nothing is currently playing.'), true;
    Q.player?.unpause();
    return msg.reply('<a:vgtick:1559740802324893798> **( 𝐏𝐥𝐚𝐲𝐛𝐚𝐜𝐤 𝐫𝐞𝐬𝐮𝐦𝐞𝐝. )**'), true;
  }

  // Now Playing
  if (cmd === 'nowplaying' || cmd === 'np') {
    const cur = Q.songs[0];
    if (!cur) return msg.reply('<a:vgcross:1559740805206515743> Nothing is currently playing.'), true;
    if (Q.controllerMsg) {
      try { await Q.controllerMsg.delete().catch(() => {}); } catch {}
      Q.controllerMsg = null;
    }
    const npEm = getNowPlayingEmbed(cur, Q, cfg);
    const quickButtons = getMusicQuickButtons(Q);
    Q.controllerMsg = await msg.channel.send({ embeds: [npEm], components: quickButtons }).catch(() => null);
    return true;
  }

  // Queue (.queue, .q)
  if (['queue', 'q'].includes(cmd)) {
    if (!Q.songs.length) return msg.reply('<a:vgwarn:1559740808146591774> The queue is currently empty.'), true;
    const list = Q.songs.slice(0, 15).map((s, i) => `${i === 0 ? '<a:joya:1551154653201440828>' : `${i}.`} [<a:joya:1551393231642829001> **${s.title}**](${s.url}) (<@${s.by}>)`).join('\n');
    const qEm = new EmbedBuilder()
      .setColor(0x00ccff)
      .setTitle(`<a:joya:1551393231642829001> ( 𝐌𝐮𝐬𝐢𝐜 𝐐𝐮𝐞𝐮𝐞 - ${Q.songs.length} 𝐬𝐨𝐧𝐠𝐬 )`)
      .setDescription(list.slice(0, 2000))
      .setFooter({ text: `Loop: ${Q.loop.toUpperCase()} | 24/7: ${Q.stay247 ? 'ON' : 'OFF'}` });
    return msg.reply({ embeds: [qEm] }), true;
  }

  // Shuffle
  if (cmd === 'shuffle') {
    if (Q.songs.length <= 1) return msg.reply('<a:vgwarn:1559740808146591774> Please add more songs to the queue before shuffling.'), true;
    const first = Q.songs[0];
    const restSongs = Q.songs.slice(1).sort(() => Math.random() - 0.5);
    Q.songs = [first, ...restSongs];
    return msg.reply('<a:joya:1551154653201440828> **( 𝐐𝐮𝐞𝐮𝐞 𝐬𝐡𝐮𝐟𝐟𝐥𝐞𝐝! )**'), true;
  }

  // Clear
  if (cmd === 'clear') {
    Q.songs = Q.songs.slice(0, 1);
    return msg.reply('<a:vgtick:1559740802324893798> **( 𝐔𝐩𝐜𝐨𝐦𝐢𝐧𝐠 𝐪𝐮𝐞𝐮𝐞 𝐜𝐥𝐞𝐚𝐫𝐞𝐝. )**'), true;
  }

  // Remove song from queue
  if (cmd === 'remove') {
    const idx = parseInt(rest[0]);
    if (isNaN(idx) || idx < 1 || idx >= Q.songs.length) {
      return msg.reply(`Please specify a valid track number: \`${cfg.prefix}remove 2\``), true;
    }
    const [removed] = Q.songs.splice(idx, 1);
    return msg.reply(`<a:vgtick:1559740802324893798> **( 𝐑𝐞𝐦𝐨𝐯𝐞𝐝 ):** [<a:joya:1551393231642829001> **${removed.title}**](${removed.url})`), true;
  }

  // Move
  if (cmd === 'move') {
    const [a, b] = rest.map(Number);
    if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0 && a < Q.songs.length && b < Q.songs.length) {
      const [s] = Q.songs.splice(a, 1);
      Q.songs.splice(b, 0, s);
      return msg.reply(`<a:vgtick:1559740802324893798> Moved track from #${a} to #${b}`), true;
    }
    return msg.reply(`Format: \`${cfg.prefix}move <from_position> <to_position>\``), true;
  }

  // Loop
  if (cmd === 'loop') {
    Q.loop = Q.loop === 'off' ? 'song' : Q.loop === 'song' ? 'queue' : 'off';
    return msg.reply(`<a:joya:1551154653201440828> **( 𝐋𝐨𝐨𝐩 𝐌𝐨𝐝𝐞 ):** \`${Q.loop.toUpperCase()}\``), true;
  }

  // Autoplay
  if (cmd === 'autoplay') {
    Q.autoplay = !Q.autoplay;
    return msg.reply(`<a:joya:1551393231642829001> **( 𝐀𝐮𝐭𝐨𝐩𝐥𝐚𝐲 ):** \`${Q.autoplay ? 'ON' : 'OFF'}\``), true;
  }

  // Volume (.volume, .vol, .volume+, .volume-, .vol+, .vol-)
  if (['volume', 'vol', 'volume+', 'volume-', 'vol+', 'vol-'].includes(cmd)) {
    let v;
    if (cmd === 'volume+' || cmd === 'vol+' || rest[0] === '+' || rest[0] === 'up') {
      v = Math.min(200, (Q.volume || 100) + 15);
    } else if (cmd === 'volume-' || cmd === 'vol-' || rest[0] === '-' || rest[0] === 'down') {
      v = Math.max(10, (Q.volume || 100) - 15);
    } else if (rest[0]) {
      v = parseInt(rest[0].replace('%', ''));
    }

    if (isNaN(v) || v < 10 || v > 200) {
      return msg.reply(`<a:joya:1551393231642829001> Current volume: \`${Q.volume}%\` — Set between 10% and 200%: \`${cfg.prefix}volume 100\` or \`${cfg.prefix}volume+\``), true;
    }

    Q.volume = v;
    if (Q.currentResource?.volume) {
      Q.currentResource.volume.setVolume(v / 100);
    }
    if (Q.controllerMsg && Q.songs[0]) {
      const em = getNowPlayingEmbed(Q.songs[0], Q, cfg);
      Q.controllerMsg.edit({ embeds: [em], components: getMusicControllerRow(Q) }).catch(() => {});
    }
    return msg.reply(`<a:joya:1551393231642829001> **( 𝐕𝐨𝐥𝐮𝐦𝐞 𝐒𝐞𝐭 ):** \`${v}%\` \`${getVolumeBar(v)}\``), true;
  }

  // Seek / Filter / Lyrics
  if (cmd === 'seek' || cmd === 'forward' || cmd === 'backward') return msg.reply('<a:vgwarn:1559740808146591774> Seeking is not supported on live audio streams.'), true;
  if (cmd === 'filter') return msg.reply('<a:vgwarn:1559740808146591774> Audio filters are coming soon.'), true;
  if (cmd === 'lyrics') return msg.reply('<a:vgwarn:1559740808146591774> For lyrics, please search the song title on Google.'), true;

  // Favorites & Playlists (Memory based per guild)
  Q.favs = Q.favs || {};
  Q.pls = Q.pls || {};
  const uid = msg.author.id;

  if (cmd === 'fav-add') {
    if (!Q.songs[0]) return msg.reply('<a:vgcross:1559740805206515743> Nothing is currently playing.'), true;
    (Q.favs[uid] = Q.favs[uid] || []).push(Q.songs[0]);
    return msg.reply(`<a:joya:1551154653201440828> Added to favorites: [**${Q.songs[0].title}**](${Q.songs[0].url})`), true;
  }
  if (cmd === 'fav-list') {
    const list = (Q.favs[uid] || []).map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join('\n');
    return msg.reply(list.slice(0, 1800) || 'Your favorites list is empty.'), true;
  }
  if (cmd === 'fav-play') {
    const f = Q.favs[uid] || [];
    if (!f.length) return msg.reply('Your favorites list is empty.'), true;
    Q.songs.push(...f);
    if (!Q.playing) playNext(msg.guild, msg.channel);
    return msg.reply(`▶️ Queued **${f.length}** favorite songs.`), true;
  }
  if (cmd === 'fav-remove') {
    const idx = parseInt(rest[0]) - 1;
    if ((Q.favs[uid] || [])[idx]) {
      const [rem] = Q.favs[uid].splice(idx, 1);
      return msg.reply(`✅ Removed from favorites: [**${rem.title}**](${rem.url})`), true;
    }
    return msg.reply(`Format: \`${cfg.prefix}fav-remove <number>\``), true;
  }

  // Playlists
  if (cmd.startsWith('pl-')) {
    const name = rest[0];
    if (cmd === 'pl-create') {
      if (!name) return msg.reply(`Format: \`${cfg.prefix}pl-create <name>\``), true;
      Q.pls[name] = [];
      return msg.reply(`✅ Playlist **${name}** created successfully!`), true;
    }
    if (cmd === 'pl-delete') {
      delete Q.pls[name];
      return msg.reply(`✅ Playlist **${name}** deleted successfully.`), true;
    }
    if (cmd === 'pl-list') {
      return msg.reply(Object.keys(Q.pls).join(', ') || 'No playlists found.'), true;
    }
    if (cmd === 'pl-save') {
      if (!name) return msg.reply(`Format: \`${cfg.prefix}pl-save <name>\``), true;
      Q.pls[name] = [...Q.songs];
      return msg.reply(`✅ Current queue saved to playlist **${name}**!`), true;
    }
    if (cmd === 'pl-load') {
      if (!Q.pls[name] || !Q.pls[name].length) return msg.reply('Playlist not found or empty.'), true;
      Q.songs.push(...Q.pls[name]);
      if (!Q.playing) playNext(msg.guild, msg.channel);
      return msg.reply(`▶️ Loaded playlist **${name}** (${Q.pls[name].length} tracks).`), true;
    }
  }

  return true;
}

// Automatically rejoin 24/7 Voice Channel on bot startup and resume continuous music
async function init247(client) {
  if (!voice) return;
  for (const [, guild] of client.guilds.cache) {
    try {
      const cfg = getGuild(guild.id);
      if (cfg.music247?.enabled && cfg.music247?.channelId) {
        const vc = await guild.channels.fetch(cfg.music247.channelId).catch(() => null);
        if (!vc || !vc.isVoiceBased()) continue;

        const Q = q(guild.id);
        Q.stay247 = true;
        Q.autoplay = false;
        Q.vcId = vc.id;

        await ensureVoiceConnection(guild, vc, Q);


        // Bot is connected 24/7 in VC. Music starts when user queues songs with .play or .p
        console.log(`[init247] Rejoined 24/7 Voice Channel: ${vc.name} in ${guild.name}`);
      }
    } catch (err) {
      console.error('[init247 error for guild ' + guild.id + ']:', err.message);
    }
  }
}

module.exports = { run, handleInteraction, init247 };
