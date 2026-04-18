const FEED_PREVIEW_LIMIT = 5;

const state = {
  activeFeed: "notifications",
  developerMode: false,
  expanded: {
    notifications: false,
    subscriptions: false
  },
  snapshot: null
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value) {
  if (!value) {
    return "尚未同步";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function getFeedMeta(feedName) {
  return feedName === "notifications"
    ? { title: "通知", emptyText: "目前沒有通知資料" }
    : { title: "訂閱", emptyText: "目前沒有訂閱資料" };
}

function renderItems(container, items, expanded, emptyText) {
  if (!items.length) {
    container.innerHTML = `<li class="empty">${escapeHtml(emptyText)}</li>`;
    return;
  }

  const visibleItems = expanded ? items : items.slice(0, FEED_PREVIEW_LIMIT);
  container.innerHTML = visibleItems
    .map((item) => {
      return `
        <li class="item">
          <div class="itemTitle clamp">${escapeHtml(item.title)}</div>
          <div class="itemMeta">${escapeHtml(formatTime(item.createdAt))}</div>
          <button class="itemLink" data-url="${escapeHtml(item.url)}" type="button">前往查看</button>
        </li>
      `;
    })
    .join("");
}

function renderNotes(container, notes, emptyText = "目前沒有資料") {
  if (!notes.length) {
    container.innerHTML = `<li class="empty">${escapeHtml(emptyText)}</li>`;
    return;
  }

  container.innerHTML = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
}

function renderHeroProfile(profile = {}) {
  const avatar = document.getElementById("heroAvatar");
  const avatarUrl = profile.avatarUrl || "";

  if (avatarUrl) {
    avatar.src = avatarUrl;
    avatar.hidden = false;
  } else {
    avatar.hidden = true;
    avatar.removeAttribute("src");
  }

  document.getElementById("heroLevel").textContent = profile.level
    ? `LV.${profile.level}`
    : "LV.-";
  document.getElementById("heroName").textContent = profile.name || "尚未登入";
  document.getElementById("heroAccount").textContent =
    profile.account || "請先登入巴哈姆特";
  document.getElementById("heroGp").textContent = profile.gp || "-";
  document.getElementById("heroCoin").textContent = profile.coin || "-";
  document.getElementById("heroDonate").textContent = profile.donate || "-";

  const profileButton = document.getElementById("heroProfileButton");
  profileButton.dataset.url = profile.homeUrl || "";
  profileButton.disabled = !profile.homeUrl;
}

function renderActiveFeed() {
  if (!state.snapshot) {
    return;
  }

  const feedName = state.activeFeed;
  const items = state.snapshot[feedName] ?? [];
  const meta = getFeedMeta(feedName);
  const expanded = state.expanded[feedName];

  document.getElementById("feedTitle").textContent = meta.title;
  renderItems(document.getElementById("activeFeed"), items, expanded, meta.emptyText);

  const toggleButton = document.getElementById("toggleMoreButton");
  if (items.length <= FEED_PREVIEW_LIMIT) {
    toggleButton.hidden = true;
  } else {
    toggleButton.hidden = false;
    toggleButton.textContent = expanded ? "收合" : "更多";
  }

  document
    .getElementById("notificationTab")
    .classList.toggle("is-active", feedName === "notifications");
  document
    .getElementById("subscriptionTab")
    .classList.toggle("is-active", feedName === "subscriptions");
}

function applySnapshot(snapshot) {
  state.snapshot = snapshot;

  document.getElementById("notificationCount").textContent = String(
    snapshot.summary.notifications
  );
  document.getElementById("subscriptionCount").textContent = String(
    snapshot.summary.subscriptions
  );
  document.getElementById("authState").textContent = snapshot.authState;
  document.getElementById("fetchedAt").textContent = `最近同步: ${formatTime(
    snapshot.fetchedAt
  )}`;

  renderHeroProfile(snapshot.heroProfile);
  renderActiveFeed();
  renderNotes(
    document.getElementById("developerMessages"),
    snapshot.developerMessages ?? [],
    "目前沒有開發者訊息"
  );

  document.getElementById("loginButton").textContent =
    snapshot.authState === "logged-in" ? "重新登入" : "登入";
}

function updateDeveloperPanelVisibility() {
  document
    .getElementById("developerPanel")
    .classList.toggle("is-hidden", !state.developerMode);
}

document.getElementById("refreshButton").addEventListener("click", async () => {
  const snapshot = await window.bahamutApp.refresh();
  applySnapshot(snapshot);
});

document.getElementById("loginButton").addEventListener("click", async () => {
  await window.bahamutApp.login();
});

document.getElementById("hideButton").addEventListener("click", async () => {
  await window.bahamutApp.hideWindow();
});

document.getElementById("notificationTab").addEventListener("click", () => {
  state.activeFeed = "notifications";
  renderActiveFeed();
});

document.getElementById("subscriptionTab").addEventListener("click", () => {
  state.activeFeed = "subscriptions";
  renderActiveFeed();
});

document.getElementById("toggleMoreButton").addEventListener("click", () => {
  state.expanded[state.activeFeed] = !state.expanded[state.activeFeed];
  renderActiveFeed();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "F12") {
    return;
  }

  event.preventDefault();
  state.developerMode = !state.developerMode;
  updateDeveloperPanelVisibility();
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-url]");
  if (!target) {
    return;
  }

  const url = target.getAttribute("data-url");
  if (!url) {
    return;
  }

  await window.bahamutApp.openExternal(url);
});

window.bahamutApp.onSnapshot((snapshot) => {
  applySnapshot(snapshot);
});

updateDeveloperPanelVisibility();
