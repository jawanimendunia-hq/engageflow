import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { testConnection } from "@/lib/meta";

/**
 * POST: tambah credential baru atau update existing
 *   { id?: string, label?: string, access_token?: string, ad_account_id: string }
 *
 * - Tanpa id = insert baru. access_token wajib.
 * - Dengan id = update. access_token optional (kalau kosong, token tidak diganti).
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, label, access_token, ad_account_id } = body as {
    id?: string;
    label?: string;
    access_token?: string;
    ad_account_id?: string;
  };

  if (!ad_account_id) {
    return NextResponse.json(
      { error: "ad_account_id wajib" },
      { status: 400 }
    );
  }
  const cleanAcc = ad_account_id.replace(/^act_/, "").trim();

  // === UPDATE existing ===
  if (id) {
    // Validate token kalau diberikan
    if (access_token) {
      const test = await testConnection(access_token, cleanAcc);
      if (!test.ok) {
        return NextResponse.json(
          { error: `Token / ad account tidak valid: ${test.reason}` },
          { status: 400 }
        );
      }
    }

    const updates: any = {
      label: label?.trim() || null,
      ad_account_id: cleanAcc,
      updated_at: new Date().toISOString(),
    };
    if (access_token) {
      try {
        updates.access_token_encrypted = encrypt(access_token);
      } catch (e: any) {
        return NextResponse.json(
          { error: e?.message ?? "Encryption gagal" },
          { status: 500 }
        );
      }
    }

    const { error } = await supabase
      .from("meta_credentials")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id });
  }

  // === INSERT baru ===
  if (!access_token) {
    return NextResponse.json(
      { error: "access_token wajib untuk credential baru" },
      { status: 400 }
    );
  }

  const test = await testConnection(access_token, cleanAcc);
  if (!test.ok) {
    return NextResponse.json(
      { error: `Token / ad account tidak valid: ${test.reason}` },
      { status: 400 }
    );
  }

  let encrypted: string;
  try {
    encrypted = encrypt(access_token);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Encryption gagal" },
      { status: 500 }
    );
  }

  const { data, error: insErr } = await supabase
    .from("meta_credentials")
    .insert({
      user_id: user.id,
      label: label?.trim() || null,
      access_token_encrypted: encrypted,
      ad_account_id: cleanAcc,
    })
    .select("id")
    .single();
  if (insErr) {
    if (insErr.code === "23505") {
      // unique violation
      return NextResponse.json(
        {
          error:
            "Ad Account ID ini sudah terdaftar. Edit credential yang ada atau pakai akun lain.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    account_name: test.account_name,
  });
}
