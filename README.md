# Wakanda Trade Journal on Vercel

Your private trading journal: checklist, journal, stats, calendar, screenshots and MT5 sync.

It runs on these Vercel services:

- **Vercel Functions** (Node.js) for the app itself.
- **Neon Postgres**, added from the Vercel Marketplace, to store your trades.
- **Vercel Blob** for screenshots. This is optional: without it, screenshots are stored in Postgres.

```
public/        the app pages, styles, scripts and the MT5 EA download
api/auth.js    setup, sign in, sign out
api/app.js     trades, screenshots, settings, CSV export
api/sync.js    receives trades from the MT5 EA
api/shot.js    serves your private screenshots
lib/           database, sign-in and helper code
```

---

## 1. Put the code on GitHub

1. Create a free account at github.com, then click **New repository**.
2. Name it `trading-journal`, choose **Private**, and click **Create repository**.
3. Click **uploading an existing file** and drag in **everything inside this folder** (`api`, `lib`, `public`, `package.json`, `package-lock.json`, `vercel.json`, `README.md`). Click **Commit changes**.

## 2. Create the Vercel project

1. Sign in at vercel.com with your GitHub account.
2. Click **Add New… > Project**, then **Import** your `trading-journal` repository.
3. Leave **Framework Preset** on **Other**. Leave the build settings empty, since `vercel.json` handles them.
4. Click **Deploy**. The first deploy works, but the app needs the database and secret before you can set it up.

## 3. Add the database (required)

1. In your project, open the **Storage** tab and click **Create Database**.
2. Choose **Neon (Serverless Postgres)**, pick the free plan and a region close to you (for example Europe), and click **Create**.
3. Make sure it is **connected** to this project. Vercel then adds `DATABASE_URL` for you.

## 4. Add screenshot storage (recommended)

1. On the **Storage** tab again, click **Create Database > Blob**, then **Create**.
2. Connect it to this project. Vercel then adds `BLOB_READ_WRITE_TOKEN`.

If you skip this step, screenshots are stored in the Postgres database. That works, but it fills the database's free storage faster.

## 5. Add your secret

1. Open **Settings > Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `APP_SECRET` | A long random text of 32+ characters. Make one at 1password.com/password-generator, or type a long sentence without spaces. **Keep it private.** |
   | `APP_TIMEZONE` | Optional. Defaults to `Africa/Addis_Ababa`. |

2. Go to **Deployments**, open the latest one's **⋯** menu, and choose **Redeploy** so the new settings take effect.

## 6. First-time setup

1. Open your app address, for example `https://trading-journal-yourname.vercel.app`.
2. You'll see **Set up your journal**. Enter:
   - **Setup code:** your `APP_SECRET` value. This stops anyone else from claiming your journal.
   - **Password:** your journal password, 8+ characters.
   - **Starting account balance.**
3. Click **Set up journal**. You're in.

## 7. Connect MT5 (Exness)

1. In the journal, go to **Settings > MT5 sync** and click **Create sync key**, then **Download MT5 sync EA**.
2. In MT5 (desktop or VPS), open **File > Open Data Folder > MQL5 > Experts** and put `WakandaJournalSync.mq5` there. Refresh the Navigator, or compile it in MetaEditor with F7.
3. Open **Tools > Options > Expert Advisors**, tick **Allow WebRequest for listed URL**, and add your app address, for example `https://trading-journal-yourname.vercel.app`.
4. Drag the EA onto one chart. In **Inputs**, set **Sync URL** to `https://YOUR-APP.vercel.app/api/sync` and paste the **Sync key**. Turn on **Algo Trading**.

## Use your own domain (optional)

1. In Vercel, open **Settings > Domains** and add, for example, `journal.yourdomain.com`.
2. At your domain's DNS (for example the Ethio Telecom cPanel **Zone Editor**), add the **CNAME** record Vercel shows you.
3. Update the MT5 WebRequest address and Sync URL to the new domain.

## Updating later

Upload the changed files to the same GitHub repository. Vercel redeploys automatically, and your data stays in Neon and Blob.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Database is not connected" | Connect the Neon database to the project (step 3), then redeploy. |
| "APP_SECRET is missing" | Add it (step 5), then redeploy. |
| "The setup code does not match" | Type the exact `APP_SECRET` value, with no spaces before or after. |
| MT5 says "Blocked by MT5" | The WebRequest address must exactly match the start of the Sync URL, with `https://`. |
| Forgot password | In Neon's SQL editor run `DELETE FROM settings WHERE k = 'password_hash';`, then open the app and run setup again. Your trades are kept. |
| Something else | Open **Vercel > your project > Logs** to see the error. |

## Backups

- **Trades:** use **Settings > Export all trades (CSV)** regularly.
- **Database:** Neon also keeps point-in-time history; see its dashboard.
