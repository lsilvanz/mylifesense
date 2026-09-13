# MyLifeSense reminder sender (Cloudflare Worker)

A scheduled Worker that sends Web Push reminders. Zero npm deps — Web Push is
implemented with Web Crypto.

## Deploy

```bash
cd worker
npx wrangler deploy
```

## Secrets (set once, then re-deploy)

```bash
npx wrangler secret put SUPABASE_URL            # https://ibicedsscxhixrjekodn.supabase.co
npx wrangler secret put SUPABASE_SERVICE_KEY    # Supabase → Settings → API → service_role key (SECRET)
npx wrangler secret put VAPID_PUBLIC_KEY        # BDJ5mMtTJCEOFLPQ-wiiP79WdWIoVlWpJo73VbzQQBXyYFMx49oFuJkKtSNC30LvL2r1H9p3xpLj-sHAGpPQ4BE
npx wrangler secret put VAPID_PRIVATE_KEY       # RaSIn42XZvJ2TCYG7TYPGZRHHd0vimToOXKkjzKe9fk
npx wrangler secret put VAPID_SUBJECT           # mailto:you@example.com
npx wrangler secret put RUN_TOKEN               # any random string, for manual /run tests
```

The **VAPID_PUBLIC_KEY** must match the one embedded in the app
(`src/lib/push.ts`). The **service_role key** is powerful — it lives only here.

## Test manually

```
https://mylifesense-reminders.<your-subdomain>.workers.dev/run?token=<RUN_TOKEN>
```

Returns how many reminders were sent. It only sends for reminders whose local
time matches now (±20 min), that weren't logged recently, and weren't already
sent this period.
