const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Missing file" }, 400);

    const fd = new FormData();
    fd.set("file", file);
    fd.set("model", "gpt-4o-mini-transcribe"); // or whisper-1

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: fd,
    });

    if (!r.ok) return json({ error: await r.text() }, 500);
    const out = await r.json();

    return json({ text: out.text ?? "" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});