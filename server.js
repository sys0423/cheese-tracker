import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
// Electron packages application files as read-only, so its main process supplies
// a writable per-user directory through CHZZK_DATA_DIR.
const dataDir = process.env.CHZZK_DATA_DIR || join(root, "data");
const configPath = join(dataDir, "config.json");
const donationsPath = join(dataDir, "donations.ndjson");
const port = Number(process.env.PORT || 5177);
const openApiBase = "https://openapi.chzzk.naver.com";
const authBase = "https://chzzk.naver.com/account-interlock";

mkdirSync(dataDir, { recursive: true });

let oauthState = "";

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function getConfig() {
  return {
    clientId: process.env.CHZZK_CLIENT_ID || "",
    clientSecret: process.env.CHZZK_CLIENT_SECRET || "",
    redirectUri: `http://localhost:${port}/oauth/callback`,
    ...readJson(configPath, {})
  };
}

function saveConfig(next) {
  const current = readJson(configPath, {});
  const nextSecret = Object.hasOwn(next, "clientSecret")
    ? String(next.clientSecret || "").trim()
    : current.clientSecret || "";
  const redirectUri = String(next.redirectUri || `http://localhost:${port}/oauth/callback`)
    .trim()
    .replace(/^URL\s+/i, "");
  writeJson(configPath, {
    ...current,
    clientId: String(next.clientId || "").trim(),
    clientSecret: nextSecret,
    redirectUri
  });
}

function publicConfig(config) {
  return {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    hasClientSecret: Boolean(config.clientSecret),
    hasAccessToken: Boolean(config.accessToken),
    tokenExpiresAt: config.tokenExpiresAt || null,
    scope: config.scope || ""
  };
}

