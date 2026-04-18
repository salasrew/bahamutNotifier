const path = require("path");
const { pathToFileURL } = require("url");

const SITE_HOME = "https://www.gamer.com.tw/";
const DEFAULT_AVATAR_URL = pathToFileURL(
  path.join(__dirname, "..", "images", "none.gif")
).toString();

class BahamutProvider {
  constructor(options = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 60_000;
    this.electronSession = options.electronSession;
    this.browserFetcher = options.browserFetcher;
    this.profileFetcher = options.profileFetcher;
    this.lastSnapshot = null;
  }

  async getAuthState() {
    const cookies = await this.getGamerCookies();
    return this.hasLoginCookie(cookies) ? "logged-in" : "needs-login";
  }

  async getSnapshot(forceRefresh = false) {
    if (!forceRefresh && this.lastSnapshot) {
      return this.lastSnapshot;
    }

    const cookies = await this.getGamerCookies();
    const authState = this.hasLoginCookie(cookies) ? "logged-in" : "needs-login";

    if (authState !== "logged-in") {
      const snapshot = this.buildNeedsLoginSnapshot(cookies);
      this.lastSnapshot = snapshot;
      return snapshot;
    }

    try {
      const [notificationResult, subscriptionResult, heroProfile] = await Promise.all([
        this.fetchNavigationNotification(0),
        this.fetchNavigationNotification(1),
        this.fetchHeroProfile(cookies)
      ]);

      const notifications = this.normalizeItems(notificationResult.payload, "notification");
      const subscriptions = this.normalizeItems(subscriptionResult.payload, "subscription");

      const snapshot = {
        source: "browser-context",
        fetchedAt: new Date().toISOString(),
        authState,
        heroProfile,
        summary: {
          notifications: notifications.length,
          subscriptions: subscriptions.length
        },
        notifications,
        subscriptions,
        developerMessages: this.buildDeveloperMessages({
          authState,
          cookies,
          notificationResult,
          subscriptionResult,
          notifications,
          subscriptions,
          heroProfile
        })
      };

      this.lastSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      const snapshot = {
        source: "browser-context",
        fetchedAt: new Date().toISOString(),
        authState,
        heroProfile: this.buildFallbackHeroProfile(cookies),
        summary: {
          notifications: 0,
          subscriptions: 0
        },
        notifications: [],
        subscriptions: [],
        developerMessages: [
          `登入結果: ${authState}`,
          `偵測到 gamer.com.tw Cookie 數量: ${cookies.length}`,
          `Cookie 名稱: ${this.listCookieNames(cookies)}`,
          `例外錯誤: ${error.message}`
        ]
      };

      this.lastSnapshot = snapshot;
      return snapshot;
    }
  }

  buildNeedsLoginSnapshot(cookies) {
    return {
      source: "session",
      fetchedAt: new Date().toISOString(),
      authState: "needs-login",
      heroProfile: {
        name: "尚未登入",
        account: "請先登入巴哈姆特",
        level: "",
        homeUrl: SITE_HOME,
        avatarUrl: DEFAULT_AVATAR_URL,
        gp: "-",
        coin: "-",
        donate: "-"
      },
      summary: {
        notifications: 0,
        subscriptions: 0
      },
      notifications: [],
      subscriptions: [],
      developerMessages: [
        "登入結果: 尚未登入",
        `偵測到 gamer.com.tw Cookie 數量: ${cookies.length}`,
        `Cookie 名稱: ${this.listCookieNames(cookies)}`,
        "API 尚未呼叫，因為目前沒有足夠的登入 Cookie。"
      ]
    };
  }

  buildDeveloperMessages({
    authState,
    cookies,
    notificationResult,
    subscriptionResult,
    notifications,
    subscriptions,
    heroProfile
  }) {
    const messages = [
      `登入結果: ${authState}`,
      `偵測到 gamer.com.tw Cookie 數量: ${cookies.length}`,
      `Cookie 名稱: ${this.listCookieNames(cookies)}`,
      `勇者資訊: ${heroProfile.name || "(unknown)"} / ${heroProfile.account || "(unknown)"}`,
      `通知 API: HTTP ${notificationResult.status} | content-type=${notificationResult.contentType || "unknown"}`,
      `通知 API 回傳摘要: ${this.describePayloadText(notificationResult.payload)}`,
      `通知解析結果: ${notifications.length} 筆`,
      `訂閱 API: HTTP ${subscriptionResult.status} | content-type=${subscriptionResult.contentType || "unknown"}`,
      `訂閱 API 回傳摘要: ${this.describePayloadText(subscriptionResult.payload)}`,
      `訂閱解析結果: ${subscriptions.length} 筆`
    ];

    if (notificationResult.preview) {
      messages.push(`通知 API 預覽: ${notificationResult.preview}`);
    }

    if (subscriptionResult.preview) {
      messages.push(`訂閱 API 預覽: ${subscriptionResult.preview}`);
    }

    return messages;
  }

  async fetchHeroProfile(cookies) {
    if (typeof this.profileFetcher === "function") {
      const profile = await this.profileFetcher();
      return this.normalizeHeroProfile(profile, cookies);
    }

    return this.buildFallbackHeroProfile(cookies);
  }

  normalizeHeroProfile(profile, cookies) {
    const fallback = this.buildFallbackHeroProfile(cookies);
    const resolvedAvatar =
      this.firstNonEmpty([profile?.avatarUrl, fallback.avatarUrl]) ?? DEFAULT_AVATAR_URL;

    return {
      name: this.firstNonEmpty([profile?.name, fallback.name]) ?? "勇者",
      account: this.firstNonEmpty([profile?.account, fallback.account]) ?? "",
      level: this.firstNonEmpty([profile?.level, fallback.level]) ?? "",
      homeUrl: this.firstNonEmpty([profile?.homeUrl, fallback.homeUrl]) ?? SITE_HOME,
      avatarUrl: resolvedAvatar,
      gp: this.firstNonEmpty([profile?.gp, fallback.gp]) ?? "-",
      coin: this.firstNonEmpty([profile?.coin, fallback.coin]) ?? "-",
      donate: this.firstNonEmpty([profile?.donate, fallback.donate]) ?? "-"
    };
  }

