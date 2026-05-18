/**
 * GET /api/campaigns/[id]/export
 *
 * Export semua link + assignment di campaign ini sebagai file XLSX
 * dengan 2 sheet:
 *
 * 1. "Links" — 1 row per link
 *      kolom: No, URL, Kategori, Status, Komentar 1, Komentar 2, ...
 *
 * 2. "Assignments" — 1 row per assignment
 *      kolom: No, URL, Kategori, Akun, Komentar, Status
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pastikan campaign milik user
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, nama, komentar_per_link")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "Campaign tidak ditemukan" }, { status: 404 });
  }

  // Fetch links
  const { data: links, error: linkErr } = await supabase
    .from("links")
    .select("id, url, kategori, status, created_at")
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: true });

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  const linkIds = (links ?? []).map((l) => l.id);

  // Fetch semua assignment + relasi comment + account dalam satu query
  let assignments: Array<{
    id: string;
    link_id: string;
    urutan: number;
    status: string;
    comment: { isi: string; tone: string } | null;
    account: { nama: string } | null;
  }> = [];

  if (linkIds.length > 0) {
    const { data, error: asgErr } = await supabase
      .from("assignments")
      .select(
        `
        id,
        link_id,
        urutan,
        status,
        comment:comments(isi, tone),
        account:accounts(nama)
        `
      )
      .in("link_id", linkIds)
      .order("urutan", { ascending: true });

    if (asgErr) {
      return NextResponse.json({ error: asgErr.message }, { status: 500 });
    }
    // Supabase typing kadang return array untuk single relation; normalize
    assignments = (data ?? []).map((a: any) => ({
      id: a.id,
      link_id: a.link_id,
      urutan: a.urutan,
      status: a.status,
      comment: Array.isArray(a.comment) ? a.comment[0] : a.comment,
      account: Array.isArray(a.account) ? a.account[0] : a.account,
    }));
  }

  // Group assignment per link, urut by urutan
  const asgByLink = new Map<string, typeof assignments>();
  for (const a of assignments) {
    if (!asgByLink.has(a.link_id)) asgByLink.set(a.link_id, []);
    asgByLink.get(a.link_id)!.push(a);
  }

  // Hitung max komentar untuk header dinamis
  const maxKomentar = Math.max(
    campaign.komentar_per_link ?? 0,
    ...Array.from(asgByLink.values()).map((arr) => arr.length),
    0
  );

  // ====== Sheet 1: Links (1 row per link) ======
  const linksHeader = [
    "No",
    "URL",
    "Kategori",
    "Status Link",
    ...Array.from({ length: maxKomentar }, (_, i) => `Komentar ${i + 1}`),
  ];

  const linksData = (links ?? []).map((l, idx) => {
    const asgs = asgByLink.get(l.id) ?? [];
    const row: (string | number)[] = [
      idx + 1,
      l.url,
      l.kategori,
      l.status,
    ];
    for (let i = 0; i < maxKomentar; i++) {
      row.push(asgs[i]?.comment?.isi ?? "");
    }
    return row;
  });

  const ws1 = XLSX.utils.aoa_to_sheet([linksHeader, ...linksData]);

  // Atur lebar kolom
  ws1["!cols"] = [
    { wch: 5 }, // No
    { wch: 55 }, // URL
    { wch: 16 }, // Kategori
    { wch: 12 }, // Status
    ...Array.from({ length: maxKomentar }, () => ({ wch: 45 })),
  ];

  // ====== Sheet 2: Assignments (1 row per assignment) ======
  const asgHeader = [
    "No",
    "URL",
    "Kategori",
    "Akun",
    "Komentar",
    "Status Assignment",
  ];

  const asgData: (string | number)[][] = [];
  let asgIdx = 1;
  for (const l of links ?? []) {
    const asgs = asgByLink.get(l.id) ?? [];
    for (const a of asgs) {
      asgData.push([
        asgIdx++,
        l.url,
        l.kategori,
        a.account?.nama ?? "(akun terhapus)",
        a.comment?.isi ?? "(komentar terhapus)",
        a.status,
      ]);
    }
  }

  const ws2 = XLSX.utils.aoa_to_sheet([asgHeader, ...asgData]);
  ws2["!cols"] = [
    { wch: 5 },
    { wch: 55 },
    { wch: 16 },
    { wch: 20 },
    { wch: 60 },
    { wch: 16 },
  ];

  // ====== Build workbook ======
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Links");
  XLSX.utils.book_append_sheet(wb, ws2, "Assignments");

  const buf: Uint8Array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  // Cast: TS 5+ stricter typing untuk Uint8Array generic; runtime tetap BlobPart valid
  const blob = new Blob([buf as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // Filename: bersihkan nama campaign untuk filesystem-safe
  const safeName = (campaign.nama || "campaign")
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `engageflow_${safeName}_${dateStr}.xlsx`;

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
