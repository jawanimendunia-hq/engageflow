import type { Account, Comment, LinkRow, Tone } from "./types";

/**
 * Fisher–Yates shuffle (in-place, lalu return)
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pilih N komentar dengan variasi tone & frekuensi penggunaan rendah.
 *
 * Strategi:
 *  1. Sortir ascending berdasarkan jumlah_pakai (paling jarang dipakai duluan).
 *  2. Group berdasarkan tone, lalu round-robin antar tone supaya variasi tone naik.
 *  3. Acak ringan di dalam tier penggunaan yang sama agar tidak deterministik.
 */
function pickVariedComments(
  comments: Comment[],
  usageMap: Map<string, number>,
  count: number
): Comment[] {
  if (comments.length === 0 || count <= 0) return [];

  // Bucket per tone, sort tiap bucket berdasarkan usage ascending + sedikit jitter
  const byTone = new Map<Tone, Comment[]>();
  for (const c of comments) {
    const list = byTone.get(c.tone) ?? [];
    list.push(c);
    byTone.set(c.tone, list);
  }

  for (const [tone, list] of byTone) {
    list.sort((a, b) => {
      const ua = usageMap.get(a.id) ?? 0;
      const ub = usageMap.get(b.id) ?? 0;
      if (ua !== ub) return ua - ub;
      return Math.random() - 0.5;
    });
    byTone.set(tone, list);
  }

  // Round-robin antar tone (urutan tone diacak agar fair)
  const toneOrder = shuffle(Array.from(byTone.keys()));
  const picked: Comment[] = [];
  const used = new Set<string>();

  let safety = 0;
  while (picked.length < count && safety < 5000) {
    let progressed = false;
    for (const tone of toneOrder) {
      if (picked.length >= count) break;
      const bucket = byTone.get(tone)!;
      // Ambil komentar pertama yang belum dipakai
      const next = bucket.find((c) => !used.has(c.id));
      if (next) {
        picked.push(next);
        used.add(next.id);
        progressed = true;
      }
    }
    if (!progressed) break;
    safety++;
  }

  return picked;
}

export interface AssignmentSpec {
  link_id: string;
  account_id: string;
  comment_id: string;
  urutan: number;
}

export interface BuildAssignmentsArgs {
  links: LinkRow[];
  accounts: Account[];
  comments: Comment[];
  /** Map comment_id -> jumlah_pakai (untuk balancing antar link) */
  usage: Map<string, number>;
  /** Default 5, override per-campaign */
  perLink: number;
}

export interface BuildResult {
  assignments: AssignmentSpec[];
  /** Update usage map agar caller bisa simpan ke DB */
  updatedUsage: Map<string, number>;
  /** Link yang gagal di-assign (kategori kosong / akun kurang / komentar kurang) */
  warnings: { link_id: string; reason: string }[];
}

/**
 * Bangun assignment untuk banyak link sekaligus.
 *
 * Aturan yang ditegakkan:
 *  - Hanya komentar dengan kategori sama dengan link.
 *  - Per link: N akun unik (urutan diacak) + N komentar unik (variasi tone).
 *  - Komentar dengan jumlah_pakai kecil diprioritaskan → distribusi merata
 *    antar link berkategori sama.
 *  - Tidak ada duplikasi komentar dalam 1 link.
 */
export function buildAssignments(args: BuildAssignmentsArgs): BuildResult {
  const { links, accounts, comments, perLink } = args;
  const usage = new Map(args.usage);

  const result: AssignmentSpec[] = [];
  const warnings: BuildResult["warnings"] = [];

  // Group comments per kategori
  const commentsByKat = new Map<string, Comment[]>();
  for (const c of comments) {
    const list = commentsByKat.get(c.kategori) ?? [];
    list.push(c);
    commentsByKat.set(c.kategori, list);
  }

  const now = Date.now();
  // Akun yang masih dalam cooldown disisihkan terlebih dahulu (best-effort)
  const eligibleAccounts = accounts.filter(
    (a) => !a.cooldown_until || new Date(a.cooldown_until).getTime() <= now
  );

  // Acak urutan link supaya distribusi merata bukan sekadar urutan input
  for (const link of shuffle(links)) {
    const pool = commentsByKat.get(link.kategori) ?? [];
    if (pool.length < perLink) {
      warnings.push({
        link_id: link.id,
        reason: `Komentar kategori "${link.kategori}" hanya ${pool.length}, dibutuhkan ${perLink}`,
      });
      continue;
    }
    if (eligibleAccounts.length < perLink) {
      warnings.push({
        link_id: link.id,
        reason: `Akun aktif hanya ${eligibleAccounts.length}, dibutuhkan ${perLink}`,
      });
      continue;
    }

    const pickedAccounts = shuffle(eligibleAccounts).slice(0, perLink);
    const pickedComments = pickVariedComments(pool, usage, perLink);

    if (pickedComments.length < perLink) {
      warnings.push({
        link_id: link.id,
        reason: `Tidak cukup komentar unik untuk link ini`,
      });
      continue;
    }

    for (let i = 0; i < perLink; i++) {
      const acc = pickedAccounts[i];
      const com = pickedComments[i];
      result.push({
        link_id: link.id,
        account_id: acc.id,
        comment_id: com.id,
        urutan: i,
      });
      usage.set(com.id, (usage.get(com.id) ?? 0) + 1);
    }
  }

  return { assignments: result, updatedUsage: usage, warnings };
}

/**
 * Saran delay (hanya tampilan): rentang detik wajar untuk eksekusi manual.
 */
export function suggestDelay(): { min: number; max: number; label: string } {
  // 25–90 detik antar komentar terasa natural
  const min = 25 + Math.floor(Math.random() * 15);
  const max = min + 30 + Math.floor(Math.random() * 30);
  return { min, max, label: `${min}–${max} detik` };
}
