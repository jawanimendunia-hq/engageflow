/**
 * Meta Graph API (Marketing API) client - read-only.
 * Hanya membaca data ads, tidak melakukan posting apapun.
 */

const API_VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export interface MetaCampaign {
  id: string;
  name: string;
  status: string; // ACTIVE, PAUSED, DELETED, ARCHIVED
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  campaign_id?: string;
  creative?: {
    id: string;
    effective_object_story_id?: string; // <page_id>_<post_id>
  };
}

export interface MetaSearchResult {
  ad_id: string;
  ad_name: string;
  ad_status: string;
  campaign_id: string;
  campaign_name: string;
  post_url: string | null;
  page_id: string | null;
  post_id: string | null;
  /** Primary text iklan (dari object_story_spec.{link,video,photo}_data.message) */
  primary_text: string | null;
  /** Headline iklan (link_data.name / video title) */
  headline: string | null;
  /** Description iklan (link_data.description) */
  description: string | null;
}

class MetaApiError extends Error {
  constructor(
    public status: number,
    public data: any
  ) {
    super(
      data?.error?.message ??
        `Meta API error ${status}: ${JSON.stringify(data).slice(0, 200)}`
    );
  }
}

/**
 * Field selector untuk endpoint /ads — request semua creative content yang
 * mungkin berisi primary text iklan. Field tersedia bervariasi tergantung
 * jenis ad (single image, video, carousel, dynamic, dll), jadi request semua
 * lalu pick mana yang ada di toSearchResult.
 */
const AD_FIELDS =
  "id,name,status,campaign{id,name}," +
  "creative{" +
  "id,effective_object_story_id,body,title," +
  "object_story_spec{" +
  "link_data{message,name,description}," +
  "video_data{message,title}," +
  "photo_data{caption}" +
  "}," +
  "asset_feed_spec{bodies,titles,descriptions}" +
  "}";

