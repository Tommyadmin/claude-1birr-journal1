# 1birr Trade on Vercel

A professional trading journal that many people can use.

**What it includes:**
- **Pages:** Dashboard, Today, Trades, Calendar, Analytics (strategies, psychology, mistakes, sessions and time, risk, rules), Reports (print or save as PDF), Plan & notes, Inbox, Profile, Settings and Admin.
- **Trade data:** full trade records, with fees, partial entries and exits, an automatic P&L calculator, emotions, mistakes, tags, favorites and screenshots (with upload progress).
- **Import:** CSV and Excel files, including the MT5 history report, with duplicate detection.
- **MT5:** automatic sync through the EA.
- **Per-user customization:** checklist, trading windows, time zone, currency, rules, goals, emotions, mistakes, strategies, instruments and market conditions.
- **Admin site settings:** website name, tagline, logo, accent color, footer, sign-up rules, and the Terms and Privacy text.
- **Messages:** the admin can send announcements or direct messages. Users see them as a popup and in their inbox, and can get an email copy.

**Accounts:**
- **Sign-up:** people register with email and password or with Google, and give a phone number.
- **Approval:** they confirm their email, then wait for an admin (you) to approve them.
- **Privacy:** each person sees only their own trades.

It runs on these Vercel services:

- **Vercel Functions** (Node.js) for the app itself.
- **Neon Postgres**, added from the Vercel Marketplace, to store your trades.
- **Vercel Blob** for screenshots. This is optional: without it, screenshots are stored in Postgres.

```
public/        the app pages, styles, scripts and the MT5 EA download
api/auth.js    setup, sign-up, email confirmation, sign in, password reset
api/google.js  "Continue with Google"
api/admin.js   admin page: approve, disable, reset, delete users
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
   | `APP_TIMEZONE` | Optional. Defaults to `Africa/Addis_Ababa`. It applies to every user. |

2. Go to **Deployments**, open the latest one's **⋯** menu, and choose **Redeploy** so the new settings take effect.

## 5b. Email (Resend), needed for sign-up confirmation and password resets

1. Create a free account at resend.com.
2. Open **Domains**, add your domain (for example `yourdomain.com`), and add the DNS records it shows at your domain's DNS. Wait until it shows **Verified**.
3. Open **API Keys** and create a key with **Sending access**.
4. In Vercel, open **Settings > Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | the key, starting with `re_` |
   | `MAIL_FROM` | e.g. `1birr Trade <no-reply@yourdomain.com>`. Use an address on the domain you verified. |
   | `ADMIN_EMAIL` | your email. You get a message when someone is waiting for approval. **Required when upgrading an existing journal** (see below). |
   | `APP_URL` | optional, your public address, e.g. `https://journal.yourdomain.com` |

Until email is set up, nobody can confirm their email, so new sign-ups can't finish. For password resets, the admin page shows a link you can send yourself (WhatsApp, Telegram).

## 5c. Google sign-in (optional)

1. Go to console.cloud.google.com and create a project, e.g. "1birr Trade".
2. Open **APIs & Services > OAuth consent screen**:
   - choose **External**
   - enter the app name, your support email and your app's home page
   - add the scopes `openid`, `email` and `profile`
   - click **Publish app** so anyone can use it, not only test users
3. Open **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Type: **Web application**
   - **Authorized JavaScript origins:** `https://YOUR-APP.vercel.app`
   - **Authorized redirect URIs:** `https://YOUR-APP.vercel.app/api/google`
   - If you use your own domain, add those two lines for the domain too.
4. Copy the **Client ID** and **Client secret** into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy.

The **Continue with Google** button appears automatically once both are set. Google users are asked for their phone number after their first sign-in.

## Upgrading from the earlier version

1. Upload all the new files to GitHub, replacing the old ones. Delete `api/shot.js` from the repository; it was replaced by `api/media.js`.
2. The database upgrades itself on the next visit:
   - existing trades, users and settings are kept
   - the 20-trade run is removed
   - each user gets the default checklist and rules, which they can edit under **Settings**
3. Open **Admin > Site settings** to set your website name, logo, footer and support email.
4. The MT5 EA was renamed `TradeJournalSync.mq5`. The old EA keeps working; download the new one only if you want the new name.

## Upgrading from the single-user journal

1. Add `ADMIN_EMAIL` (your email) in Vercel, then upload the new files to GitHub.
2. On the next visit, your existing trades, settings and MT5 key move into your new admin account.
3. Sign in with **that email** and your **existing journal password**. Then add your phone number when asked.

You don't need to change anything in the MT5 EA.

## 6. First-time setup (new install)

1. Open your app address, for example `https://trading-journal-yourname.vercel.app`.
2. You'll see **Set up your journal**. Enter:
   - **Setup code:** your `APP_SECRET` value. This stops anyone else from claiming your journal.
   - your name, email, phone and password
   - **Starting account balance.**
3. Click **Set up journal**. You're the admin.

## Managing users

Open the **Admin** tab, which only admins see. New accounts show **Waiting for approval** once they have confirmed their email.

- **Approve:** the person gets an email and can sign in.
- **Disable / Enable:** a disabled account is signed out straight away, and its MT5 sync stops.
- **Make admin / Remove admin.**
- **Password reset:** sends the person a reset email. Without email set up, the page shows the link instead.
- **Delete:** removes the account and all of its trades. You type their email to confirm.

People can also delete their own account under **Settings > Delete account**.

## Before you invite people

- **Privacy policy and terms:** add a short privacy policy and terms, because you store people's emails, phone numbers and trading data.
- **Vercel plan:** the free Hobby plan is for non-commercial use. If the journal becomes a paid or business product for 1birr Trade, move to Vercel Pro.

## 7. Connect MT5 (Exness)

1. In the journal, go to **Settings > MT5 sync** and click **Create sync key**, then **Download MT5 sync EA**.
2. In MT5 (desktop or VPS), open **File > Open Data Folder > MQL5 > Experts** and put `TradeJournalSync.mq5` there. Refresh the Navigator, or compile it in MetaEditor with F7.
3. Open **Tools > Options > Expert Advisors**, tick **Allow WebRequest for listed URL**, and add your app address, for example `https://trading-journal-yourname.vercel.app`.
4. Drag **TradeJournalSync** onto one chart. In **Inputs**, set **Sync URL** to `https://YOUR-APP.vercel.app/api/sync` and paste the **Sync key**. Turn on **Algo Trading**.

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
| Forgot password | Use **Forgot password?** on the sign-in page. If email isn't set up, another admin can make a reset link for you on the Admin page. |
| "Upgrade needed: add ADMIN_EMAIL" | Add `ADMIN_EMAIL` in Vercel, then redeploy. |
| Google says "redirect_uri_mismatch" | The redirect URI in Google Cloud must be exactly `https://YOUR-APP/api/google`. |
| Confirmation emails don't arrive | Check that your domain shows **Verified** in Resend and that `MAIL_FROM` uses that domain. Also ask people to check their spam folder. |
| Something else | Open **Vercel > your project > Logs** to see the error. |

## Backups

- **Trades:** use **Settings > Export all trades (CSV)** regularly.
- **Database:** Neon also keeps point-in-time history; see its dashboard.
