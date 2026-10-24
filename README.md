# Signal Desk server

Scans the markets every few minutes using the same strategies, backtests and news scoring as the Signal Desk app, and sends an alert to your phone when it finds a validated, high-confidence setup. It works even when the app is closed and your phone is asleep.

Alerts arrive through **ntfy**, a free notification app. No account is needed.

## What it looks at
Seven classic strategies on every market, plus **order flow** on crypto and gold: buying versus selling pressure is measured from Binance volume and tested in the backtest. An order flow rule is used only when it improved past results. For crypto the alert also shows a live order book reading (buy and sell walls, imbalance). The order book part is live only and cannot be backtested, so it nudges confidence slightly and is shown as context. Synthetic indices are random number generators with no real order book, so order flow does not apply to them.

## Step 1: set up alerts on your phone (2 minutes)
1. Install the free **ntfy** app (App Store or Google Play).
2. Open it, tap **+**, and subscribe to a topic name that nobody could guess, for example `signaldesk-k7x2q9m4w8` (make up your own). Anyone who knows the topic name can read your alerts, so keep it private.
3. Allow notifications when your phone asks.

## Step 2 (recommended): run it free on GitHub, no server to look after
1. Create a free account at github.com.
2. Click **New repository**, name it `signal-desk-server`, choose **Public** (free scheduled runs are unlimited for public repositories; your topic name stays hidden because you store it as a secret), and create it.
3. Click **Add file > Upload files**. Drag in everything from this folder, **including the hidden `.github` folder** (hidden folders are easy to miss when dragging, so if `.github` does not appear, use **Add file > Create new file**, type `.github/workflows/scan.yml` as the file name (typing the slashes creates the folders), and paste in the contents of that file). Commit.
4. Go to **Settings > Secrets and variables > Actions > New repository secret**. Name: `NTFY_TOPIC`. Value: your topic name from step 1.
5. Open the **Actions** tab, enable workflows if asked, choose **Signal Desk scan**, and click **Run workflow**. Within a couple of minutes you should get alerts or, if nothing qualifies, a green tick with no alert.
6. To check the phone link: **Run workflow** again, tick **Send a test alert to my phone instead of scanning**, and run it. A test message should appear in the ntfy app within a minute.

Good to know: GitHub runs scheduled jobs on a best-effort basis, so a run can start 5 to 15 minutes late when GitHub is busy. GitHub also pauses schedules after 60 days with no activity in the repository: if alerts stop, open the Actions tab and re-enable the workflow.

## Settings (optional)
In the repository: **Settings > Secrets and variables > Actions > Variables tab**.

| Name | Default | Meaning |
|---|---|---|
| CATEGORIES | syn,com,cry | syn = synthetics, frx = forex, cry = crypto, com = commodities, idx = stock indices |
| TIMEFRAMES | 900,14400 | chart sizes in seconds: 900 = 15 min, 3600 = 1 hour, 14400 = 4 hours |
| MIN_CONF | 70 | smallest confidence (%) that triggers an alert |
| CAPITAL | 1000 | your account size, used in the position size shown in alerts |
| RISK_PCT | 1 | percent of capital risked per trade (1 to 2 is a common range) |

## Option B: an always-on host (Render, Railway, a VPS)
Needs Node 18 or newer. Run `npm install`, then `node server.js`. Set the same names as environment variables (`NTFY_TOPIC` is required, plus `INTERVAL_MIN` for minutes between scans, default 5). If the host wants a web port, set `PORT` and it answers a health check. Free tiers of some hosts go to sleep, which stops scans, so check that the host keeps the process running.

## Honest limits
- Alerts are only as good as the strategies behind them. The server only alerts when a strategy passed its backtest on that market, but a past result never guarantees the future. Use a demo account first.
- If a data source is unreachable the server skips that market and tries again next scan. A run where no market could be read at all shows as failed in the Actions tab, and GitHub emails you.
- The server remembers which alerts it has sent and how its past signals turned out (`state.json`), so you are not alerted twice for the same candle.
