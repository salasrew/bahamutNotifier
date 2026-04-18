# Bahamut Notifier

一個以 Electron 製作的 Windows 常駐小工具，用來顯示巴哈姆特的通知與訂閱更新。

## 已完成功能

- Windows 桌面常駐小工具介面
- 固定顯示在右下角
- 系統匣常駐，關閉主視窗時不會直接結束程式
- 右上角 `×` 按鈕可手動隱藏 App
- 內建巴哈姆特登入視窗
- 啟動後沿用登入 session 抓取通知與訂閱
- 自動輪詢更新通知與訂閱資料
- 通知與訂閱切換顯示
- 預設只顯示前 5 筆，可按「更多」展開
- 長訊息自動截斷，避免撐破畫面
- `F12` 可切換開發者訊息面板
- 本機保存登入 cookie，降低每次重開都要重新登入的情況

## 資料來源

目前通知與訂閱資料來自巴哈姆特導覽列使用的 API：

- `type=0`：通知
- `type=1`：訂閱

程式不是用主程序硬拼 Cookie header，而是改成在已登入的巴哈頁面上下文中，以 `credentials: "include"` 發送請求，這樣能更接近瀏覽器實際行為。

## 執行方式

```powershell
cd C:\Users\Salasrew\Desktop\bahamut
npm.cmd install
npm.cmd start
```

如果已經安裝過依賴，之後只需要：

```powershell
npm.cmd start
```

## 使用方式

1. 啟動 App。
2. 第一次使用時，按右上角「登入」登入巴哈姆特。
3. 登入成功後，程式會自動抓取通知與訂閱。
4. 點上方的「通知」或「訂閱」卡片可切換列表。
5. 資料超過 5 筆時，可按「更多」查看全部。
6. 按右上角 `×` 可隱藏 App；要再次打開可從系統匣操作。

## 開發者模式

- 開發者訊息預設隱藏
- 在 App 視窗中按 `F12` 可切換顯示
- 主要用來查看登入狀態、Cookie 名稱、API 回傳摘要與解析結果

## 專案結構

- [main.js](C:\Users\Salasrew\Desktop\bahamut\main.js)：Electron 主程序、系統匣、登入視窗、cookie 保存
- [preload.js](C:\Users\Salasrew\Desktop\bahamut\preload.js)：Renderer 與主程序橋接
- [src/services/bahamut-provider.js](C:\Users\Salasrew\Desktop\bahamut\src\services\bahamut-provider.js)：通知與訂閱資料整理
- [src/renderer/index.html](C:\Users\Salasrew\Desktop\bahamut\src\renderer\index.html)：畫面結構
- [src/renderer/renderer.js](C:\Users\Salasrew\Desktop\bahamut\src\renderer\renderer.js)：前端互動邏輯
- [src/renderer/styles.css](C:\Users\Salasrew\Desktop\bahamut\src\renderer\styles.css)：介面樣式

## 注意事項

- 本專案依賴巴哈姆特目前前端使用的通知 API 與登入 session 行為。
- 若巴哈姆特未來調整 API 或登入機制，可能需要更新程式。
- 本機會保存登入相關 cookie 以便下次啟動還原登入狀態，請勿將執行時產生的 cookie 檔案上傳到公開 repo。
