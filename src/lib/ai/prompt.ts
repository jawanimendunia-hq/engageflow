/**
 * Prompt builder + JSON parser shared antar provider.
 * Semua provider pakai prompt yang sama supaya hasil konsisten.
 */

import type { GenerateArgs, GeneratedComment, Tone } from "./types";

export function buildPrompt(args: GenerateArgs): string {
  const {
    url,
    kategori,
    count,
    adName,
    campaignName,
    primaryText,
    headline,
    description,
  } = args;

  const hasPrimary = primaryText && primaryText.length > 0;

  const ctx: string[] = [`Kategori produk: ${kategori}`];
  if (hasPrimary) {
    ctx.push("");
    ctx.push("=== ISI POSTINGAN IKLAN (caption asli yang ditulis advertiser) ===");
    ctx.push(primaryText!);
    ctx.push("=== END ISI POSTINGAN ===");
  }
  if (headline) ctx.push(`Headline: ${headline}`);
  if (description) ctx.push(`Description: ${description}`);
  if (adName) ctx.push(`Nama ad (internal): ${adName}`);
  if (campaignName) ctx.push(`Nama campaign (internal): ${campaignName}`);
  ctx.push(`URL referensi: ${url}`);

  const focusInstruction = hasPrimary
    ? `WAJIB: baca ISI POSTINGAN di atas baik-baik. Tulis testimoni seolah-olah kamu SUDAH PERNAH BELI produk ini. Sebutkan / kaitkan dengan fitur, harga, atau detail yang disebut di postingan supaya terasa otentik. Jangan ngarang fitur yang tidak ada.`
    : `Tidak ada caption postingan tersedia. Tulis testimoni positif yang relevan dengan kategori "${kategori}" secara umum (mis. lama pemakaian, kualitas, kepuasan).`;

  return `Buat ${count} komentar Bahasa Indonesia untuk postingan iklan Facebook ini.

KONTEKS:
${ctx.join("\n")}

GAYA WAJIB SEMUA KOMENTAR:
- Posisi: seolah-olah kamu SUDAH PERNAH BELI / PAKAI produk ini (testimoni pembeli sebelumnya)
- Nada: POSITIF — puas, suka, recommend, gak nyesel beli
- Bahasa: SANTAI / casual sehari-hari, BUKAN baku, BUKAN formal

${focusInstruction}

CONTOH GAYA YANG DIINGINKAN:
- "udah pakai 2 bulan, awet bgt sumpah"
- "beli minggu lalu kak, langsung suka 😍 worth it"
- "anak gw pakai ini tiap hari, gak ada masalah"
- "ngga nyesel beli, kualitasnya bagus bgt buat harga segini"
- "barang sampe cepet, packing rapih, recommended lah"
- "udah repeat order 2x, bener-bener cocok"
- "awalnya ragu, eh ternyata bagus parah wkwk"
- "punya ini di rumah, awet & nyaman dipake"

VARIASIKAN sudut pandang testimoni:
- Lama pemakaian (baru beli minggu lalu / udah pakai berbulan-bulan / repeat order)
- Aspek yang dipuji (kualitas, daya tahan, harga, packing, pengiriman, fungsi, kenyamanan)
- Konteks pengguna (gw / saya / aku / istri / suami / anak / mama)

ATURAN:
- Bahasa Indonesia casual sehari-hari, BUKAN baku
- Boleh emoji, slang, singkatan ("bgt", "kak", "min", "wkwk", "udh", "ga", "ngga", "lah", "deh", "sih")
- Pendek, 1-2 kalimat saja
- Variasikan struktur kalimat & sudut pandang — JANGAN monoton
- DILARANG sebut: "iklan", "promosi", "konten sponsor", "ads"
- DILARANG nanya harga / nanya stok / nanya cara order (karena kamu sudah pernah beli)
- DILARANG ragu / negatif / sarkasme
- Setiap komentar HARUS unik
- KOMENTAR HARUS CONNECT dengan isi postingan kalau ada — jangan ngarang fitur yang tidak ada
${hasPrimary ? "- Kalau di postingan disebut harga/fitur/detail spesifik, KAITKAN testimoni dengan itu (mis. 'beneran harganya segitu', 'fitur X-nya kepake bgt')" : ""}

Output JSON valid (tanpa markdown fence, tanpa preamble). Semua tone = "testimoni":
{
  "comments": [
    {"isi": "...", "tone": "testimoni"}
  ]
}

Generate tepat ${count} komentar testimoni positif santai.`;
}

const VALID_TONES: Tone[] = ["pertanyaan", "santai", "testimoni", "reaksi"];

/**
 * Parse text response (JSON murni atau dengan markdown fence) jadi GeneratedComment[].
 * Defensive — handle preamble, fence, dll.
 */
export function parseCommentsJson(text: string): GeneratedComment[] {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        throw new Error(`Response bukan JSON valid: "${cleaned.slice(0, 200)}"`);
      }
    } else {
      throw new Error(`Response bukan JSON: "${cleaned.slice(0, 200)}"`);
    }
  }

  const comments = parsed?.comments;
  if (!Array.isArray(comments)) {
    throw new Error(
      `Format salah, tidak ada array 'comments'. Got: ${JSON.stringify(parsed).slice(0, 100)}`
    );
  }

  return comments
    .filter((c: any) => c?.isi && c?.tone)
    .map((c: any) => ({
      isi: String(c.isi).trim(),
      tone: (VALID_TONES.includes(c.tone) ? c.tone : "testimoni") as Tone,
    }))
    .filter((c) => c.isi.length > 0);
}
