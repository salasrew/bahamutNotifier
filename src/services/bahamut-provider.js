const SITE_HOME = "https://www.gamer.com.tw/";

class BahamutProvider {
  constructor(options = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 60_000;
    this.electronSession = options.electronSession;
    this.browserFetcher = options.browserFetcher;
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
      const [notificationResult, subscriptionResult] = await Promise.all([
        this.fetchNavigationNotification(0),
        this.fetchNavigationNotification(1)
      ]);

      const notifications = this.normalizeItems(notificationResult.payload, "notification");
      const subscriptions = this.normalizeItems(subscriptionResult.payload, "subscription");

      const snapshot = {
        source: "browser-context",
        fetchedAt: new Date().toISOString(),
        authState,
        summary: {
          notifications: notifications.length,
          subscriptions: subscriptions.length
        },
        notifications,
        subscriptions,
        note: [
          "目前改成從已登入的巴哈頁面上下文發送請求。",
          "通知使用 type=0，訂閱使用 type=1。",
          "如果數量仍然是 0，請看下方開發者訊息確認回傳內容是否已經正確。"
        ],
        developerMessages: this.buildDeveloperMessages({
          authState,
          cookies,
          notificationResult,
          subscriptionResult,
          notifications,
          subscriptions
        })
      };

      this.lastSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      const snapshot = {
        source: "browser-context",
        fetchedAt: new Date().toISOString(),
        authState,
        summary: {
          notifications: 0,
          subscriptions: 0
        },
        notifications: [],
        subscriptions: [],
        note: [
          "目前已登入，但抓取通知或訂閱時發生例外。",
          `錯誤訊息: ${error.message}`,
          "請把下方開發者訊息貼給我，我再繼續對準。"
        ],
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
      summary: {
        notifications: 0,
        subscriptions: 0
      },
      notifications: [],
      subscriptions: [],
      note: [
        "目前尚未偵測到有效的巴哈姆特登入狀態。",
        "請按右上角登入，使用內建視窗登入巴哈姆特。",
        "登入成功後，程式會沿用同一份瀏覽器 session 抓通知與訂閱。"
      ],
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
    subscriptions
  }) {
    const messages = [
      `登入結果: ${authState}`,
      `偵測到 gamer.com.tw Cookie 數量: ${cookies.length}`,
      `Cookie 名稱: ${this.listCookieNames(cookies)}`,
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

    const title =
      this.firstNonEmpty([
        item.title,
        item.subject,
        item.name,
        item.text,
        item.msg,
        item.message
      ]) ?? `${kind === "notification" ? "通知" : "訂閱"} ${index + 1}`;

    const description =
      this.firstNonEmpty([
        item.description,
        item.content,
        item.summary,
        item.subtitle,
        item.body
      ]) ?? "";

    const url = this.resolveUrl(
      this.firstNonEmpty([item.url, item.link, item.href, item.target])
    );

    const createdAt = this.firstNonEmpty([
      item.createdAt,
      item.create_time,
      item.time,
      item.date,
      item.publish_time
    ]);

    return {
      id: String(
        this.firstNonEmpty([item.id, item.sn, item.cid, item.key, `${kind}-${index}`])
      ),
      title,
      description,
      url: url ?? SITE_HOME,
      createdAt: createdAt ?? new Date().toISOString()
    };
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
