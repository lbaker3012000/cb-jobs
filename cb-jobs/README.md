# C&B Jobs

A private job tracker for C&B. It works in any browser on any phone, tablet or computer.

- **Jobs:** quotes, active jobs and finished jobs, with customer details, scope of works, dates and notes.
- **Costs:** material breakdown with quantity, unit cost, supplier, category and **who paid** (Henry or Luke).
- **Payments:** deposits, stage payments and final payments, with who received each one, plus the balance due.
- **Profit split:** 50/50. Each of you gets your costs back plus half the profit, and the app shows who owes whom to settle up.
- **Quote and invoice PDFs:** branded C&B documents, saved from your phone.
- **Photos:** on a job's Photos tab, tap **Camera roll** to pick photos from your phone, or **Take photo** to use the camera. They upload straight away, shrunk to save data. Choose Before, During, After, Receipt or Other first. Tap a photo to add a caption or change its type.
- **Calendar:** a full month calendar. Each day square shows short labels for what's on:
  - jobs on site, by street
  - your own entries: site visits, collections, van MOT, holidays and away days
  - deadlines: quotes expiring and bill renewals

  Tap a day to see its details underneath and add entries with **+**. Use the arrows to change month. It always opens on today.
- **Home screen strip:** the next 14 days at a glance. Tap a day to see what's on right there; tap it again to close.
- **Archive:** finished and declined jobs, with search, filter by year and running totals.
- **Overheads:** your regular business bills (Checkatrade, insurance, van, phone, Microsoft 365, certifications…), weekly, monthly, quarterly, yearly or one-off, with who pays each one. The Overheads page shows:
  - what running the business costs a month
  - whether this month's finished jobs have covered it, with a progress bar and how much more is needed
  - last month and the tax year so far, for comparison
  - bills coming up in the next 60 days, with dates (for each regular bill, enter the next date it comes out and it repeats from there)
  - roughly how much each job needs to cover, from your last 3 months

  It's open on the **Money** tab, under the tax-year figures. Each job shows its profit **after overheads**.
- **Money:** UK tax-year totals, net profit after overheads, each partner's share, who still owes you, your overheads, and backup/export.
- **Export:** CSV files of jobs, costs, payments and overheads, plus a full JSON backup.
- **To do list:** the home screen tells you what needs doing:
  - quotes to chase, and quotes that have expired
  - invoices to send, and overdue payments
  - jobs starting today or tomorrow
  - won jobs with no dates, and jobs past their end date
  - when it's time for a backup

  Each one has a one-tap action, such as Call, Done or Mark finished. Tap the gold **+** in the corner of the To do box to add your own items: just type them. Tick one off when it's done. Your partner sees them too.
- **Send PDF:** the quote or invoice is attached straight to WhatsApp or email from your phone.
- **Smart autofill:**
  - type a returning customer's name and their phone, email and address fill in
  - type an item you've bought before and its last price, supplier and category fill in
  - **Save + add another** lets you enter a whole receipt quickly
- **Paid in full:** one tap records the final payment.
- **Live sync:** when one of you changes something, it appears on the other's phone within a couple of seconds.
- **Passwords:** a "Forgot password?" link on the sign-in screen, and Change password in Settings.
- **VAT:** off for now. Tick "VAT registered" in Settings when the time comes.

---

## Try it first (2 minutes, no setup)

Open `index.html` through any local web server. Or upload everything to GitHub as described in Step 3 below and open the link.

With no Supabase details filled in, the app runs in **demo mode**: data stays in that browser only. It loads some sample jobs the first time so you can try everything. **Settings → Wipe demo data** clears them.

---

## Proper setup (about 15 minutes, all free)

### Step 1: Create the database (Supabase)

1. Go to <https://supabase.com>, sign up and click **New project**. Pick region **London (eu-west-2)**, set a database password (save it somewhere) and wait a minute for it to build.
2. Open **SQL Editor → New query**.
3. Open `supabase/schema.sql` from this folder. **Change the two email addresses near the top** to the emails you and your partner will log in with. Paste the whole file into the editor and click **Run**. It should say "Success".
4. Go to **Authentication → Users → Add user → Create new user**. Create a login for each of you, using the same emails as step 3. Tick **Auto Confirm User**.
5. Go to **Authentication → Sign In / Providers** (or **Settings**) and switch **off** "Allow new users to sign up". Only the two accounts you made can then exist.

### Step 2: Connect the app

