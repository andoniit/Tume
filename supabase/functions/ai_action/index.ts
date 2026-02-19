// Deno Edge Function
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

type Action =
  | { type: "create_task"; payload: { title: string; description?: string | null; due_at?: string | null; assign: "me" | "partner" | "both" } }
  | { type: "create_note"; payload: { title: string; visibility: "shared" | "personal"; content?: string | null; checklist_items?: string[] } }
  | { type: "set_meal"; payload: { week_start: string; day_index: number; meal: "breakfast" | "lunch" | "dinner"; title: string; note?: string | null; cooked_by: "me" | "partner" | "both" | "unknown"; dishes_cleaned_by: "me" | "partner" | "both" | "unknown"; rating?: number | null } };

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getMeAndPartner(supabaseAdmin: any, space_id: string, me: string) {
  const { data, error } = await supabaseAdmin
    .from("space_members")
    .select("user_id")
    .eq("space_id", space_id);

  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r: any) => r.user_id);
  const partner = ids.find((id: string) => id !== me) ?? null;
  return { me, partner };
}

async function openaiParse(text: string, context: any): Promise<Action> {
  // Structured Outputs JSON schema to force a valid action object
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["type", "payload"],
    properties: {
      type: { enum: ["create_task", "create_note", "set_meal"] },
      payload: { type: "object" },
    },
  };

  const system = `
You are Tume assistant. Convert the user's message into ONE action JSON for a couples app.

Rules:
- Use assign: "me" | "partner" | "both"
- Dates/times: return ISO string in payload.due_at if mentioned, else null/omit
- For meals: only create if a meal TITLE is explicitly provided.
- day_index: 0=Mon ... 6=Sun
- week_start: ISO date (YYYY-MM-DD) for Monday of that week, based on America/Los_Angeles.
- cooked_by/dishes_cleaned_by: "me"|"partner"|"both"|"unknown"
Return only JSON that matches schema.
`;

  const body = {
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: `Context: ${JSON.stringify(context)}\nUser: ${text}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "tume_action", schema, strict: true },
    },
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) throw new Error(`OpenAI error: ${await r.text()}`);
  const out = await r.json();

  // Responses API returns content in output; easiest is output_text convenience isn't available here.
  // Find the first JSON text chunk.
  const textOut =
    out.output?.find((x: any) => x.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text;

  if (!textOut) throw new Error("OpenAI returned no JSON text.");
  return JSON.parse(textOut);
}

async function ensureMealWeek(supabaseAdmin: any, space_id: string, week_start: string) {
  // Find or create meal_weeks row
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("meal_weeks")
    .select("id")
    .eq("space_id", space_id)
    .eq("week_start", week_start)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (existing?.id) return existing.id;

  const { data: ins, error: insErr } = await supabaseAdmin
    .from("meal_weeks")
    .insert({ space_id, week_start })
    .select("id")
    .single();

  if (insErr) throw new Error(insErr.message);
  return ins.id;
}

Deno.serve(async (req) => {
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Use the caller’s JWT to know who "me" is
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "Missing auth" }, 401);

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid auth" }, 401);

    const me = userData.user.id;

    const { space_id, text } = await req.json();
    if (!space_id || !text) return json({ error: "space_id and text required" }, 400);

    const { partner } = await getMeAndPartner(supabaseAdmin, space_id, me);

    const action = await openaiParse(text, { space_id, me, partner, tz: "America/Los_Angeles" });

    // APPLY action to DB
    if (action.type === "create_task") {
      const assign = action.payload.assign;
      const assigned_to =
        assign === "me" ? me : assign === "partner" ? partner : me; // for 'both' store once

      if ((assign === "partner" || assign === "both") && !partner) {
        return json({ error: "No partner in space yet." }, 400);
      }

      const assigned_scope = assign === "both" ? "both" : "single";

      const { data, error } = await supabaseAdmin
        .from("tasks")
        .insert({
          space_id,
          created_by: me,
          assigned_to,
          assigned_scope,
          title: action.payload.title,
          description: action.payload.description ?? null,
          due_at: action.payload.due_at ?? null,
          state: "pending",
          is_completed: false,
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return json({ ok: true, created: { type: "task", row: data } });
    }

    if (action.type === "create_note") {
      const { data: note, error: noteErr } = await supabaseAdmin
        .from("notes")
        .insert({
          space_id,
          owner_id: me,
          visibility: action.payload.visibility,
          title: action.payload.title,
          content: action.payload.content ?? null,
          is_checklist: Array.isArray(action.payload.checklist_items) && action.payload.checklist_items.length > 0,
        })
        .select("*")
        .single();

      if (noteErr) throw new Error(noteErr.message);

      if (Array.isArray(action.payload.checklist_items) && action.payload.checklist_items.length > 0) {
        const items = action.payload.checklist_items.map((t, idx) => ({
          note_id: note.id,
          text: t,
          is_done: false,
          position: idx,
        }));
        const { error: itemsErr } = await supabaseAdmin.from("note_items").insert(items);
        if (itemsErr) throw new Error(itemsErr.message);
      }

      return json({ ok: true, created: { type: "note", row: note } });
    }

    if (action.type === "set_meal") {
      // Only create if title exists
      if (!action.payload.title?.trim()) {
        return json({ ok: true, skipped: "No title provided for meal." });
      }

      const weekId = await ensureMealWeek(supabaseAdmin, space_id, action.payload.week_start);

      const cooked_by_both = action.payload.cooked_by === "both";
      const dishes_cleaned_by_both = action.payload.dishes_cleaned_by === "both";

      const cooked_by =
        cooked_by_both ? null : action.payload.cooked_by === "me" ? me : action.payload.cooked_by === "partner" ? partner : null;

      const dishes_cleaned_by =
        dishes_cleaned_by_both ? null : action.payload.dishes_cleaned_by === "me" ? me : action.payload.dishes_cleaned_by === "partner" ? partner : null;

      const { data, error } = await supabaseAdmin
        .from("meal_entries")
        .upsert(
          {
            week_id: weekId,
            day_index: action.payload.day_index,
            meal: action.payload.meal,
            title: action.payload.title,
            note: action.payload.note ?? null,
            cooked: action.payload.cooked_by !== "unknown",
            cooked_by,
            dishes_cleaned: action.payload.dishes_cleaned_by !== "unknown",
            dishes_cleaned_by,
            cooked_by_both,
            dishes_cleaned_by_both,
            rating: action.payload.rating ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "week_id,day_index,meal" as any } // if you add a unique index; otherwise remove upsert and use insert+select
        )
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return json({ ok: true, created: { type: "meal", row: data } });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});