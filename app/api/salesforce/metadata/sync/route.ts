import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runMetadataSync } from "@/lib/salesforce/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(["objects", "fields", "classes", "full"]).default("full"),
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  // Ownership check (defense in depth; RLS would also block).
  const { data: org, error: orgErr } = await supabase
    .from("connected_salesforce_orgs")
    .select("id")
    .eq("id", parsed.data.orgId)
    .maybeSingle();
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });
  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 });

  try {
    const result = await runMetadataSync({
      userId: user.id,
      orgId: parsed.data.orgId,
      kind: parsed.data.kind,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "sync failed", message }, { status: 500 });
  }
}
