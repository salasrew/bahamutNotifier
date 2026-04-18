const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  screen,
  nativeImage,
  shell,
  session
} = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { BahamutProvider } = require("./src/services/bahamut-provider");

const BAHAMUT_HOME_URL = "https://www.gamer.com.tw/";
const BAHAMUT_LOGIN_URL = "https://user.gamer.com.tw/login.php";

let mainWindow;
let loginWindow;
let fetchWindow;
let tray;
let refreshTimer;
let isQuitting = false;
let provider;
let cookieStorePath;

function getWindowBounds() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const width = 380;
  const height = 680;
  const margin = 16;

  return {
    width,
    height,
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + workArea.height - height - margin
  };
}

function createTrayIcon() {
  const svg = `
    <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="48" height="48" rx="14" fill="#1d2a3f"/>
      <path d="M32 18C24.82 18 19 23.82 19 31V38L16 42V44H48V42L45 38V31C45 23.82 39.18 18 32 18Z" fill="#45C0A5"/>
      <circle cx="32" cy="49" r="5" fill="#EAF2FF"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  );
}

function createWindow() {
  const bounds = getWindowBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "src", "renderer", "index.html"));

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    hideMainWindow();
  });

  mainWindow.on("show", updateTrayMenu);
  mainWindow.on("hide", updateTrayMenu);
}

function createFetchWindow() {
  if (fetchWindow && !fetchWindow.isDestroyed()) {
    return fetchWindow;
  }

  fetchWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  fetchWindow.on("closed", () => {
    fetchWindow = null;
  });

  return fetchWindow;
}

async function ensureFetchContext() {
  const windowRef = createFetchWindow();
  const currentUrl = windowRef.webContents.getURL();

  if (currentUrl.startsWith(BAHAMUT_HOME_URL)) {
    return windowRef;
  }

  await windowRef.loadURL(BAHAMUT_HOME_URL);
  return windowRef;
}

async function browserContextFetch(type) {
  const windowRef = await ensureFetchContext();
  const script = `
    (async () => {
      const url = "https://api.gamer.com.tw/common/v1/navigation_notification.php?type=${type}";
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "*/*" }
      });

      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { rawText: text };
      }

      return {
        status: response.status,
        ok: response.ok,
        url: response.url,
        contentType: response.headers.get("content-type") || "",
        payload
      };
    })();
  `;

  return windowRef.webContents.executeJavaScript(script, true);
}

async function browserContextFetchHeroProfile() {
  const windowRef = await ensureFetchContext();
  const script = `
    (() => {
      const decodeCookie = (name) => {
        const value = document.cookie
          .split("; ")
          .find((item) => item.startsWith(name + "="));
        if (!value) return "";
        const raw = value.slice(name.length + 1);
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      };

      const text = (selector) => {
        const node = document.querySelector(selector);
        return node ? node.textContent.trim() : "";
      };

      const attr = (selector, name) => {
        const node = document.querySelector(selector);
        return node ? node.getAttribute(name) || "" : "";
      };

      const metricText = (id) => {
        const node = document.getElementById(id);
        return node ? node.textContent.trim() : "";
      };

      const account = decodeCookie("BAHAID") || decodeCookie("MB_BAHAID");
      const nickname = decodeCookie("BAHANICK") || decodeCookie("MB_BAHANICK");
      const levelFromCookie = decodeCookie("BAHALV");

      return {
        homeUrl:
          attr(".member-popover__info", "href") ||
          (account ? "https://home.gamer.com.tw/" + account : ""),
        avatarUrl:
          attr(".member-popover__profile-content img", "src") ||
          (account
            ? "https://avatar2.bahamut.com.tw/avataruserpic/" +
              account.slice(0, 1) +
              "/" +
              account.slice(1, 2) +
              "/" +
              account +
              "/" +
              account +
              "_s.png"
            : ""),
        name: text(".member-popover__name") || nickname,
        account: text(".member-popover__account") || account,
        level:
          text(".member-popover__level").replace(/^LV\\./i, "").trim() ||
          levelFromCookie,
        gp: metricText("userGP"),
        coin: metricText("userCoin"),
        donate: metricText("userDonate")
      };
    })();
  `;

  return windowRef.webContents.executeJavaScript(script, true);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  mainWindow.show();
  mainWindow.focus();
  updateTrayMenu();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.hide();
  updateTrayMenu();
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isVisible()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: mainWindow && mainWindow.isVisible() ? "隱藏主視窗" : "顯示主視窗",
      click: () => toggleMainWindow()
    },
    {
      label: "登入巴哈姆特",
      click: () => openLoginWindow()
    },
    {
      label: "立即重新整理",
      click: () => {
        pushLatestState(true).catch((error) => {
          console.error("Manual refresh failed:", error);
        });
      }
    },
    { type: "separator" },
    {
      label: "結束",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Bahamut Notifier");
  tray.on("click", () => {
    toggleMainWindow();
  });
  updateTrayMenu();
}

function isLikelyLoggedIn(url) {
  try {
    const host = new URL(url).hostname;
    return host.endsWith("gamer.com.tw");
  } catch {
    return false;
  }
}

async function handleLoginNavigation(navigatedUrl) {
  if (!provider || !isLikelyLoggedIn(navigatedUrl)) {
    return;
  }

  const authState = await provider.getAuthState();
  if (authState !== "logged-in") {
    return;
  }

  await ensureFetchContext();

  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }

  await pushLatestState(true);
  showMainWindow();
}

function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show();
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    title: "登入巴哈姆特",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loginWindow.loadURL(BAHAMUT_LOGIN_URL);

  const onNavigate = (_event, url) => {
    handleLoginNavigation(url).catch((error) => {
      console.error("Login navigation handling failed:", error);
    });
  };

  loginWindow.webContents.on("did-navigate", onNavigate);
  loginWindow.webContents.on("did-navigate-in-page", onNavigate);
  loginWindow.webContents.on("did-redirect-navigation", onNavigate);

  loginWindow.on("closed", () => {
    loginWindow = null;
  });
}

async function pushLatestState(forceRefresh = false) {
  if (!provider || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const snapshot = await provider.getSnapshot(forceRefresh);
  mainWindow.webContents.send("bahamut:snapshot", snapshot);

  if (tray) {
    tray.setToolTip(
      `Bahamut Notifier | 通知 ${snapshot.summary.notifications} | 訂閱 ${snapshot.summary.subscriptions}`
    );
  }
}

function sanitizeCookie(cookie) {
  return {
    url: cookie.secure ? "https://www.gamer.com.tw/" : "http://www.gamer.com.tw/",
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expirationDate: cookie.expirationDate,
    sameSite: cookie.sameSite
  };
}

function normalizeCookieForSet(cookie) {
  const normalized = {
    url: cookie.url,
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path ?? "/",
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly)
  };

  if (cookie.expirationDate) {
    normalized.expirationDate = cookie.expirationDate;
  }

  if (cookie.sameSite && cookie.sameSite !== "unspecified") {
    normalized.sameSite = cookie.sameSite;
  }

  return normalized;
}

async function persistGamerCookies() {
  const cookies = await session.defaultSession.cookies.get({});
  const gamerCookies = cookies
    .filter((cookie) => {
      return (
        cookie.domain === ".gamer.com.tw" ||
        cookie.domain === "gamer.com.tw" ||
        cookie.domain.endsWith(".gamer.com.tw")
      );
    })
    .map(sanitizeCookie);

  await fs.writeFile(cookieStorePath, JSON.stringify(gamerCookies, null, 2), "utf8");
}

async function restoreGamerCookies() {
  try {
    const raw = await fs.readFile(cookieStorePath, "utf8");
    const cookies = JSON.parse(raw);

    for (const cookie of cookies) {
      try {
        await session.defaultSession.cookies.set(normalizeCookieForSet(cookie));
      } catch (error) {
        console.warn(`Failed to restore cookie ${cookie.name}:`, error.message);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Failed to restore Bahamut cookies:", error.message);
    }
  }
}

function watchCookieChanges() {
  session.defaultSession.cookies.on("changed", (_event, cookie) => {
    if (!cookie.domain || !cookie.domain.includes("gamer.com.tw")) {
      return;
    }

    persistGamerCookies().catch((error) => {
      console.warn("Failed to persist Bahamut cookies:", error.message);
    });
  });
}

app.whenReady().then(async () => {
  cookieStorePath = path.join(app.getPath("userData"), "bahamut-cookies.json");
  await restoreGamerCookies();
  watchCookieChanges();

  provider = new BahamutProvider({
    pollIntervalMs: 60_000,
    electronSession: session.defaultSession,
    browserFetcher: browserContextFetch,
    profileFetcher: browserContextFetchHeroProfile
  });

  createWindow();
  createTray();
  createFetchWindow();
  await pushLatestState();

  refreshTimer = setInterval(() => {
    pushLatestState(true).catch((error) => {
      console.error("Refresh failed:", error);
    });
  }, provider.pollIntervalMs);

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  isQuitting = true;

  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

ipcMain.handle("bahamut:refresh", async () => {
  const snapshot = await provider.getSnapshot(true);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("bahamut:snapshot", snapshot);
  }
  return snapshot;
});

ipcMain.handle("bahamut:login", async () => {
  openLoginWindow();
  return { ok: true };
});

ipcMain.handle("bahamut:hide-window", async () => {
  hideMainWindow();
  return { ok: true };
});

ipcMain.handle("bahamut:toggle-window", async () => {
  toggleMainWindow();
  return { ok: true };
});

ipcMain.handle("bahamut:open-external", async (_event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});
