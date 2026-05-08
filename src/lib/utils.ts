export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function parseBulkLinks(raw: string): { url: string; kategori: string }[] {
  // Format yang didukung:
  //   https://example.com | kategori
  //   https://example.com,kategori
  //   atau baris per kategori (header "##kategori") lalu link di bawahnya
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: { url: string; kategori: string }[] = [];
  let currentCat = "";

  for (const line of lines) {
    if (line.startsWith("##")) {
      currentCat = line.replace(/^##\s*/, "").trim();
      continue;
    }
    let url = "";
    let kategori = currentCat;
    if (line.includes("|")) {
      const [u, k] = line.split("|").map((s) => s.trim());
      url = u;
      kategori = k || currentCat;
    } else if (line.includes(",")) {
      const idx = line.lastIndexOf(",");
      url = line.slice(0, idx).trim();
      kategori = line.slice(idx + 1).trim() || currentCat;
    } else {
      url = line;
    }
    if (url && kategori) {
      out.push({ url, kategori });
    }
  }
  return out;
}
