// Cloudflare Pages Function (edge runtime) — the ONLY place the Anthropic API
// key lives. The static client posts a pre-computed stats summary here; this
// function calls Claude and returns text. Raw HTTPS fetch is used deliberately:
// it's the dependency-free, bundling-safe path for a Worker.
//
// Env (set in Cloudflare Pages → Settings → Variables):
//   ANTHROPIC_API_KEY  (required, secret)
//   ANTHROPIC_MODEL    (optional, defaults to claude-opus-5)

const SYSTEM = `You are the insights assistant inside MyLifeSense, a personal self-tracking app.
You receive a compact JSON summary of ONE thing the user tracks (the "target"), its goal direction,
and pre-computed findings about factors related to it (effect sizes, Spearman r, a confidence tier,
whether each factor is controllable, and a same-day vs previous-day lag).

Rules:
- Answer ONLY from the provided summary. Never invent numbers, factors, or trends that aren't in it.
- Use plain, warm language and concrete effect sizes; mention confidence briefly when useful.
- Correlation is not causation — frame anything actionable as an experiment to try, not a certainty.
- Only suggest changing factors marked "controllable": true; treat the rest as context that explains.
- If "enoughData" is false, say there isn't enough data yet and encourage logging; do NOT assert patterns.
- If "isSymptom" is true, add a brief reminder that this isn't medical advice and to see a clinician for
  severe or persistent symptoms.
- Be concise: 2-4 sentences for a narrative; a direct, friendly answer for a chat question.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "content-type": "application/json" },
    });

  if (!env.ANTHROPIC_API_KEY) {
    // Not an error the client should surface — it just falls back to the
    // deterministic layer.
    return json({ error: "not_configured" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const { mode, summary, question } = body || {};
  if (!summary) return json({ error: "missing_summary" }, 400);

  const userText =
    mode === "chat"
      ? `Data summary:\n${JSON.stringify(summary)}\n\nThe user asks: ${JSON.stringify(
          String(question || "")
        )}\nAnswer them directly.`
      : `Data summary:\n${JSON.stringify(
          summary
        )}\n\nWrite a short, encouraging headline insight (2-3 sentences) that highlights the most important, actionable pattern.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || "claude-opus-5",
        max_tokens: 700,
        system: SYSTEM,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `anthropic_${res.status}`, detail }, 502);
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return json({ text });
  } catch (e) {
    return json({ error: "fetch_failed", detail: String(e) }, 502);
  }
}
