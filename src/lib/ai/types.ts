/**
 * Tipe & error shared antar AI provider (Gemini, Cerebras, Groq).
 */

export type Tone = "pertanyaan" | "santai" | "testimoni" | "reaksi";

export type ProviderName = "gemini" | "cerebras" | "groq";

export interface GeneratedComment {
  isi: string;
  tone: Tone;
}

export interface GenerateArgs {
  url: string;
  kategori: string;
  count: number;
  adName?: string;
  campaignName?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
}

/**
 * Error transient yang menandakan kuota provider sudah habis / rate limited.
 * Orchestrator akan langsung skip ke provider berikutnya saat error ini muncul.
 */
export class ProviderRateLimitError extends Error {
  constructor(
    public provider: ProviderName,
    public retryAfterSec: number = 60,
    msg?: string
  ) {
    super(msg ?? `${provider} rate limited (retry in ${retryAfterSec}s)`);
  }
}

/**
 * Error non-transient (API key salah, model tidak ada, dll).
 * Orchestrator tetap skip ke provider berikutnya, tapi credential
 * harus diperbaiki user.
 */
export class ProviderError extends Error {
  constructor(
    public provider: ProviderName,
    public status: number,
    msg: string
  ) {
    super(`${provider} [${status}]: ${msg}`);
  }
}

export interface ProviderClient {
  name: ProviderName;
  /** Hasilkan komentar atau throw ProviderRateLimitError / ProviderError */
  generate(args: GenerateArgs, apiKey: string, model: string): Promise<GeneratedComment[]>;
  /** Test API key valid */
  test(apiKey: string, model: string): Promise<{ ok: true; reply: string } | { ok: false; reason: string }>;
  /** Default model kalau user belum set */
  defaultModel: string;
}

export interface ProviderCred {
  id: string;
  provider: ProviderName;
  apiKey: string;
  model: string;
  priority: number;
  enabled: boolean;
}
