export type LinkStatus = "pending" | "proses" | "selesai";
export type Tone = "pertanyaan" | "santai" | "testimoni" | "reaksi";

export interface Campaign {
  id: string;
  user_id: string;
  nama: string;
  komentar_per_link: number;
  created_at: string;
}

export interface LinkRow {
  id: string;
  campaign_id: string;
  url: string;
  kategori: string;
  status: LinkStatus;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  nama: string;
  catatan: string | null;
  warna: string | null;
  cooldown_until: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  isi: string;
  kategori: string;
  tone: Tone;
  created_at: string;
}

export interface Assignment {
  id: string;
  link_id: string;
  account_id: string;
  comment_id: string;
  status: "pending" | "selesai";
  urutan: number;
  created_at: string;
}

export interface CommentUsage {
  id: string;
  comment_id: string;
  jumlah_pakai: number;
}
