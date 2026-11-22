// MissAV JS source module for GuoApp.
// Behaviour ported from iDuanJu MissAVProvider (GPL-3.0); HTML/Packer parsing
// follows the publicly documented UAV-Downloader MissAV parser (Apache-2.0).
// This module does not include the upstream app's WebView-based Cloudflare solver.

const MIRRORS = [
  "https://missav.fans",
  "https://missav.media",
  "https://missav.ai",
  "https://missav.ws",
  "https://missav.live"
];
const PROBE_PATH = "/dm539/cn/new";
const CACHE_KEY = "missav.activeMirror.v1";
const CACHE_TTL = 30 * 60 * 1000;
const VIDEO_HOST = "https://surrit.mrstcdn.store";
const COVER_HOST = "https://fourhoi.mrstcdn.store";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6"
};

const CATEGORIES = [
  { id: "today-hot", name: "今日热门", path: "/dm298/cn/today-hot" },
  { id: "weekly-hot", name: "本周热门", path: "/dm170/cn/weekly-hot" },
  { id: "monthly-hot", name: "月度热门", path: "/dm266/cn/monthly-hot" },
  { id: "chinese-subtitle", name: "中文字幕", path: "/dm278/cn/chinese-subtitle?sort=released_at" },
  { id: "chinese-subtitle-week", name: "中文字幕·本周最多看", path: "/dm278/cn/chinese-subtitle?sort=weekly_views" },
  { id: "release", name: "最新发布", path: "/dm632/cn/release?sort=released_at" },
  { id: "new", name: "最近更新", path: "/dm539/cn/new" },
  { id: "uncensored-leak", name: "无码流出", path: "/dm816/cn/uncensored-leak?sort=released_at" },
  { id: "fc2", name: "FC2", path: "/dm473/cn/fc2?sort=released_at" },
  { id: "siro", name: "SIRO 素人", path: "/dm36/cn/siro?sort=released_at" },
  { id: "madou", name: "麻豆", path: "/dm63/cn/madou?sort=released_at" }
];
const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(function (item) { return [item.id, item]; }));