1. In Supabase, go to **Project Settings → API** (or **Data API / API Keys**). Copy the **Project URL** and the **anon public** key.
2. Open `js/config.js` and paste them in:
   ```js
   export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
   The anon key is safe to have in a public repo. Without a login on the members list it can't read or change anything.

### Step 3: Put it online (GitHub Pages)

1. On <https://github.com> click **New repository**. Name it e.g. `cb-jobs`.
   - A **public** repo is needed for free GitHub Pages. That's fine: the code is public, but your data lives in Supabase behind your logins. The page is also marked so search engines don't list it.
   - (Private repo + Pages needs GitHub Pro, about £3/month.)
2. Click **uploading an existing file** and drag in **everything inside this folder** (all files and folders: `index.html`, `sw.js`, `manifest.webmanifest`, the icons, `css`, `js`, `img`, `fonts`, `vendor`, `supabase`, `README.md`). Click **Commit changes**.
3. Go to **Settings → Pages**. Under "Branch" choose `main` and `/ (root)`, then **Save**.
4. After a minute your app is live at `https://YOUR-USERNAME.github.io/cb-jobs/`.

### Step 3b: Password reset links (2 minutes)

In Supabase go to **Authentication → URL Configuration**:

1. Set **Site URL** to your app link, e.g. `https://YOUR-USERNAME.github.io/cb-jobs/`.
2. Add the same link under **Redirect URLs**.

Supabase's built-in email sender only delivers to people who are members of your Supabase organisation. So invite your partner to the organisation (**Organization → Team → Invite**), or set up your Microsoft 365 email under **Authentication → Emails → SMTP Settings**. Otherwise just use **Change password** in the app's Settings. That doesn't need email.

### Step 4: On your phones

- Open the link and sign in.
- **iPhone:** in Safari tap **Share → Add to Home Screen**.
- **Android:** in Chrome tap **⋮ → Add to Home screen / Install app**.

It then opens full-screen like a normal app: your C&B icon, a navy C&B start-up screen, no browser bars, and its own place in the app switcher. Sign in once inside the home-screen app and it remembers you.

**Instant opening and no signal:** the app's files are saved on the phone, so it opens straight away, even with no signal. It also keeps a copy of the last-loaded jobs, so with no signal you can still look up addresses, phone numbers, costs and the calendar. A "No signal" banner shows, and saving waits until you're back online. Signing out removes the saved copy from that phone.

### Step 5: First time in

Go to **Settings**: check your business details and add your **bank details** (they print on invoices). Then go to **Money → Overheads** and add your regular bills with **Add bill**.

Each phone remembers who's using it: the first time you add a cost or payment, pick yourself under "Paid by" and it'll be pre-selected from then on.

---

## How the money works

| | |
|---|---|
| **Profit** | Fixed price (ex VAT) − all costs |
| **Profit split** | 50/50 between Henry and Luke on every job |
| **Each partner is due** | The costs they paid + their % of the profit |
| **Settle up** | Based on money actually received: whoever has collected more than they're due owes the other the difference |
| **Overheads per day** | Yearly running costs ÷ 365 |
| **After overheads** | Job profit − (days from start to end date × overheads per day) |
| **Overheads split** | Shared 50/50 |

Costs you add to a job *before* it's won act as your material estimate for the quote. Keep updating them with real receipts as you go.

**Job stages:** Quoted → Active → Finished. Finished and Declined jobs move to the **Archive**. A finished job that still has money owing shows in **Owed** on the Jobs screen and under **Money**.

---

## Updating the app later

Edit the files and re-upload them to the GitHub repo. Pages updates within a minute or two. When you change a file, also bump the version number everywhere it appears, so phones fetch the new version instead of an old saved one:
- `VERSION` at the top of `sw.js`
- the `?v=` numbers in `index.html`
- the `import` lines at the top of `js/app.js` and `js/db.js`

(Or just ask Claude to do it.) On a phone you may need to pull to refresh or close and reopen the app.

If a future change needs a database change, just run the updated `supabase/schema.sql` again in the Supabase SQL Editor. It's safe to run more than once and never deletes your data (only remember to keep your two emails in it).

## Backups

Supabase keeps your data, but every so often go to **Money → Full backup (JSON)** and save the file somewhere safe (e.g. OneDrive).

Note: free Supabase projects pause after a week with no activity. If that happens, open the Supabase dashboard and click **Restore**. Normal weekly use keeps it awake.

## Files

```
index.html             app page
sw.js                  saves the app's files on the phone for instant / no-signal opening
manifest.webmanifest   home-screen app settings
icon*.png, favicon.png home-screen and browser icons
css/styles.css         look & feel (C&B navy, gold and cream)
js/config.js           your Supabase URL + key  <- edit this
js/db.js               data layer (Supabase or demo storage)
js/app.js              the app
supabase/schema.sql    database tables, security and photo storage (safe to run again)
img/                   C&B logo (from your business cards) and iPhone start-up screens
fonts/                 Poppins font (SIL Open Font Licence)
vendor/                html2pdf, makes the PDFs (MIT licence)
```
