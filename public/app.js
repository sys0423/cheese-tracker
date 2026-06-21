const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium" });

const text = {
  anonymous: "\uc775\uba85",
  loginDone: "\ub85c\uadf8\uc778 \uc644\ub8cc",
  setupNeeded: "\uc124\uc815 \ud544\uc694",
  currentScope: "\ud604\uc7ac Scope",
  noDonations: "\uc544\uc9c1 \uae30\ub85d\ub41c \ud6c4\uc6d0\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.",
  donationsAppear: "\uc218\uc9d1 \uc2dc\uc791 \ud6c4 \ub4e4\uc5b4\uc628 \ud6c4\uc6d0\uc774 \uc5ec\uae30\uc5d0 \ud45c\uc2dc\ub429\ub2c8\ub2e4.",
  settingsSaved: "\uc124\uc815\uc744 \uc800\uc7a5\ud588\uc2b5\ub2c8\ub2e4.",
  socketMissing: "Socket.IO \ud074\ub77c\uc774\uc5b8\ud2b8\ub97c \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.",
  collectionStarting: "\uc218\uc9d1 \uc2dc\uc791 \uc911...",
  connecting: "\uc5f0\uacb0 \uc911",
  requestingSession: "\uce58\uc9c0\uc9c1 \uc138\uc158 URL\uc744 \uc694\uccad\ud569\ub2c8\ub2e4.",
  socketConnected: "\uc18c\ucf13 \uc5f0\uacb0\ub428",
  socketConnectedLog: "\uc18c\ucf13\uc5d0 \uc5f0\uacb0\ud588\uc2b5\ub2c8\ub2e4. \uc138\uc158 \ud0a4\ub97c \uae30\ub2e4\ub9bd\ub2c8\ub2e4.",
  collecting: "\ud6c4\uc6d0 \uc218\uc9d1 \uc911",
  donationCollecting: "\ud6c4\uc6d0 \uc218\uc9d1 \uc911",
  subscribeStarted: "\ud6c4\uc6d0 \uc774\ubca4\ud2b8 \uad6c\ub3c5\uc744 \uc2dc\uc791\ud588\uc2b5\ub2c8\ub2e4.",
  permissionRevoked: "\uad8c\ud55c \ud574\uc81c",
  startCollection: "\ud6c4\uc6d0 \uc218\uc9d1 \uc2dc\uc791",
  disconnected: "\uc5f0\uacb0 \ub04a\uae40",
  socketDisconnected: "\uc18c\ucf13 \uc5f0\uacb0\uc774 \ub04a\uacbc\uc2b5\ub2c8\ub2e4.",
  connectionFailed: "\uc5f0\uacb0 \uc2e4\ud328",
  connectionError: "\uc5f0\uacb0 \uc624\ub958",
  testAdded: "\ud14c\uc2a4\ud2b8 \ud6c4\uc6d0\uc744 \ucd94\uac00\ud588\uc2b5\ub2c8\ub2e4.",
  error: "\uc624\ub958",
  loginCompleted: "\uce58\uc9c0\uc9c1 \ub85c\uadf8\uc778\uc774 \uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4."
};

let socket = null;
let collecting = false;

function log(message) {
  const box = $("#log");
  if (!box) return;
  const time = new Date().toLocaleTimeString("ko-KR");
  box.textContent = `[${time}] ${message}\n${box.textContent}`.slice(0, 4000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(data?.error || response.statusText);
  return data;
}

function initTheme() {
  const saved = localStorage.getItem("cheese-tracker-theme");
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = saved || (prefersLight ? "light" : "dark");
  setTheme(theme);
  $("#themeToggle").addEventListener("change", (event) => {
    setTheme(event.target.checked ? "light" : "dark");
  });
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  $("#themeToggle").checked = theme === "light";
  localStorage.setItem("cheese-tracker-theme", theme);
}

function showView(viewId) {
  $$(".view").forEach((view) => {
    const active = view.id === viewId;
    view.hidden = !active;
    view.classList.toggle("active", active);
  });
  $$(".tabButton").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === viewId);
  });
}

function displayDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFmt.format(date);
}

function setStatus(value, danger = false) {
  const node = $("#status");
  node.textContent = value;
  node.closest(".heroBadge").classList.toggle("danger", danger);
}

function updateCollectButton(value, disabled = false) {
  const button = $("#connectButton");
  button.textContent = value;
  button.disabled = disabled;
}

async function loadConfig() {
  const config = await api("/api/config");
  $("#clientId").value = config.clientId || "";
  $("#clientSecret").value = config.hasClientSecret ? "********" : "";
  $("#redirectUri").value = config.redirectUri || "";
  setStatus(config.hasAccessToken ? text.loginDone : text.setupNeeded);
  if (!config.hasAccessToken) showView("setupView");
  if (config.scope) log(`${text.currentScope}: ${config.scope}`);
}

