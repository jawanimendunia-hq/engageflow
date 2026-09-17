import type { MetaSearchResult } from "./meta";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkRow } from "./types";

export interface ImportRetryJob {
  ad: MetaSearchResult;
  kategori: string;
  count: number;
  useAi: boolean;
  linkId?: string;
  status: "pending" | "running" | "failed" | "done";
  error?: string;
  retryAfterSec?: number;
  partialComments: { isi: string; tone: string }[];
  generated: { isi: string; tone: string }[];
  accountIds: string[];
  updatedAt: string;
}

export function retryStorageKey(userId: string, campaignId: string): string {
  return `engageflow:import-retry:v1:${userId}:${campaignId}`;
}

export function loadRetryJobs(userId: string, campaignId: string): ImportRetryJob[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(retryStorageKey(userId, campaignId)) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((job): job is ImportRetryJob =>
      job && typeof job.ad?.ad_id === "string" && typeof job.ad?.post_url === "string" &&
      typeof job.kategori === "string" && Number.isInteger(job.count) && job.count >= 1 && job.count <= 30 &&
      typeof job.useAi === "boolean" && ["pending", "running", "failed", "done"].includes(job.status) &&
      Array.isArray(job.partialComments) && Array.isArray(job.generated) && Array.isArray(job.accountIds)
    );
  } catch {
    return [];
  }
}

export function saveRetryJob(userId: string, campaignId: string, job: ImportRetryJob): void {
  try {
    const others = loadRetryJobs(userId, campaignId).filter((item) => item.ad.ad_id !== job.ad.ad_id);
    // Completed jobs only need their identity, not a second copy of comments.
    const saved = job.status === "done"
      ? { ...job, partialComments: [], generated: [], accountIds: [], error: undefined }
      : job;
    localStorage.setItem(retryStorageKey(userId, campaignId), JSON.stringify([...others, saved]));
    window.dispatchEvent(new Event("engageflow-import-retry"));
  } catch {
    throw new Error("Konteks retry tidak bisa disimpan. Izinkan penyimpanan browser atau kosongkan ruang penyimpanannya sebelum import.");
  }
}

export function removeRetryJobsForLink(userId: string, campaignId: string, linkId: string): void {
  try {
    const jobs = loadRetryJobs(userId, campaignId).filter((job) => job.linkId !== linkId);
    localStorage.setItem(retryStorageKey(userId, campaignId), JSON.stringify(jobs));
    window.dispatchEvent(new Event("engageflow-import-retry"));
  } catch {
    // The link is already deleted; do not mask a successful database operation.
  }
}

/** Resolve by saved id first, then URL, always scoped to this campaign/RLS. */
export async function getOrCreateImportLink(
  supabase: SupabaseClient, campaignId: string, job: ImportRetryJob
): Promise<LinkRow> {
  if (job.linkId) {
    const { data, error } = await supabase.from("links").select("*")
      .eq("campaign_id", campaignId).eq("id", job.linkId).limit(1);
    if (error) throw new Error(error.message);
    if (data?.[0]) return data[0] as LinkRow;
  }
  const { data, error } = await supabase.from("links").select("*")
    .eq("campaign_id", campaignId).eq("url", job.ad.post_url!)
    .order("created_at", { ascending: true }).limit(1);
  if (error) throw new Error(error.message);
  if (data?.[0]) return data[0] as LinkRow;
  const result = await supabase.from("links").insert({
    campaign_id: campaignId, url: job.ad.post_url!, kategori: job.kategori,
    source_keywords: job.ad.matched_keywords ?? [], status: "pending",
  }).select().single();
  if (result.error || !result.data) throw new Error(result.error?.message ?? "Gagal insert link");
  return result.data as LinkRow;
}

export function createRetryJob(
  ad: MetaSearchResult, kategori: string, count: number, useAi: boolean
): ImportRetryJob {
  return { ad, kategori, count, useAi, status: "pending", partialComments: [], generated: [], accountIds: [], updatedAt: new Date().toISOString() };
}

/** Keep persisted mapping stable on retry; never overwrite an existing account. */
export function planRetryAssignments(
  accountIds: string[], existing: { account_id: string; urutan: number }[], target: number
): { accountId: string; urutan: number }[] {
  const used = new Set(existing.map((item) => item.account_id));
  const missing = Math.max(0, target - existing.length);
  const start = existing.reduce((max, item) => Math.max(max, item.urutan + 1), 0);
  return [...new Set(accountIds)].filter((id) => !used.has(id)).slice(0, missing)
    .map((accountId, index) => ({ accountId, urutan: start + index }));
}

export function cachedRetryComments(
  job: ImportRetryJob, existing: { account_id: string }[]
): ImportRetryJob["generated"] {
  if (job.accountIds.length !== job.generated.length) return job.generated;
  const used = new Set(existing.map((item) => item.account_id));
  return job.generated.filter((_, index) => !used.has(job.accountIds[index]));
}
