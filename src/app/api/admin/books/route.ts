export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import Book from "@/models/Book";
import { saveBuffer } from "@/lib/storage";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(req: Request) {
  const auth = getAuth();
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const form = await req.formData();
  const metaField = form.get("meta");
  const pdf = form.get("pdf") as File | null;
  const cover = form.get("cover") as File | null;
  if (!metaField || !pdf || !cover) return NextResponse.json({ error: "Campos ausentes" }, { status: 400 });

  const metaStr = typeof metaField === "string" ? metaField : await metaField.text();
  const meta = JSON.parse(metaStr);

  await dbConnect();
  const slug = meta.slug || slugify(meta.title);

  const pdfBuf = Buffer.from(await pdf.arrayBuffer());
  const coverBuf = Buffer.from(await cover.arrayBuffer());

  const pdfPath = saveBuffer(pdfBuf, "books", `${slug}.pdf`);
  const coverPath = saveBuffer(coverBuf, "covers", `${slug}.jpg`);

  const book = await Book.create({
    slug,
    title: meta.title,
    authors: meta.authors || [],
    year: meta.year,
    language: meta.language,
    tags: meta.tags || [],
    description: meta.description,
    pdfPath,
    coverPath,
    pdfUrl: `/api/reader/${slug}`,
    coverUrl: `/api/covers/${slug}`,
  });

  return NextResponse.json({ id: book._id, slug: book.slug, pdfUrl: book.pdfUrl, coverUrl: book.coverUrl });
}