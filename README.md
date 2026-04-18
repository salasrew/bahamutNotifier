# Bahamut Notifier Prototype

這是一個 Windows 桌面小工具的第一版骨架，目標是把巴哈姆特的「通知」與「訂閱更新」顯示在桌面右下角。

## 目前完成

- 以 Electron 建立 Windows 桌面應用骨架
- 視窗固定出現在右下角
- 視窗採用常駐、無邊框、最上層顯示
- UI 已拆成通知區、訂閱區、狀態區
- 資料來源已抽象成 `BahamutProvider`
- 目前先以 mock 資料展示畫面

## 為什麼先不用 API 直接串

目前我沒有查到巴哈姆特提供正式、公開、文件化的通知 API，可以直接安全地取得站內通知與訂閱資訊。

因此比較實際的實作順序是：

1. 先完成 Windows 端顯示器骨架
2. 再確認 Bahamut 登入後的資料來源
3. 優先嘗試登入 Cookie + 站內請求
4. 若沒有穩定接口，再改為隱藏瀏覽器頁面解析

## 建議的正式實作方案

### 方案 A: 登入 Cookie + 內部請求

優點：

- 效能較好
- 畫面較穩
- 可做背景輪詢

缺點：

- 需要先確認站內實際請求接口
- 站方改版時可能失效

### 方案 B: 內嵌瀏覽器登入後抓畫面資料

優點：

- 比較接近使用者實際看到的內容
- 如果沒有公開 API，成功率通常較高

缺點：

- 較依賴 DOM 結構
- 維護成本較高

## 建議你採用的方向

如果你要的是真正能長期運作的 Windows App，我建議：

- 桌面端：Electron
- 登入方式：內嵌登入頁或匯入 Cookie
- 資料取得：優先找站內請求，找不到再做 DOM 解析
- 通知呈現：右下角主視窗 + Windows Toast 通知

## 如何啟動

這個目錄目前只有骨架，尚未安裝 Electron 套件。

安裝後可使用：

```powershell
npm install
npm start
```

如果 PowerShell 對 `npm` 有執行限制，可改用：

```powershell
npm.cmd install
npm.cmd start
```

## 下一步

下一步需要做的是把 `src/services/bahamut-provider.js` 從 mock 改成真實資料來源。

那一段我建議分兩階段：

1. 先做登入狀態管理
2. 再接通知與訂閱抓取邏輯
