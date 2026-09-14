// Validates a promo code for MyLifeSense Plus. Codes live in the PROMO_CODES
// env var (comma-separated) — server-side only, so they never ship in the
// client bundle and can be rotated without a code change.
//
// Cloudflare Pages env var (Production):
//   PROMO_CODES  - comma-separated list, e.g. "LAUNCH2026, EARLYBIRD, FRIEND"
// Codes are matched case-insensitively and trimmed. Without the var set, all
// codes are rejected.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
  if (!code) return json({ ok: false });

  const valid = (env.PROMO_CODES || "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  if (!valid.length) return json({ ok: false, error: "not_configured" });
  return json({ ok: valid.includes(code) });
}
