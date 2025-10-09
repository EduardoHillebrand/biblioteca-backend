import fs from "fs";
import path from "path";

export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

export function ensureDirs() {
  ["books", "covers"].forEach((d) => fs.mkdirSync(path.join(STORAGE_DIR, d), { recursive: true }));
}

export function saveBuffer(buf: Buffer, folder: "books" | "covers", fileName: string) {
  ensureDirs();
  const full = path.join(STORAGE_DIR, folder, fileName);
  fs.writeFileSync(full, buf);
  return full;
}