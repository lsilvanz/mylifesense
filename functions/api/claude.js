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
- If the summary has a "context" field (user-provided background), use it to interpret the data and
  personalize your answer — but never contradict the computed numbers.
- Be concise: 2-4 sentences for a narrative; a direct, friendly answer for a chat question.`;

const FACTOR_SYSTEM = `You help design a "Sense" in a self-tracking app — something a person wants to understand about themselves. Given the Sense's title and question, propose candidate factors to track.

Return ONLY valid JSON (no markdown fences, no prose) shaped exactly as:
{"factors":[{"label":"Short name","category":"Symptoms|Food|Exercise|Sleep|Environment|Mood|Custom","entryType":"yes_no|scale_0_10|low_med_high|number|free_text|list","controllable":true,"isTarget":false,"goalDirection":"minimize","unit":"cups","options":["A","B"],"multiple":true}]}

Rules:
- Suggest 4 to 6 factors.
- EXACTLY ONE factor has "isTarget":true — the thing being measured/understood, derived from the question. Give the target a "goalDirection" ("minimize" if lower is better like pain, "maximize" if higher is better like focus). Non-target factors omit goalDirection.
- Include factors that plausibly influence or relate to the target. Skip any already-chosen factors listed by the user.
- Prefer quantifiable entry types (yes_no, scale_0_10, low_med_high, number). Use "number" with a "unit" for counts/amounts. "unit" only for number; "options" and "multiple" only for list. Set "multiple":true when several options can apply at once (e.g. symptoms, foods eaten), false when exactly one applies (e.g. weather).
- "controllable":true for behaviours the person can change (exercise, food, sleep habits, screen time); false for context they can't directly change (weather, symptoms, external stress).
- If user context is provided, use it to tailor which factors you suggest.
- Keep labels to 2-4 words. Return only the JSON object.`;

const LOG_SYSTEM = `You convert a spoken or typed description of someone's day into structured log values for a self-tracking Sense.
You are given the Sense's factors (id, label, entryType, options, unit) and a transcript of what the person said.

Return ONLY valid JSON (no markdown, no prose): {"values":[{"factorId":"<id>","value":<value>}]}

Rules:
- Include a factor ONLY if the transcript clearly indicates a value for it. Omit everything else. Never invent values.
- Match "value" to the factor's entryType:
  - yes_no -> true or false
  - scale_0_10 -> integer 0..10
  - low_med_high -> "low" | "med" | "high"
  - number -> a number only (strip units/words, e.g. "two coffees" -> 2)
  - list -> if the factor is multiple:true, an array of option strings; otherwise a single option string. Only use strings from that factor's "options".
  - free_text -> a short string
  - integration -> never include (auto-synced)
- Use the factor "id" values exactly as given. Return only the JSON object.`;

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

  const { mode, summary, question, title, sense_question, existing, context: userContext, transcript, factors } =
    body || {};

  let system = SYSTEM;
  let userText;
  let maxTokens = 700;

  if (mode === "suggest_factors") {
    if (!title) return json({ error: "missing_title" }, 400);
    system = FACTOR_SYSTEM;
    maxTokens = 900;
    userText = `Sense title: ${title}\nQuestion: ${sense_question || ""}\nAlready chosen factors: ${
      Array.isArray(existing) && existing.length ? existing.join(", ") : "none"
    }${
      userContext ? `\n\nUser context (use it to tailor suggestions):\n${userContext}` : ""
    }\nSuggest factors as JSON.`;
  } else if (mode === "parse_log") {
    if (!transcript || !Array.isArray(factors)) return json({ error: "missing_transcript" }, 400);
    system = LOG_SYSTEM;
    maxTokens = 600;
    userText = `Factors:\n${JSON.stringify(factors)}\n\nWhat the person said:\n"${transcript}"\n\nExtract the values as JSON.`;
  } else {
    if (!summary) return json({ error: "missing_summary" }, 400);
    userText =
      mode === "chat"
        ? `Data summary:\n${JSON.stringify(summary)}\n\nThe user asks: ${JSON.stringify(
            String(question || "")
          )}\nAnswer them directly.`
        : `Data summary:\n${JSON.stringify(
            summary
          )}\n\nWrite a short, encouraging headline insight (2-3 sentences) that highlights the most important, actionable pattern.`;
  }

  const model = env.ANTHROPIC_MODEL || "claude-opus-5";
  const base = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userText }],
  };

  const post = (payload) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

  try {
    // `effort` isn't supported on every model (e.g. Haiku 4.5). Send it, and if
    // the model rejects it, retry once without it.
    let res = await post({ ...base, output_config: { effort: "low" } });
    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 400 && detail.includes("effort")) {
        res = await post(base);
      } else {
        return json({ error: `anthropic_${res.status}`, detail }, 502);
      }
    }
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