function str(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function decodeHTML(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, function (all, hex) {
      const n = parseInt(hex, 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    })
    .replace(/&#([0-9]+);/g, function (all, dec) {
      const n = parseInt(dec, 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'");
}

function clean(value) {
  return decodeHTML(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function headersFor(referer) {
  const headers = {};
  Object.keys(HEADERS).forEach(function (key) { headers[key] = HEADERS[key]; });
  headers.Referer = referer || MIRRORS[0] + "/";
  return headers;
}

function request(url, referer, timeoutMs) {
  const response = host.fetch({
    method: "GET",
    url: url,
    headers: headersFor(referer),
    timeoutMs: timeoutMs || 18000
  }) || {};
  return {
    status: Number(response.status || 0),
    body: str(response.body),
    url: str(response.url) || url,
    headers: response.headers || {}
  };
}

function isChallenge(html) {
  const source = String(html || "");
  const lower = source.toLowerCase();
  const hasContent = lower.indexOf("thumbnail") >= 0 ||
    lower.indexOf("text-secondary") >= 0 ||
    lower.indexOf("fourhoi") >= 0 ||
    lower.indexOf("surrit") >= 0;
  if (hasContent && source.length > 12000) return false;
  const title = clean((source.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").toLowerCase();
  if (["just a moment", "请稍候", "請稍候", "attention required", "please wait"].some(function (v) { return title.indexOf(v) >= 0; })) return true;
  return lower.indexOf("verify you are human") >= 0 ||
    lower.indexOf("performing security verification") >= 0 ||
    lower.indexOf("checking your browser") >= 0 ||
    lower.indexOf("cf-browser-verification") >= 0 ||
    lower.indexOf("challenge-platform") >= 0 && source.length < 20000;
}

function looksLikeList(html) {
  const lower = String(html || "").toLowerCase();
  return !isChallenge(html) && (
    lower.indexOf('class="thumbnail') >= 0 ||
    lower.indexOf("text-secondary") >= 0 ||
    lower.indexOf("fourhoi") >= 0 ||
    lower.indexOf("surrit") >= 0
  );
}

function cacheRead() {
  try {
    const value = str(host.cacheGet(CACHE_KEY));
    if (value === "") return "";
    const parsed = JSON.parse(value);
    return MIRRORS.indexOf(parsed.url) >= 0 ? parsed.url : "";
  } catch (error) {
    return "";
  }
}

function cacheWrite(url) {
  try {
    host.cacheSet(CACHE_KEY, JSON.stringify({ url: url, updatedAt: Date.now() }), CACHE_TTL);
  } catch (error) {}
}

function discoverMirror(force) {
  if (!force) {
    const cached = cacheRead();
    if (cached) return cached;
  }
  const report = [];
  for (const mirror of MIRRORS) {
    try {
      const result = request(mirror + PROBE_PATH, mirror + "/", 14000);
      if (result.status >= 200 && result.status < 400 && looksLikeList(result.body)) {
        cacheWrite(mirror);
        return mirror;
      }
      report.push(mirror.replace("https://", "") + " HTTP " + result.status +
        (isChallenge(result.body) ? " Cloudflare" : " 页面结构不匹配"));
    } catch (error) {
      report.push(mirror.replace("https://", "") + " " + str(error && error.message || error).slice(0, 100));
    }
  }
  throw new Error("MissAV 当前没有可用镜像：" + report.join("；") +
    "。此模块不具备 App 内 WebView 验证能力，若所有镜像均触发 Cloudflare，请稍后重试或使用可正常访问的网络。");
}

function getPage(path, referer) {
  let mirror = discoverMirror(false);
  const address = mirror + (path.charAt(0) === "/" ? path : "/" + path);
  try {
    const result = request(address, referer || mirror + "/", 20000);
    if (result.status >= 200 && result.status < 400 && !isChallenge(result.body)) return result;
    throw new Error("HTTP " + result.status + (isChallenge(result.body) ? " Cloudflare 验证页" : ""));
  } catch (firstError) {
    try {
      mirror = discoverMirror(true);
      const retryUrl = mirror + (path.charAt(0) === "/" ? path : "/" + path);
      const retry = request(retryUrl, mirror + "/", 20000);
      if (retry.status >= 200 && retry.status < 400 && !isChallenge(retry.body)) return retry;
      throw new Error("HTTP " + retry.status + (isChallenge(retry.body) ? " Cloudflare 验证页" : ""));
    } catch (retryError) {
      throw new Error("MissAV 页面请求失败：" + str(retryError && retryError.message || retryError));
    }
  }
}

function originOf(url) {
  const match = String(url || "").match(/^(https?:\/\/[^/]+)/i);
  return match ? match[1] : MIRRORS[0];
}

function pagePath(path, page) {
  const number = Math.max(1, Number(page || 1) || 1);
  if (number <= 1) return path;
  return path + (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + number;
}

function extractCards(html, base) {
  const source = String(html || "");
  const starts = [];
  const marker = /class="thumbnail/g;
  let match;
  while ((match = marker.exec(source)) !== null) starts.push(match.index);
  const items = [];
  const seen = {};
  for (let i = 0; i < starts.length; i++) {
    const chunk = source.slice(starts[i], Math.min(starts[i] + 7000, i + 1 < starts.length ? starts[i + 1] : source.length));
    const href = (chunk.match(/<a[^>]+href="([^"]+)"/i) || [])[1] || "";
    if (!href || href.indexOf("/search/") >= 0) continue;
    const resolved = href.indexOf("http") === 0 ? href : base + (href.charAt(0) === "/" ? href : "/" + href);
    const pathMatch = resolved.match(/\/([^/?#]+)\/?(?:[?#].*)?$/);
    const id = pathMatch ? pathMatch[1] : "";
    if (!id || !/[0-9]/.test(id) || seen[id]) continue;
    seen[id] = true;

    const imgTag = (chunk.match(/<img\b[^>]*>/i) || [])[0] || "";
    let image = (imgTag.match(/\bdata-src="([^"]+)"/i) || [])[1] ||
      (imgTag.match(/\bsrc="([^"]+)"/i) || [])[1] || "";
    image = decodeHTML(image);
    if (image.indexOf("fourhoi.com") >= 0) image = image.replace(/fourhoi\.com/gi, "fourhoi.mrstcdn.store");
    if (!image || image.indexOf("data:") === 0 || /\.mp4(?:$|\?)/i.test(image)) {
      image = COVER_HOST + "/" + id.toLowerCase() + "/cover-t.jpg";
    } else if (image.indexOf("//") === 0) {
      image = "https:" + image;
    } else if ((image.indexOf("http://") !== 0 && image.indexOf("https://") !== 0)) {
      image = resolveUrl(base, image);
    }

    let title = (chunk.match(/<div class="my-2[^"]*">\s*<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "";
    title = clean(title);
    if (!title) title = decodeHTML((imgTag.match(/\balt="([^"]*)"/i) || [])[1] || "");
    if (!title) title = id.toUpperCase();
    const duration = clean((chunk.match(/bottom-1 right-1[^"]*">\s*([0-9:]+)\s*</i) || [])[1] || "");
    items.push({
      sourceId: id,
      title: title,
      cover: image,
      duration: duration,
      pageUrl: resolved
    });
  }
  return items;
}

function toDrama(item) {
  return {
    id: host.dramaId(item.sourceId),
    source: host.source,
    sourceId: item.sourceId,
    title: item.title,
    name: item.title,
    desc: item.duration ? "时长 " + item.duration : "",
    intro: "",
    cover: item.cover,
    categoryName: "MissAV",
    totalEpisode: 1,
    releaseStatus: "已发布"
  };
}

function parseField(html, labels) {
  const pattern = new RegExp("<span>(?:" + labels + "):</span>([\\s\\S]*?)</div>", "i");
  const match = String(html || "").match(pattern);
  return match ? match[1] : "";
}

function detailData(html, item, pageUrl) {
  const title = decodeHTML((html.match(/og:title"\s+content="([^"]+)"/i) || [])[1] || item.title);
  const image = (html.match(/og:image"\s+content="([^"]+)"/i) || [])[1] || "";
  const date = (html.match(/<time datetime="[^"]*"[^>]*>([^<]+)<\/time>/i) || [])[1] || "";
  const code = clean(parseField(html, "番號|番号")) || ((title.match(/[A-Z0-9]+-[0-9]+/i) || [])[0] || "");
  const actorsHtml = parseField(html, "女優|女优");
  const tagsHtml = parseField(html, "類型|类型");
  const maker = clean(parseField(html, "發行商|发行商"));
  const actors = [];
  const tags = [];
  const linkPattern = /<a[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = linkPattern.exec(actorsHtml)) !== null) actors.push(clean(m[1]));
  while ((m = linkPattern.exec(tagsHtml)) !== null) tags.push(clean(m[1]));
  const meta = [];
  if (code) meta.push("番号 " + code);
  if (date) meta.push("发行 " + clean(date));
  const description = decodeHTML((html.match(/og:description"\s+content="([^"]*)"/i) || [])[1] || "");
  const cover = image ? (image.indexOf("//") === 0 ? "https:" + image :
    ((image.indexOf("http://") === 0 || image.indexOf("https://") === 0) ? image : resolveUrl(originOf(pageUrl), image))) :
    COVER_HOST + "/" + item.sourceId.toLowerCase() + "/cover-n.jpg";
  return {
    drama: {
      id: host.dramaId(item.sourceId),
      source: host.source,
      sourceId: item.sourceId,
      title: title,
      name: title,
      desc: [meta.join(" · "), description].filter(Boolean).join("\n"),
      intro: description,
      cover: cover,
      totalEpisode: 1,
      releaseStatus: "已发布",
      actors: actors,
      tags: Array.from(new Set(tags)).slice(0, 24),
      author: maker
    },
    chapters: [{
      id: host.chapterId(item.sourceId, "video"),
      source: host.source,
      title: "正片",
      currentEpisode: 1,
      pageUrl: pageUrl,
      referer: pageUrl,
      duration: item.duration || ""
    }],
    actors: actors,
    tags: tags,
    maker: maker
  };
}

function toBase(number, base) {
  const digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (number === 0) return "0";
  let value = number;
  let output = "";
  while (value > 0) {
    output = digits.charAt(value % base) + output;
    value = Math.floor(value / base);
  }
  return output;
}

function unpackPacker(script) {
  const pattern = /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([^']*)'\.split\('\|'\)/;
  const match = String(script || "").match(pattern);
  if (!match) return "";
  const base = Number(match[2]);
  const count = Number(match[3]);
  if (base <= 1 || base > 62 || count < 0 || count > 200000) return "";
  const packed = match[1];
  const words = match[4].split("|");
  const lookup = {};
  for (let i = 0; i < count; i++) {
    const key = toBase(i, base);
    lookup[key] = words[i] || key;
  }
  return packed.replace(/\b(\w+)\b/g, function (token) {
    return Object.prototype.hasOwnProperty.call(lookup, token) ? lookup[token] : token;
  }).replace(/\\'/g, "'");
}

function videoSource(html) {
  const raw = String(html || "")
    .replace(/\\\//g, "/")
    .replace(/\\u002f/gi, "/")
    .replace(/&amp;/gi, "&");
  const scripts = raw.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  const sources = [raw];
  for (const tag of scripts) {
    const script = tag.replace(/^<script\b[^>]*>|<\/script>$/gi, "");
    sources.push(script);
    const unpacked = unpackPacker(script);
    if (unpacked) sources.push(unpacked);
  }

  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const compactUuidPattern = /[0-9a-f]{32}/i;
  const hostPattern = "(?:surrit|nineyu|fourhoi)(?:\\.[a-z0-9.-]+)";
  const fullUrlPattern = new RegExp(
    "https?:\\\\/\\\\/" + hostPattern + "\\\\/" +
    uuidPattern.source + "\\\\/(?:playlist\\\\.m3u8|(?:1080|720|480|360)p\\\\/video\\\\.m3u8)",
    "i"
  );

  function formatUuid(value) {
    const hex = String(value || "").replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(hex)) return "";
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" +
      hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function makeSource(uuid, origin, url) {
    const id = formatUuid(uuid);
    if (!id) return null;
    const base = origin || "https://surrit.com";
    return {
      url: url || base + "/" + id + "/playlist.m3u8",
      uuid: id,
      origin: base
    };
  }

  for (const text of sources) {
    const direct = String(text).match(fullUrlPattern);
    if (direct) {
      const url = direct[0];
      const id = url.match(uuidPattern);
      if (id) return makeSource(id[0], originOf(url), url);
    }

    // Current page scripts often expose the UUID followed by /seek rather than a full URL.
    const domainPath = String(text).match(new RegExp(
      "(" + hostPattern + ")/(" + uuidPattern.source + ")/(?:seek|playlist\\\\.m3u8|)", "i"
    ));
    if (domainPath) {
      const host = domainPath[1];
      const protocolHost = "https://" + host;
      return makeSource(domainPath[2], protocolHost);
    }

    // Some packed variants split the hostname and UUID into tokens; recover UUID around seek.
    if (/seek/i.test(text)) {
      const id = String(text).match(uuidPattern);
      if (id) return makeSource(id[0], "https://surrit.com");
      const seekAt = String(text).toLowerCase().indexOf("seek");
      if (seekAt >= 32) {
        const before = String(text).slice(Math.max(0, seekAt - 48), seekAt);
        const compact = before.match(compactUuidPattern);
        if (compact) return makeSource(compact[0], "https://surrit.com");
      }
    }

    // Fallback: packed token sequences can contain the UUID as 32 hexadecimal characters.
    const packed = String(text).match(/m3u8\|([a-f0-9|]{32,80})\|(?:com|store)\|(surrit|nineyu|fourhoi)\|https/i);
    if (packed) {
      const parts = packed[1].split("|").reverse();
      const compact = parts.join("");
      const uuid = formatUuid(compact);
      if (uuid) return makeSource(uuid, "https://" + packed[2] + ".com");
    }
  }
  return null;
}
function resolveUrl(base, relative) {
  try {
    return host.resolveUrl(base, relative);
  } catch (error) {
    if (/^https?:\/\//i.test(relative)) return relative;
    return base.replace(/\/+$/, "") + "/" + String(relative || "").replace(/^\/+/, "");
  }
}

function validPlaylist(body) {
  return String(body || "").indexOf("#EXTM3U") >= 0 &&
    (String(body).indexOf("#EXTINF") >= 0 ||
     String(body).indexOf("#EXT-X-STREAM-INF") >= 0 ||
     String(body).indexOf("#EXT-X-TARGETDURATION") >= 0);
}

function playlistVariants(master, masterUrl, referer) {
  const lines = String(master || "").split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
    let uri = "";
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (candidate && candidate.charAt(0) !== "#") { uri = candidate; break; }
    }
    if (!uri) continue;
    const resolution = (lines[i].match(/RESOLUTION=\d+x(\d+)/i) || [])[1];
    const height = Number(resolution || 0);
    variants.push({
      url: resolveUrl(masterUrl, uri),
      quality: height > 0 ? height + "P" : "自动",
      height: height,
      referer: referer,
      headers: { "User-Agent": UA, "Referer": referer }
    });
  }
  return variants;
}

function probeStreams(source, site) {
  const referer = site + "/";
  const streamHeaders = { "User-Agent": UA, "Referer": referer, "Origin": site };
  const uuid = source.uuid;
  const origins = Array.from(new Set([source.origin, "https://surrit.com", VIDEO_HOST]));
  const diagnostics = [];
  const variants = [];

  function inspect(address, timeoutMs, quality, height, isDirect) {
    try {
      const response = host.fetch({
        method: "GET",
        url: address,
        headers: streamHeaders,
        timeoutMs: timeoutMs
      }) || {};
      const status = Number(response.status || 0);
      const body = str(response.body);
      const headers = response.headers || {};
      let contentType = "";
      Object.keys(headers).some(function (key) {
        if (key.toLowerCase() === "content-type") {
          contentType = str(headers[key]);
          return true;
        }
        return false;
      });
      if (status >= 200 && status < 400 && validPlaylist(body)) {
        variants.push({
          url: address,
          quality: quality,
          height: height,
          referer: referer,
          headers: streamHeaders
        });
        diagnostics.push(address.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/") +
          " HTTP " + status + " " + (contentType || "content-type?") + " HLS有效");
        return true;
      }
      const preview = body.replace(/\s+/g, " ").slice(0, 100)
        .replace(/(cookie|token|authorization|sign|signature)=([^&\s]+)/ig, "$1=[redacted]");
      diagnostics.push(address.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/") +
        " HTTP " + status + " " + (contentType || "content-type?") +
        (preview ? " body=" + preview : "") + (isDirect ? " [页面原始地址]" : ""));
    } catch (error) {
      diagnostics.push(address.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/") +
        " fetch-error=" + str(error && error.message || error).slice(0, 100));
    }
    return false;
  }

  // 优先请求页面脚本实际提供的完整 URL，不丢弃 CDN hostname。
  if (source.url) inspect(source.url, 10000, "自动", 0, true);

  const paths = [
    { path: "/" + uuid + "/playlist.m3u8", quality: "自动", height: 0 },
    { path: "/" + uuid + "/1080p/video.m3u8", quality: "1080P", height: 1080 },
    { path: "/" + uuid + "/720p/video.m3u8", quality: "720P", height: 720 },
    { path: "/" + uuid + "/480p/video.m3u8", quality: "480P", height: 480 },
    { path: "/" + uuid + "/360p/video.m3u8", quality: "360P", height: 360 }
  ];
  for (const origin of origins) {
    for (const candidate of paths) {
      const address = origin + candidate.path;
      if (variants.some(function (item) { return item.url === address; })) continue;
      inspect(address, 7000, candidate.quality, candidate.height, false);
    }
  }

  variants.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
  if (!variants.length) {
    throw new Error("MissAV 视频 CDN 无可用 HLS 清单；探测结果：" + diagnostics.slice(0, 12).join("；"));
  }
  return {
    url: variants[0].url,
    referer: referer,
    headers: streamHeaders,
    variants: variants
  };
}
function sourceIdFromTask(task) {
  const drama = str(task && task.dramaId);
  const chapter = str(task && task.chapter && task.chapter.id);
  let value = "";
  if (drama.indexOf(":") >= 0) value = drama.split(":").slice(1).join(":");
  if (!value && chapter.indexOf(":") >= 0) {
    const parts = chapter.split(":");
    if (parts.length >= 3) value = parts.slice(1, -1).join(":");
  }
  return value;
}

function pathFromUrl(url, fallback) {
  const value = str(url);
  const match = value.match(/^https?:\/\/[^/]+(\/[^?#]*)?(?:[?#].*)?$/i);
  return match && match[1] ? match[1] : fallback;
}

module.exports = {
  validCategory(category) {
    return !category || Object.prototype.hasOwnProperty.call(CATEGORY_MAP, category);
  },

  categories() {
    return CATEGORIES.map(function (item) { return { id: item.id, name: item.name }; });
  },

  catalogPage(page, category) {
    if (!this.validCategory(category)) throw new Error("MissAV 没有分类：" + category);
    const selected = category ? CATEGORY_MAP[category] : CATEGORY_MAP["new"];
    const result = getPage(pagePath(selected.path, page), "");
    const cards = extractCards(result.body, originOf(result.url));
    const items = cards.map(toDrama);
    const next = Number(page || 1) + 1;
    const hasMore = items.length > 0 &&
      (result.body.indexOf("page=" + next) >= 0 || items.length >= 24);
    return { items: items, hasMore: hasMore };
  },

  search(page, query) {
    const keyword = str(query);
    if (!keyword) return { items: [], hasMore: false };
    const result = getPage(pagePath("/cn/search/" + encodeURIComponent(keyword), page), "");
    const cards = extractCards(result.body, originOf(result.url));
    return { items: cards.map(toDrama), hasMore: cards.length > 0 && result.body.indexOf("page=" + (Number(page || 1) + 1)) >= 0 };
  },

  detail(sourceId) {
    const id = str(sourceId);
    if (!id) throw new Error("MissAV 缺少视频标识");
    const result = getPage("/cn/" + id, "");
    const item = { sourceId: id, title: clean((result.body.match(/og:title"\s+content="([^"]+)"/i) || [])[1] || id), cover: "", duration: "" };
    const parsed = detailData(result.body, item, result.url);
    return { drama: parsed.drama, chapters: parsed.chapters };
  },

  resolveMedia(task) {
    const id = sourceIdFromTask(task);
    if (!id) throw new Error("MissAV 无法确定视频标识");
    const savedPage = str(task && task.chapter && task.chapter.pageUrl);
    const path = pathFromUrl(savedPage, "/cn/" + id);
    const result = getPage(path, savedPage || "");
    const source = videoSource(result.body);
    if (!source) throw new Error("MissAV 页面没有找到 surrit 播放地址，播放器脚本结构可能已变化");
    const media = probeStreams(source, originOf(result.url));
    return host.finishMedia(media);
  }
};
