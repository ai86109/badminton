# 羽球隊長台

羽球社幹部共用的手機小工具：用日曆排定固定打球日、記出席請假、按時段與場地數分攤場地費、追蹤收款，並一鍵產生「開打通知」與「收費通知」貼到 LINE。

- **前端**：React + TypeScript + Vite
- **後端 / 資料庫**：Supabase（Postgres，多人共用、即時同步）
- **部署**：Vercel

## 這個版本的重點：一份共用資料、大家共管、免登入

所有人打開網址看到的是**同一份資料**，都能看、都能改，不需要帳號密碼。多人同時操作時，因為資料拆成多張表、只寫「你動到的那一筆」，不會互相覆蓋；再加上 Supabase 即時同步，大家的畫面會自動更新。

> ⚠️ **安全提醒**：免登入代表沒有任何門檻——拿到網址的人都能改資料。連結請只在幹部之間傳。日後要加防線很容易（共用密碼、或改回需要登入），`supabase/schema.sql` 檔尾有說明。

---

## 本機開發

```bash
npm install
cp .env.example .env   # 填入 Supabase 資訊（見下方）；不填也能跑（本機模式）
npm run dev
```

> 沒填 `.env` 時會自動用瀏覽器本機儲存（localStorage）、單機使用，方便先看畫面。填了 Supabase 資訊才會啟用「多人共用 + 即時同步」。

## 打包

```bash
npm run build     # 產出 dist/
npm run preview   # 本機預覽打包結果
```

---

## Supabase 設定（做一次）

1. 到 <https://supabase.com> 註冊、建立一個新專案。
2. 左側 **SQL Editor** → 貼上 `supabase/schema.sql` 的全部內容 → Run。（建立 5 張表、開放權限、開啟即時同步）
3. 左側 **Project Settings → API**，複製兩個值：
   - `Project URL` → 對應 `VITE_SUPABASE_URL`
   - `anon public` key → 對應 `VITE_SUPABASE_ANON_KEY`（前端用的公開金鑰）

把這兩個值填進 `.env`（本機）以及 Vercel 的環境變數（部署）。這個版本免登入，不需要設定 Authentication。

---

## 部署到 Vercel

1. 把這個資料夾推上 GitHub（或用 Vercel CLI）。
2. 到 <https://vercel.com> → New Project → 匯入這個 repo（會自動偵測是 Vite 專案）。
3. 在 **Environment Variables** 加入 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
4. Deploy，完成後把網址傳給幹部即可共用。

---

## 資料模型（共用 / 正規化）

一個社團、一份資料，拆成 5 張表：

| 表 | 內容 |
|---|---|
| `settings` | 社團設定（單列）：每小時金額、預設場地/時段、通知模板… |
| `members` | 成員（固定 / 非固定） |
| `sessions` | 每個打球/休息日（用日期當主鍵） |
| `session_slots` | 場次底下的每個 1 小時時段（含場地號碼） |
| `attendance` | 成員 × 場次的出席、參加時段、收款狀態（只存「非預設」的人） |

金額（每人該付多少）不入庫，由前端即時計算（場地費 ÷ 場地數 ÷ 人數），避免和設定不同步。全部表都開了 Row Level Security，目前政策是「任何人可讀寫」（配合免登入），日後可收緊。
