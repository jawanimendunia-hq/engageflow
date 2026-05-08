/**
 * Gemini API client untuk generate komentar.
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/
 *
 * Catatan desain:
 * - TIDAK pakai URL Context tool. URL Context tidak reliable untuk FB ads
 *   (dark post / privacy wall sering blokir akses), dan kombinasi tool +
 *   responseMimeType JSON tidak didukung Gemini API. Plus saat tool dipakai,
 *   Gemini cenderung kasih preamble panjang sebelum JSON yang bisa kepotong.
 * - Pakai responseMimeType: "application/json" — dijamin output JSON murni,
 *   tidak ada preamble, tidak ada markdown fence.
 * - Konteks generate: nama ad + nama campaign + kategori (sudah cukup info
 *   untuk komentar yang relevan).
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type Tone = "pertanyaan" | "santai" | "testimoni" | "reaksi";

export interface GeneratedComment {
  isi: string;
  tone: Tone;
}

export class GeminiRateLimitError extends Error {
  constructor(
    public retryAfterSec: number = 60,
    msg?: string
  ) {
    super(msg ?? `Rate limit Gemini terkena, tunggu ${retryAfterSec} detik`);
  }
}

/**
 * Test API key + model dengan generate kecil
 */
export async function testGemini(
  apiKey: string,
  model: string = "gemini-2.5-flash"
): Promise<{ ok: true; reply: string } | { ok: false; reason: string }> {
  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with exactly: PONG" }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        reason: data?.error?.message ?? `HTTP ${res.status}`,
      };
    }
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no text)";
    return { ok: true, reply: text.trim() };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "fetch failed" };
  }
}

interface GenArgs {
  apiKey: string;
  model: string;
  url: string;
  kategori: string;
  count: number;
  adName?: string;
  campaignName?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
}

export async function generateComments(args: GenArgs): Promise<GeneratedComment[]> {
  const prompt = buildPrompt(args);
  return await callGemini({
    apiKey: args.apiKey,
    model: args.model,
    prompt,
  });
}

/**
 * Call Gemini dengan auto-retry untuk transient errors (503, "high demand").
 * Backoff: 3s, 7s, 15s. Max 3 attempts.
 */
async function callGemini(
  args: { apiKey: string; model: string; prompt: string },
  attempt: number = 1
): Promise<GeneratedComment[]> {
  const { apiKey, model, prompt } = args;
  const maxAttempts = 3;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
    throw new GeminiRateLimitError(isNaN(retryAfter) ? 60 : retryAfter);
  }

  const data = await res.json();

  // Detect transient overload (503 atau "high demand"/"overloaded")
  const errMsgRaw = data?.error?.message ?? "";
  const errMsgLower = errMsgRaw.toLowerCase();
  const isTransient =
    res.status === 503 ||
    errMsgLower.includes("high demand") ||
    errMsgLower.includes("overloaded") ||
    errMsgLower.includes("temporarily unavailable") ||
    errMsgLower.includes("try again later");

  if (!res.ok && isTransient && attempt < maxAttempts) {
    const waitMs = [3000, 7000, 15000][attempt - 1] ?? 15000;
    console.warn(
      `Gemini transient error (attempt ${attempt}/${maxAttempts}), retry in ${waitMs}ms:`,
      errMsgRaw
    );
    await new Promise((r) => setTimeout(r, waitMs));
    return await callGemini(args, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(errMsgRaw || `Gemini API ${res.status}`);
  }

  // Gabung semua text parts (jaga-jaga kalau response punya banyak part)
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p: any) => p?.text ?? "")
    .filter(Boolean)
    .join("");

  if (!text) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    const blockReason = data?.promptFeedback?.blockReason;
    throw new Error(
      `Response Gemini kosong${
        finishReason ? ` (finish: ${finishReason})` : ""
      }${blockReason ? ` (block: ${blockReason})` : ""}`
    );
  }

  // Parse JSON. Karena pakai responseMimeType, harusnya JSON murni.
  // Tetap defensive: strip markdown fence dan extract object kalau ada preamble.
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

  const validTones: Tone[] = ["pertanyaan", "santai", "testimoni", "reaksi"];
  return comments
    .filter((c: any) => c?.isi && c?.tone)
    .map((c: any) => ({
      isi: String(c.isi).trim(),
      tone: validTones.includes(c.tone) ? (c.tone as Tone) : "santai",
    }))
    .filter((c) => c.isi.length > 0);
}

function buildPrompt({
  url,
  kategori,
  count,
  adName,
  campaignName,
  primaryText,
  headline,
  description,
}: {
  url: string;
  kategori: string;
  count: number;
  adName?: string;
  campaignName?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
}): string {
  // Primary text adalah caption/copy iklan yang ditulis advertiser — ini info
  // PALING PENTING untuk komentar yang relevan. Headline & description
  // tambahan kalau ada.
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
    ? `WAJIB: baca ISI POSTINGAN di atas baik-baik. Komentar HARUS relevan dengan apa yang dijual / fitur / keunggulan / harga / cara order yang disebut di postingan. Jangan asumsikan kegunaan produk yang tidak disebut.`
    : `Tidak ada caption postingan tersedia. Buat komentar yang relevan dengan kategori "${kategori}" secara umum.`;

  return `Buat ${count} komentar Bahasa Indonesia untuk postingan iklan Facebook ini.

KONTEKS:
${ctx.join("\n")}

${focusInstruction}

VARIASIKAN TONE — gunakan kombinasi 4 jenis:
- "pertanyaan" → tanya soal harga/stok/cara order/lokasi/ukuran/warna SESUAI yang ditampilkan di postingan
- "santai" → komentar santai positif/expressive sesuai konteks (mis. "keren bgt", "lucu deh", "bagus")
- "testimoni" → seolah sudah pakai dan suka, MENTION fitur spesifik yang disebut di caption
- "reaksi" → reaksi singkat ekspresif (mis. "wow!", "njir mantep", "gilaaa", "🤩")

ATURAN:
- Bahasa Indonesia casual sehari-hari, BUKAN baku
- Boleh emoji, slang, singkatan ("bgt", "kak", "min", "wkwk", "ges")
- Pendek, 1-2 kalimat saja
- Variasikan struktur kalimat — JANGAN monoton
- DILARANG sebut: "iklan", "promosi", "konten sponsor", "ads"
- Tampilkan natural seperti orang yang bener-bener tertarik
- Setiap komentar HARUS unik
- KOMENTAR HARUS CONNECT dengan isi postingan kalau ada — jangan ngarang konteks yang tidak ada
${hasPrimary ? "- Kalau di postingan disebut harga, fitur, atau detail spesifik, KAITKAN komentar dengan itu" : ""}

Output JSON:
{
  "comments": [
    {"isi": "...", "tone": "santai"}
  ]
}

Generate tepat ${count} komentar.`;
}