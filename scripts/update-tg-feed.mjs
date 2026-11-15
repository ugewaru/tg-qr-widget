// src/update-tg-static-entry.js
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/telegram.js
function decodeEntities(str) {
  return String(str || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]*>/g, "")).trim();
}
function pluralizeRu(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs >= 11 && abs <= 19) return many;
  if (rem === 1) return one;
  if (rem >= 2 && rem <= 4) return few;
  return many;
}
function formatSubscriberLabel(rawExtra, rawCounter) {
  if (rawExtra) {
    const numMatch = rawExtra.match(/([\d\s]+)\s*(?:subscriber|member|подпис)/i);
    if (numMatch) {
      const digits = numMatch[1].replace(/\s+/g, "");
      const num = Number(digits);
      if (Number.isFinite(num) && num > 0) {
        const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        return `${grouped} ${pluralizeRu(num, "\u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A", "\u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u0430", "\u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u043E\u0432")}`;
      }
    }
  }
  if (rawCounter) {
    return `${rawCounter.trim()} \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u043E\u0432`;
  }
  return "Telegram \u043A\u0430\u043D\u0430\u043B";
}
function extractDivByClass(html, classFragment) {
  const re = new RegExp(`<div\\b[^>]*class="[^"]*\\b${classFragment}\\b[^"]*"[^>]*>`, "i");
  const m = re.exec(html);
  if (!m) return "";
  const openEnd = m.index + m[0].length;
  let depth = 1;
  let pos = openEnd;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openEnd;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(openEnd, match.index);
      }
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }
    pos = tagRe.lastIndex;
  }
  return html.slice(openEnd, pos || html.length);
}
function extractEmojiMap(...htmlSources) {
  const map = {};
  const rx = /<i\b[^>]*class="[^"]*\bemoji\b[^"]*"[^>]*background-image:url\(['"]?([^'")]+)['"]?\)[^>]*>\s*<b>([^<]+)<\/b>\s*<\/i>/gi;
  for (const html of htmlSources) {
    if (!html) continue;
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(html)) !== null) {
      const rawUrl = m[1];
      const glyph = decodeEntities(m[2]).trim();
      if (glyph && rawUrl && !map[glyph]) {
        map[glyph] = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
      }
    }
  }
  return map;
}
function cleanEmojiHtml(html) {
  return String(html || "").replace(/<tg-emoji\b[^>]*>\s*<i\b[^>]*class="[^"]*\bemoji\b[^"]*"[^>]*>\s*<b>([\s\S]*?)<\/b>\s*<\/i>\s*<\/tg-emoji>/gi, "$1").replace(/<i\b[^>]*class="[^"]*\bemoji\b[^"]*"[^>]*>\s*<b>([\s\S]*?)<\/b>\s*<\/i>/gi, "$1").replace(/<tg-emoji\b[^>]*>([\s\S]*?)<\/tg-emoji>/gi, "$1");
}
function sanitizePostHtml(rawInner) {
  if (!rawInner) return "";
  let html = cleanEmojiHtml(rawInner);
  html = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '<span class="tg-link">$1</span>').replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, "<code>$1</code>").replace(/<br\s*\/?>/gi, "<br>").replace(/<(b|strong|i|em|u|s|code)\b[^>]*>/gi, "<$1>").replace(/<span\b[^>]*class="[^"]*tg-link[^"]*"[^>]*>/gi, '<span class="tg-link">').replace(/<span\b[^>]*>/gi, "<span>");
  html = html.replace(/<\/?([a-z0-9-]+)\b[^>]*>/gi, (full, tag) => {
    const lower = tag.toLowerCase();
    if (["b", "strong", "i", "em", "u", "s", "code", "br", "span"].includes(lower)) {
      if (full.startsWith("</")) return `</${lower}>`;
      if (lower === "br") return "<br>";
      if (lower === "span" && full.includes("tg-link")) return '<span class="tg-link">';
      return `<${lower}>`;
    }
    return "";
  });
  html = html.replace(/^(?:<br>\s*)+|(?:<br>\s*)+$/gi, "").trim();
  return html;
}
function formatMoscowTime(iso) {
  if (!iso) return { timeText: "", dateLabel: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { timeText: "", dateLabel: "" };
  try {
    const timeText = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
    const dateLabel = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
      month: "long"
    }).format(date);
    return { timeText, dateLabel };
  } catch {
    return {
      timeText: date.toISOString().slice(11, 16),
      dateLabel: date.toISOString().slice(0, 10)
    };
  }
}
function parseReactions(block) {
  const reactionsHtml = extractDivByClass(block, "tgme_widget_message_reactions");
  if (!reactionsHtml) return [];
  const items = [];
  const rx = /<span\b[^>]*class="([^"]*\btgme_reaction\b[^"]*)"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = rx.exec(reactionsHtml)) !== null) {
    const cls = m[1];
    const inner = m[2];
    const isStars = cls.includes("tgme_reaction_paid") || inner.includes("icon-telegram-stars");
    let emoji = "";
    if (isStars) {
      emoji = "\u2B50";
    } else {
      const bMatch = inner.match(/<b>([\s\S]*?)<\/b>/i);
      emoji = bMatch ? stripTags(bMatch[1]) : "";
    }
    const afterIcon = inner.replace(/<i\b[^>]*>[\s\S]*?<\/i>/gi, "");
    const count = stripTags(afterIcon);
    if ((emoji || isStars) && count) {
      items.push({ emoji: emoji || "\u2764", isStars, count });
    }
    if (items.length >= 6) break;
  }
  return items;
}
function parsePosts(sHtml) {
  const chunks = sHtml.split('<div class="tgme_widget_message_wrap').slice(1);
  const parsed = [];
  for (const chunk of chunks) {
    const postMatch = chunk.match(/data-post="([^"]+)"/);
    if (!postMatch) continue;
    const id = postMatch[1];
    const postNumMatch = id.match(/\/(\d+)$/);
    const postNum = postNumMatch ? Number(postNumMatch[1]) : 0;
    const replyBlock = extractDivByClass(chunk, "tgme_widget_message_reply");
    const cleanChunk = replyBlock ? chunk.replace(replyBlock, "") : chunk;
    const photos = [];
    const photoRx = /class="[^"]*\btgme_widget_message_photo_wrap\b[^"]*"[^>]*style="[^"]*background-image:url\(['"]?([^'")]+)['"]?\)/gi;
    let pm;
    while ((pm = photoRx.exec(cleanChunk)) !== null) {
      if (pm[1] && !photos.includes(pm[1])) photos.push(pm[1]);
    }
    let roundVideo = null;
    if (cleanChunk.includes("tgme_widget_message_roundvideo_player")) {
      const rvBlock = extractDivByClass(cleanChunk, "tgme_widget_message_roundvideo_player");
      const thumb = rvBlock.match(/tgme_widget_message_roundvideo_thumb[^>]*background-image:url\(['"]?([^'")]+)['"]?\)/i)?.[1] || "";
      const src = rvBlock.match(/<video\b[^>]*src="([^"]+)"/i)?.[1] || "";
      const duration = stripTags(rvBlock.match(/tgme_widget_message_roundvideo_duration[^>]*>([^<]+)</i)?.[1] || "");
      if (src || thumb) {
        roundVideo = { src, thumb, duration };
      }
    }
    let video = null;
    if (!roundVideo && cleanChunk.includes("tgme_widget_message_video_player")) {
      const vStart = cleanChunk.indexOf("tgme_widget_message_video_player");
      const vSlice = cleanChunk.slice(Math.max(0, vStart - 80), vStart + 3500);
      const thumb = vSlice.match(/tgme_widget_message_video_thumb[^>]*background-image:url\(['"]?([^'")]+)['"]?\)/i)?.[1] || "";
      const src = vSlice.match(/<video\b[^>]*src="([^"]+)"/i)?.[1] || "";
      const duration = stripTags(vSlice.match(/message_video_duration[^>]*>([^<]+)</i)?.[1] || "");
      if (src || thumb) {
        video = { src, thumb, duration };
      }
    }
    const textInner = extractDivByClass(cleanChunk, "tgme_widget_message_text");
    const textHtml = sanitizePostHtml(textInner);
    if (!textHtml && photos.length === 0 && !video && !roundVideo) {
      continue;
    }
    const reactions = parseReactions(cleanChunk);
    const views = stripTags(cleanChunk.match(/<span class="tgme_widget_message_views">([^<]+)<\/span>/i)?.[1] || "");
    const metaBlock = cleanChunk.match(/<span class="tgme_widget_message_meta">([\s\S]*?)<\/span>/i)?.[1] || "";
    const edited = /\bedited\b|изменено/i.test(metaBlock);
    const datetime = cleanChunk.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1] || "";
    const { timeText, dateLabel } = formatMoscowTime(datetime);
    const repliesMatch = cleanChunk.match(/tgme_widget_message_replies[^>]*>[\s\S]*?(\d[\d\s.,Kk]*)\s*(?:comment|коммент)/i);
    const commentsCount = repliesMatch ? repliesMatch[1].trim() : null;
    parsed.push({
      id,
      postNum,
      datetime,
      timeText,
      dateLabel,
      edited,
      views,
      commentsCount,
      photos,
      roundVideo,
      video,
      textHtml,
      reactions
    });
  }
  return parsed.slice(-8);
}
async function fetchTelegramChannel(rawChannel = "heleNyssss") {
  const slug = String(rawChannel || "heleNyssss").replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "") || "heleNyssss";
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"
  };
  const [mainRes, previewRes] = await Promise.all([
    fetch(`https://t.me/${encodeURIComponent(slug)}`, { headers }),
    fetch(`https://t.me/s/${encodeURIComponent(slug)}`, { headers })
  ]);
  if (!previewRes.ok) {
    throw new Error(`Telegram preview HTTP ${previewRes.status}`);
  }
  const [mainHtml, sHtml] = await Promise.all([
    mainRes.ok ? mainRes.text() : Promise.resolve(""),
    previewRes.text()
  ]);
  const rawTitleHtml = sHtml.match(/<div class="tgme_channel_info_header_title">([\s\S]*?)<\/div>/i)?.[1] || mainHtml.match(/<div class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || slug;
  const title = stripTags(cleanEmojiHtml(rawTitleHtml)) || slug;
  const rawExtra = mainHtml.match(/<div class="tgme_page_extra">([\s\S]*?)<\/div>/i)?.[1] || "";
  const rawCounter = sHtml.match(/<span class="counter_value">([^<]+)<\/span>\s*<span class="counter_type">subscribers/i)?.[1] || "";
  const subscribers = formatSubscriberLabel(stripTags(rawExtra), stripTags(rawCounter));
  const avatarUrl = mainHtml.match(/<img\b[^>]*class="[^"]*\btgme_page_photo_image\b[^"]*"[^>]*src="([^"]+)"/i)?.[1] || sHtml.match(/<i\b[^>]*class="[^"]*\btgme_widget_message_user_photo\b[^"]*"[^>]*>\s*<img\b[^>]*src="([^"]+)"/i)?.[1] || "";
  const emojiMap = extractEmojiMap(sHtml, mainHtml);
  const posts = parsePosts(sHtml);
  return {
    channel: slug,
    handle: `@${slug}`,
    url: `https://t.me/${slug}`,
    title,
    subscribers,
    avatarUrl,
    emojiMap,
    posts,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/update-tg-static-entry.js
var __dirname = dirname(fileURLToPath(import.meta.url));
var pagesRoot = resolve(__dirname, "..");
var channel = (process.env.TG_CHANNEL || "heleNyssss").replace(/^@/, "").trim() || "heleNyssss";
async function main() {
  const data = await fetchTelegramChannel(channel);
  const assetsDir = resolve(pagesRoot, "assets");
  const dataDir = resolve(pagesRoot, "data");
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  const avatarPath = resolve(assetsDir, "avatar.jpg");
  let avatarChanged = false;
  if (data.avatarUrl && data.avatarUrl.startsWith("https://")) {
    try {
      const res = await fetch(data.avatarUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (res.ok) {
        const nextBytes = Buffer.from(await res.arrayBuffer());
        if (nextBytes.byteLength > 200) {
          const prevBytes = existsSync(avatarPath) ? readFileSync(avatarPath) : null;
          if (!prevBytes || !prevBytes.equals(nextBytes)) {
            writeFileSync(avatarPath, nextBytes);
            avatarChanged = true;
          }
        }
      }
    } catch {
    }
  }
  if (existsSync(avatarPath) && statSync(avatarPath).size > 200) {
    data.avatarLocalUrl = "./assets/avatar.jpg";
  }
  const outJsonPath = resolve(dataDir, "tg.json");
  const stripVolatility = (obj) => JSON.stringify({ ...obj, fetchedAt: "" });
  if (!avatarChanged && existsSync(outJsonPath)) {
    try {
      const prevData = JSON.parse(readFileSync(outJsonPath, "utf8"));
      if (stripVolatility(prevData) === stripVolatility(data)) {
        console.log(`[OK] @${data.channel} feed unchanged`);
        return;
      }
    } catch {
    }
  }
  writeFileSync(outJsonPath, `${JSON.stringify(data, null, 2)}
`, "utf8");
  console.log(`[OK] Updated data/tg.json (${data.posts.length} posts)`);
}
main().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