  buildFallbackHeroProfile(cookies) {
    const cookieMap = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
    const account = cookieMap.get("BAHAID") || cookieMap.get("MB_BAHAID") || "";
    const nickname =
      this.safeDecodeURIComponent(cookieMap.get("BAHANICK")) ||
      this.safeDecodeURIComponent(cookieMap.get("MB_BAHANICK")) ||
      "勇者";
    const level = cookieMap.get("BAHALV") || "";

    return {
      name: nickname,
      account,
      level,
      homeUrl: account ? `https://home.gamer.com.tw/${account}` : SITE_HOME,
      avatarUrl: account ? this.buildAvatarUrl(account) : DEFAULT_AVATAR_URL,
      gp: "-",
      coin: "-",
      donate: "-"
    };
  }

  buildAvatarUrl(account) {
    if (!account || account.length < 2) {
      return DEFAULT_AVATAR_URL;
    }

    return `https://avatar2.bahamut.com.tw/avataruserpic/${account[0]}/${account[1]}/${account}/${account}_s.png`;
  }

  safeDecodeURIComponent(value) {
    if (!value) {
      return "";
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  hasLoginCookie(cookies) {
    const names = new Set(cookies.map((cookie) => cookie.name));
    return names.has("BAHAID") || names.has("MB_BAHAID") || names.has("BAHARUNE");
  }

  listCookieNames(cookies) {
    if (!cookies.length) {
      return "(none)";
    }

    return cookies
      .map((cookie) => cookie.name)
      .sort((left, right) => left.localeCompare(right))
      .join(", ");
  }

  async getGamerCookies() {
    if (!this.electronSession) {
      return [];
    }

    const cookies = await this.electronSession.cookies.get({});
    return cookies.filter((cookie) => {
      return (
        cookie.domain === ".gamer.com.tw" ||
        cookie.domain === "gamer.com.tw" ||
        cookie.domain.endsWith(".gamer.com.tw")
      );
    });
  }

  async fetchNavigationNotification(type) {
    if (typeof this.browserFetcher !== "function") {
      throw new Error("Browser fetcher is not configured.");
    }

    const result = await this.browserFetcher(type);
    return {
      status: result.status,
      contentType: result.contentType,
      payload: result.payload,
      preview: this.previewPayload(result.payload)
    };
  }

  normalizeItems(payload, kind) {
    const items = this.findItemArray(payload);
    return items
      .map((item, index) => this.normalizeItem(item, kind, index))
      .filter(Boolean);
  }

  normalizeItem(item, kind, index) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const rawMessage =
      this.firstNonEmpty([item.message, item.title, item.subject, item.name, item.text, item.msg]) ??
      `${kind === "notification" ? "通知" : "訂閱"} ${index + 1}`;

    const message = this.sanitizeMessage(rawMessage);
    const date =
      this.firstNonEmpty([item.date, item.time, item.createdAt, item.create_time, item.publish_time]) ??
      "";

    const url = this.resolveUrl(
      this.firstNonEmpty([item.url, item.link, item.href, item.target])
    );

    return {
      id: String(
        this.firstNonEmpty([item.id, item.sn, item.cid, item.key, `${kind}-${index}`])
      ),
      title: message,
      description: "",
      url: url ?? SITE_HOME,
      createdAt: date || new Date().toISOString()
    };
  }

  sanitizeMessage(value) {
    if (value === undefined || value === null) {
      return "";
    }

    return String(value)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  resolveUrl(value) {
    if (!value || typeof value !== "string") {
      return null;
    }

    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value;
    }

    if (value.startsWith("/")) {
      return new URL(value, SITE_HOME).toString();
    }

    return new URL(`/${value}`, SITE_HOME).toString();
  }

  findItemArray(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!payload || typeof payload !== "object") {
      return [];
    }

    const candidateKeys = [
      "data",
      "items",
      "list",
      "results",
      "rows",
      "notifications",
      "subscriptions"
    ];

    for (const key of candidateKeys) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }

    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) {
        return value;
      }
    }

    for (const value of Object.values(payload)) {
      if (value && typeof value === "object") {
        const nestedItems = this.findItemArray(value);
        if (nestedItems.length) {
          return nestedItems;
        }
      }
    }

    return [];
  }

  firstNonEmpty(values) {
    return values.find((value) => {
      return value !== undefined && value !== null && String(value).trim() !== "";
    });
  }

  describePayload(payload) {
    if (Array.isArray(payload)) {
      return {
        type: "array",
        length: payload.length
      };
    }

    if (!payload || typeof payload !== "object") {
      return {
        type: typeof payload
      };
    }

    return {
      type: "object",
      keys: Object.keys(payload).slice(0, 12)
    };
  }

  describePayloadText(payload) {
    const shape = this.describePayload(payload);
    if (shape.type === "array") {
      return `array, length=${shape.length}`;
    }

    if (shape.type === "object") {
      return `object, keys=${shape.keys.join(", ") || "(none)"}`;
    }

    return `type=${shape.type}`;
  }

  previewPayload(payload) {
    try {
      const raw =
        typeof payload === "string" ? payload : JSON.stringify(payload).slice(0, 240);
      return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
    } catch {
      return "";
    }
  }
}

module.exports = {
  BahamutProvider
};
