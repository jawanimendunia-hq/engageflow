export interface ContainerColor {
  id: string;
  label: string;
  hex: string;
  /** Untuk strip kiri / dot — berfungsi di dark bg */
  ring: string;
}

export const CONTAINER_COLORS: ContainerColor[] = [
  { id: "red",       label: "Merah",   hex: "#e74c3c", ring: "#ff6b5b" },
  { id: "blue",      label: "Biru",    hex: "#3498db", ring: "#5dadec" },
  { id: "green",     label: "Hijau",   hex: "#2ecc71", ring: "#4ee69a" },
  { id: "yellow",    label: "Kuning",  hex: "#f1c40f", ring: "#ffe14d" },
  { id: "purple",    label: "Ungu",    hex: "#9b59b6", ring: "#bf7ed8" },
  { id: "orange",    label: "Oranye",  hex: "#e67e22", ring: "#ff9d4d" },
  { id: "pink",      label: "Pink",    hex: "#e91e63", ring: "#ff5d8c" },
  { id: "turquoise", label: "Turkis",  hex: "#1abc9c", ring: "#3fe6c4" },
];

export function colorOf(id: string | null | undefined): ContainerColor | null {
  if (!id) return null;
  return CONTAINER_COLORS.find((c) => c.id === id) ?? null;
}
