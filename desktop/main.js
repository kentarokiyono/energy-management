"use strict";
/* パソコン用ソフト: サイト (index.html と js/css/assets) を自分のウィンドウで開く。
 ・ファイルは app://site/ という自前の住所で配る (ダブルクリックで開くのと違い、車体の形などの読み込みができる)
 ・設定や走行記録は、このソフトの中に保存される (ブラウザとは別) */
const { app, BrowserWindow, protocol, net, session, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const SITE = app.isPackaged ? path.join(process.resourcesPath, "site") : path.join(__dirname, "..");
const ORIGIN = "app://site";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");   // 音を最初から鳴らせる

if (!app.requestSingleInstanceLock()) app.quit();

function serve() {
  protocol.handle("app", (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(SITE, rel));
    if (file !== SITE && !file.startsWith(SITE + path.sep)) return new Response("forbidden", { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function winOpts(extra) {
  return Object.assign({
    backgroundColor: "#0b0d10", autoHideMenuBar: true, icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  }, extra);
}

function keys(win) {
  win.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    if (i.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === "F5" || (i.control && i.key.toLowerCase() === "r")) { win.webContents.reload(); e.preventDefault(); }
    else if (i.key === "F12") { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
}

function create() {
  const win = new BrowserWindow(winOpts({ width: 1600, height: 900, show: false, title: "BWSC 3D Simulator" }));
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  keys(win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN + "/")) return { action: "allow", overrideBrowserWindowOptions: winOpts({ width: 1100, height: 900 }) };   // テレメトリの監視画面など
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", (w) => keys(w));
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(ORIGIN + "/")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadURL(ORIGIN + "/index.html");
}

app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  serve();
  const s = session.defaultSession;
  /* ハンコン (Logitech) の力の出力: ブラウザの「機器を選ぶ」画面の代わりに、見つかった最初の機器を使う */
  s.on("select-hid-device", (e, details, cb) => { e.preventDefault(); cb(details.deviceList[0] ? details.deviceList[0].deviceId : ""); });
  s.setPermissionCheckHandler((wc, perm, origin) => origin.startsWith(ORIGIN) || perm === "hid");
  s.setDevicePermissionHandler((d) => d.deviceType === "hid" && d.origin.startsWith(ORIGIN));
  s.setPermissionRequestHandler((wc, perm, cb) => cb(new URL(wc.getURL()).origin === ORIGIN));
  create();
});

app.on("window-all-closed", () => app.quit());