async function call(path: string, token: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const url = `${BASE}${path}?${qs.toString()}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  if (!res.ok) {
    throw new MetaApiError(res.status, data);
  }
  return data;
}

/**
 * Sama seperti `call` tapi otomatis follow pagination via paging.next.
 * Mengembalikan array gabungan dari semua halaman.
 *
 * Cap aman 50 halaman supaya tidak loop tanpa batas. Per halaman maks
 * ~100 baris (limit dari params), jadi total maks ~5000 baris.
 */
async function callPaginated(
  path: string,
  token: string,
  params: Record<string, string> = {},
  maxPages: number = 50
): Promise<any[]> {
  const out: any[] = [];
  const initialQs = new URLSearchParams({ ...params, access_token: token });
  let nextUrl: string | null = `${BASE}${path}?${initialQs.toString()}`;
  let pages = 0;
  while (nextUrl && pages < maxPages) {
    const res = await fetch(nextUrl, { method: "GET" });
    const data = await res.json();
    if (!res.ok) throw new MetaApiError(res.status, data);
    if (Array.isArray(data.data)) out.push(...data.data);
    nextUrl = data?.paging?.next ?? null;
    pages++;
  }
  return out;
}

/**
 * Cek validitas token + akses ke ad account
 */
export async function testConnection(
  token: string,
  adAccountId: string
): Promise<{ ok: true; account_name: string } | { ok: false; reason: string }> {
  try {
    const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const data = await call(`/${id}`, token, { fields: "name,account_status" });
    return { ok: true, account_name: data.name ?? id };
  } catch (e) {
    if (e instanceof MetaApiError) {
      return { ok: false, reason: e.message };
    }
    return { ok: false, reason: String(e) };
  }
}

/**
 * Cari campaign by name (CONTAIN match). Otomatis follow pagination.
 */
export async function searchCampaignsByName(
  token: string,
  adAccountId: string,
  query: string
): Promise<MetaCampaign[]> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const filtering = JSON.stringify([
    { field: "name", operator: "CONTAIN", value: query },
  ]);
  return callPaginated(`/${id}/campaigns`, token, {
    fields: "id,name,status",
    filtering,
    limit: "100",
  });
}

/**
 * Bulk: cari campaign untuk banyak keyword sekaligus, lalu dedupe
 */
export async function searchCampaignsBulk(
  token: string,
  adAccountId: string,
  keywords: string[]
): Promise<MetaCampaign[]> {
  const seen = new Map<string, MetaCampaign>();
  const errors: string[] = [];
  await Promise.all(
    keywords.map(async (kw) => {
      try {
        const rows = await searchCampaignsByName(token, adAccountId, kw);
        for (const r of rows) seen.set(r.id, r);
      } catch (e: any) {
        errors.push(`"${kw}": ${e?.message ?? "gagal"}`);
      }
    })
  );
  if (errors.length > 0 && seen.size === 0) {
    throw new Error(errors.join("; "));
  }
  return Array.from(seen.values());
}

/**
 * Cari ads by name (CONTAIN match) — search across the whole ad account.
 * Otomatis follow pagination.
 */
export async function searchAdsByName(
  token: string,
  adAccountId: string,
  query: string
): Promise<MetaSearchResult[]> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const filtering = JSON.stringify([
    { field: "ad.name", operator: "CONTAIN", value: query },
  ]);
  const rows = await callPaginated(`/${id}/ads`, token, {
    fields: AD_FIELDS,
    filtering,
    limit: "100",
  });
  return rows.map(toSearchResult);
}

/**
 * Bulk: cari ads untuk banyak keyword sekaligus, lalu dedupe
 */
export async function searchAdsBulk(
  token: string,
  adAccountId: string,
  keywords: string[]
): Promise<MetaSearchResult[]> {
  const seen = new Map<string, MetaSearchResult>();
  const errors: string[] = [];
  await Promise.all(
    keywords.map(async (kw) => {
      try {
        const rows = await searchAdsByName(token, adAccountId, kw);
        for (const r of rows) seen.set(r.ad_id, r);
      } catch (e: any) {
        errors.push(`"${kw}": ${e?.message ?? "gagal"}`);
      }
    })
  );
  if (errors.length > 0 && seen.size === 0) {
    throw new Error(errors.join("; "));
  }
  return Array.from(seen.values());
}

/**
 * Ambil semua ads dalam satu campaign. Otomatis follow pagination.
 */
export async function getAdsInCampaign(
  token: string,
  campaignId: string
): Promise<MetaSearchResult[]> {
  const rows = await callPaginated(`/${campaignId}/ads`, token, {
    fields: AD_FIELDS,
    limit: "100",
  });
  return rows.map(toSearchResult);
}

function toSearchResult(ad: any): MetaSearchResult {
  const story = ad.creative?.effective_object_story_id ?? "";
  let pageId: string | null = null;
  let postId: string | null = null;
  let postUrl: string | null = null;
  if (story.includes("_")) {
    [pageId, postId] = story.split("_", 2);
    postUrl = `https://www.facebook.com/${pageId}/posts/${postId}`;
  }

  const creative = ad.creative ?? {};
  const oss = creative.object_story_spec ?? {};

  // Cari primary text dari berbagai kemungkinan lokasi
  const primary_text =
    oss.link_data?.message ||
    oss.video_data?.message ||
    oss.photo_data?.caption ||
    creative.body ||
    creative.asset_feed_spec?.bodies?.[0]?.text ||
    null;

  const headline =
    oss.link_data?.name ||
    oss.video_data?.title ||
    creative.title ||
    creative.asset_feed_spec?.titles?.[0]?.text ||
    null;

  const description =
    oss.link_data?.description ||
    creative.asset_feed_spec?.descriptions?.[0]?.text ||
    null;

  return {
    ad_id: ad.id,
    ad_name: ad.name,
    ad_status: ad.status,
    campaign_id: ad.campaign?.id ?? "",
    campaign_name: ad.campaign?.name ?? "",
    post_url: postUrl,
    page_id: pageId,
    post_id: postId,
    primary_text: primary_text ? String(primary_text).trim() : null,
    headline: headline ? String(headline).trim() : null,
    description: description ? String(description).trim() : null,
  };
}

/**
 * Detect SKU code dari nama campaign/ad, return kategori atau null.
 * Match sebagai standalone token (dipisah oleh non-alphanumeric).
 */
export function detectKategoriFromSku(
  text: string,
  mappings: { kode: string; kategori: string }[]
): { kode: string; kategori: string } | null {
  const upper = text.toUpperCase();
  for (const m of mappings) {
    const re = new RegExp(`(?:^|[^A-Z0-9])${escapeRegex(m.kode.toUpperCase())}(?:[^A-Z0-9]|$)`);
    if (re.test(upper)) {
      return m;
    }
  }
  return null;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}