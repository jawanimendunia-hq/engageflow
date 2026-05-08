import crypto from "crypto";

/**
 * AES-256-GCM encryption untuk simpan Meta access token di DB.
 *
 * ENCRYPTION_KEY harus 32 byte (64 hex char) di env var.
 * Generate dengan: `openssl rand -hex 32`
 *
 * Format ciphertext: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) {
    throw new Error(
      "ENCRYPTION_KEY env variable belum di-set. Generate dengan `openssl rand -hex 32` lalu tambahkan ke .env.local."
    );
  }
  if (k.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY harus 64 karakter hex (32 byte). Generate ulang dengan `openssl rand -hex 32`."
    );
  }
  return Buffer.from(k, "hex");
}

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM standard 12 byte
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivHex, tagHex, encHex] = payload.split(":");
  if (!ivHex || !tagHex || !encHex) {
    throw new Error("Ciphertext format tidak valid");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Mask token untuk display di UI (mis. "EAAxxx...123abc")
 */
export function maskToken(token: string): string {
  if (token.length < 12) return "***";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