async function loadDonations() {
  const { rows, summary } = await api("/api/donations");
  $("#totalAmount").textContent = money.format(summary.totalAmount || 0);
  $("#donationCount").textContent = String(summary.count || 0);
  $("#donorCount").textContent = String(summary.donorCount || 0);

  $("#topDonors").innerHTML = summary.top.slice(0, 50).map((row) => `
    <tr>
      <td>${escapeHtml(row.nickname || text.anonymous)}</td>
      <td>${row.count}</td>
      <td class="amount">${money.format(row.amount || 0)}</td>
      <td>${displayDate(row.lastAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">${text.noDonations}</td></tr>`;

  $("#recentDonations").innerHTML = rows.slice(0, 100).map((row) => `
    <tr>
      <td>${displayDate(row.receivedAt)}</td>
      <td>${escapeHtml(row.donatorNickname || text.anonymous)}</td>
      <td class="amount">${money.format(row.payAmount || 0)}</td>
      <td class="message">${escapeHtml(row.donationText || "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">${text.donationsAppear}</td></tr>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function saveSettings(event) {
  event.preventDefault();
  const secretValue = $("#clientSecret").value;
  await api("/api/config", {
    method: "POST",
    body: JSON.stringify({
      clientId: $("#clientId").value,
      clientSecret: secretValue === "********" ? undefined : secretValue,
      redirectUri: $("#redirectUri").value
    })
  });
  await loadConfig();
  log(text.settingsSaved);
}

async function login() {
  const { url } = await api("/api/oauth/url");
  location.href = url;
}

async function connectDonationSession() {
  if (collecting) return;
  if (!window.io) {
    throw new Error(text.socketMissing);
  }
  if (socket) socket.disconnect();
  collecting = true;
  updateCollectButton(text.collectionStarting, true);
  setStatus(text.connecting);
  log(text.requestingSession);
  const { url } = await api("/api/session-url", { method: "POST", body: "{}" });
  socket = io.connect(url, {
    reconnection: false,
    "force new connection": true,
    "connect timeout": 3000,
    transports: ["websocket"]
  });

  socket.on("connect", () => {
    setStatus(text.socketConnected);
    log(text.socketConnectedLog);
  });

  socket.on("SYSTEM", async (message) => {
    log(`SYSTEM: ${JSON.stringify(message)}`);
    if (message?.type === "connected" && message?.data?.sessionKey) {
      await api("/api/subscribe-donation", {
        method: "POST",
        body: JSON.stringify({ sessionKey: message.data.sessionKey })
      });
      setStatus(text.collecting);
      updateCollectButton(text.donationCollecting, true);
      showView("dashboardView");
      log(text.subscribeStarted);
    }
    if (message?.type === "revoked") {
      collecting = false;
      setStatus(text.permissionRevoked, true);
      updateCollectButton(text.startCollection, false);
    }
  });

  socket.on("DONATION", async (message) => {
    log(`DONATION: ${message.donatorNickname || text.anonymous} / ${message.payAmount || 0}`);
    await api("/api/donations", {
      method: "POST",
      body: JSON.stringify({ ...message, receivedAt: new Date().toISOString() })
    });
    await loadDonations();
  });

  socket.on("disconnect", () => {
    collecting = false;
    setStatus(text.disconnected, true);
    updateCollectButton(text.startCollection, false);
    log(text.socketDisconnected);
  });

  socket.on("connect_error", (error) => {
    collecting = false;
    setStatus(text.connectionFailed, true);
    updateCollectButton(text.startCollection, false);
    log(`${text.connectionError}: ${error?.message || error}`);
  });
}

async function addTestDonation() {
  await api("/api/test-donation", { method: "POST", body: "{}" });
  await loadDonations();
  log(text.testAdded);
}

window.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  $$("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.viewTarget));
  });
  $("#settingsForm").addEventListener("submit", (event) => saveSettings(event).catch((error) => log(error.message)));
  $("#loginButton").addEventListener("click", () => login().catch((error) => log(error.message)));
  $("#connectButton").addEventListener("click", () => connectDonationSession().catch((error) => {
    collecting = false;
    updateCollectButton(text.startCollection, false);
    setStatus(text.error, true);
    log(error.message);
  }));
  $("#testButton").addEventListener("click", () => addTestDonation().catch((error) => log(error.message)));

  if (new URLSearchParams(location.search).get("login") === "ok") {
    history.replaceState(null, "", "/");
    showView("setupView");
    log(text.loginCompleted);
  }
  await loadConfig().catch((error) => log(error.message));
  await loadDonations().catch((error) => log(error.message));
});
