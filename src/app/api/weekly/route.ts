export async function POST(req: NextRequest) {
  const accessToken = req.headers.get("sb-access-token");
  if (!accessToken) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const { data: userData, error: uErr } = await sb.auth.getUser(accessToken);
  if (uErr || !userData?.user) return NextResponse.json({ error: "auth failed" }, { status: 401 });
  const userId = userData.user.id;

  // Compute this week (Mon..Sun UTC)
  const weekStart = startOfWeekUTC();
  const fromISO = weekStart.toISOString();
  const to = new Date(weekStart); to.setUTCDate(to.getUTCDate() + 7);
  const toISO = to.toISOString();

  // ❶ Load entries for this week
  const { data: entries, error: eErr } = await sb
    .from("entries")
    .select("content, created_at")
    .eq("user_id", userId)
    .gte("created_at", fromISO)
    .lt("created_at", toISO)
    .order("created_at", { ascending: true });

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  if (!entries?.length) return NextResponse.json({ ok: true, note: "no entries this week" });

  // ❷ Once-per-week: if a reflection already exists for this week, return it (no OpenAI call)
  const { data: existingThisWeek } = await sb
    .from("reflections")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart.toISOString().slice(0, 10))
    .limit(1);

  if (existingThisWeek && existingThisWeek.length > 0) {
    return NextResponse.json({ ok: true, reflection: existingThisWeek[0], cached: true });
  }

  // ❸ Daily cooldown: if last reflection was <24h ago, block
  const { data: lastReflection } = await sb
    .from("reflections")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (lastReflection?.length) {
    const last = new Date(lastReflection[0].created_at).getTime();
    if (Date.now() - last < 86_400_000) {
      return NextResponse.json({ error: "cooldown", message: "Please wait a day before generating another reflection." }, { status: 429 });
    }
  }

  // ❹ Cap input size passed to OpenAI to control token costs
  const textBlockRaw = entries.map((e) => `- (${e.created_at}) ${e.content}`).join("\n");
  const textBlock = textBlockRaw.slice(0, 5000); // hard cap

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing on server" }, { status: 500 });
  }

  // OpenAI call (unchanged except already-typed types/safety)
  const body = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: "Summarize the user's week empathetically. Output JSON with: summary (120-200 words), highlights (array of 3 short quotes), mood_rollup (object with avg_valence -1..1 and top_labels array of 3)." },
      { role: "user", content: `Entries this week:\n${textBlock}` }
    ],
    response_format: { type: "json_object" as const }
  };

  const r = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await r.text();
  if (!r.ok) {
    return NextResponse.json({ error: `OpenAI ${r.status}`, details: raw.slice(0, 500) }, { status: 500 });
  }

  let parsed: ReflectionJSON = {};
  try {
    const j: { choices?: Array<{ message?: { content?: string } }> } = JSON.parse(raw);
    const content = j.choices?.[0]?.message?.content ?? "{}";
    parsed = JSON.parse(content) as ReflectionJSON;
  } catch {
    return NextResponse.json({ error: "Parse error", details: raw.slice(0, 500) }, { status: 500 });
  }

  const payload = {
    user_id: userId,
    week_start: weekStart.toISOString().slice(0, 10),
    summary: parsed.summary || "No summary.",
    highlights: parsed.highlights || [],
    mood_rollup: parsed.mood_rollup || null,
  };

  const { error: upErr } = await sb.from("reflections").upsert(payload, { onConflict: "user_id,week_start" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, reflection: payload });
}