function donations() {
  if (!existsSync(donationsPath)) return [];
  return readFileSync(donationsPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function donationKey(donation) {
  const stable = [
    donation.channelId,
    donation.donatorChannelId,
    donation.donatorNickname,
    donation.payAmount,
    donation.donationText,
    donation.receivedAt
  ].join("|");
  return createHash("sha256").update(stable).digest("hex").slice(0, 24);
}

function addDonation(raw) {
  const payAmount = Number(String(raw.payAmount || "0").replace(/[^\d.-]/g, "")) || 0;
  const donation = {
    id: raw.id || "",
    receivedAt: raw.receivedAt || new Date().toISOString(),
    donationType: raw.donationType || "",
    channelId: raw.channelId || "",
    donatorChannelId: raw.donatorChannelId || "",
    donatorNickname: raw.donatorNickname || "익명",
    payAmount,
    donationText: raw.donationText || "",
    raw
  };
  donation.id = donation.id || donationKey(donation);
  appendFileSync(donationsPath, `${JSON.stringify(donation)}\n`, "utf8");
  return donation;
}

function summarize(rows) {
  const byDonator = new Map();
  let totalAmount = 0;
  for (const row of rows) {
    totalAmount += row.payAmount || 0;
    const key = row.donatorChannelId || row.donatorNickname || "unknown";
    const item = byDonator.get(key) || {
      donatorChannelId: row.donatorChannelId,
      nickname: row.donatorNickname,
      amount: 0,
      count: 0,
      lastAt: row.receivedAt
    };
    item.amount += row.payAmount || 0;
    item.count += 1;
    item.lastAt = row.receivedAt > item.lastAt ? row.receivedAt : item.lastAt;
    byDonator.set(key, item);
  }
  const top = [...byDonator.values()].sort((a, b) => b.amount - a.amount);
  return { totalAmount, count: rows.length, donorCount: top.length, top };
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function chzzkFetch(path, options = {}) {
  const response = await fetch(`${openApiBase}${path}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok || (data && data.code && data.code !== 200)) {
    const message = data?.message || data?.code || response.statusText;
    throw new Error(`CHZZK API error: ${message}`);
  }
  return data?.content ?? data;
}

async function ensureAccessToken() {
  const config = getConfig();
  if (!config.accessToken) throw new Error("치지직 로그인이 필요합니다.");
  const expiresAt = Number(config.tokenExpiresAt || 0);
  if (!config.refreshToken || Date.now() < expiresAt - 60_000) return config.accessToken;

  const content = await chzzkFetch("/auth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "refresh_token",
      refreshToken: config.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret
    })
  });
  writeJson(configPath, {
    ...config,
    accessToken: content.accessToken,
    refreshToken: content.refreshToken,
    tokenExpiresAt: Date.now() + Number(content.expiresIn || 86400) * 1000,
    scope: content.scope || config.scope || ""
  });
  return content.accessToken;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function routeApi(req, res, url) {
  if (url.pathname === "/api/config" && req.method === "GET") {
    return send(res, 200, publicConfig(getConfig()));
  }
  if (url.pathname === "/api/config" && req.method === "POST") {
    saveConfig(await readBody(req));
    return send(res, 200, publicConfig(getConfig()));
  }
  if (url.pathname === "/api/oauth/url" && req.method === "GET") {
    const config = getConfig();
    if (!config.clientId || !config.redirectUri) throw new Error("Client ID와 Redirect URI를 먼저 저장하세요.");
    if (!/^https?:\/\//i.test(config.redirectUri)) {
      throw new Error("Redirect URI는 http:// 또는 https://로 시작해야 합니다.");
    }
    oauthState = randomBytes(16).toString("hex");
    const params = new URLSearchParams({ clientId: config.clientId, redirectUri: config.redirectUri, state: oauthState });
    return send(res, 200, { url: `${authBase}?${params}` });
  }
  if (url.pathname === "/api/session-url" && req.method === "POST") {
    const token = await ensureAccessToken();
    const content = await chzzkFetch("/open/v1/sessions/auth", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
    return send(res, 200, content);
  }
  if (url.pathname === "/api/subscribe-donation" && req.method === "POST") {
    const { sessionKey } = await readBody(req);
    if (!sessionKey) throw new Error("sessionKey가 없습니다.");
    const token = await ensureAccessToken();
    const params = new URLSearchParams({ sessionKey });
    const content = await chzzkFetch(`/open/v1/sessions/events/subscribe/donation?${params}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
    return send(res, 200, content || { ok: true });
  }
  if (url.pathname === "/api/donations" && req.method === "GET") {
    const rows = donations().sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    return send(res, 200, { rows, summary: summarize(rows) });
  }
  if (url.pathname === "/api/donations" && req.method === "POST") {
    const donation = addDonation(await readBody(req));
    return send(res, 200, donation);
  }
  if (url.pathname === "/api/test-donation" && req.method === "POST") {
    const donation = addDonation({
      donationType: "CHAT",
      channelId: "test-channel",
      donatorChannelId: `test-${Date.now()}`,
      donatorNickname: "테스트후원자",
      payAmount: 1000,
      donationText: "테스트 후원입니다."
    });
    return send(res, 200, donation);
  }
  if (url.pathname === "/api/export.csv" && req.method === "GET") {
    const header = ["receivedAt", "donatorNickname", "donatorChannelId", "payAmount", "donationType", "donationText", "channelId"];
    const lines = [header.join(",")];
    for (const row of donations()) {
      lines.push(header.map((key) => csvEscape(row[key])).join(","));
    }
    return send(res, 200, lines.join("\r\n"), "text/csv; charset=utf-8");
  }
  return false;
}

async function handleOAuthCallback(req, res, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== oauthState) {
    return send(res, 400, "OAuth state가 맞지 않습니다. 다시 로그인해 주세요.", "text/plain; charset=utf-8");
  }
  const config = getConfig();
  const content = await chzzkFetch("/auth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "authorization_code",
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      state
    })
  });
  writeJson(configPath, {
    ...config,
    accessToken: content.accessToken,
    refreshToken: content.refreshToken,
    tokenExpiresAt: Date.now() + Number(content.expiresIn || 86400) * 1000,
    scope: content.scope || ""
  });
  redirect(res, "/?login=ok");
}

function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = normalize(join(publicDir, pathname));
  if (!target.startsWith(publicDir) || !existsSync(target)) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml"
  }[extname(target)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(target).pipe(res);
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await routeApi(req, res, url);
      if (handled === false) send(res, 404, { error: "Unknown API" });
      return;
    }
    if (url.pathname === "/oauth/callback") return await handleOAuthCallback(req, res, url);
    serveStatic(req, res, url);
  } catch (error) {
    send(res, 500, { error: error.message || String(error) });
  }
}).listen(port, () => {
  console.log(`Cheese Tracker running at http://localhost:${port}`);
  console.log("이 창을 닫으면 서버가 종료됩니다.");
});
