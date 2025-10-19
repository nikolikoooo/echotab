import { NextResponse } from "next/server";

export async function GET() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, where: "server", error: "OPENAI_API_KEY missing" }, { status: 500 });
  }

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Say OK in one word." },
        { role: "user", content: "Ping" }
      ]
    }),
  });

  const text = await r.text(); // don’t assume JSON; we want to see raw errors too
  return NextResponse.json({ status: r.status, body: text.slice(0, 1000) });
}
