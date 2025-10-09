export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Book from "@/models/Book";

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const language = searchParams.get("language") || undefined;
  const tag = searchParams.get("tag") || undefined;
  const yearFrom = Number(searchParams.get("yearFrom"));
  const yearTo = Number(searchParams.get("yearTo"));

  const filter: any = {};
  if (language) filter.language = language;
  if (tag) filter.tags = tag;
  if (!isNaN(yearFrom) || !isNaN(yearTo)) filter.year = {};
  if (!isNaN(yearFrom)) filter.year.$gte = yearFrom;
  if (!isNaN(yearTo)) filter.year.$lte = yearTo;

  let query = Book.find(filter).select("title authors year language tags slug coverUrl");
  if (q) {
    const parts = q.split(/\s+/).map(escapeRegExp);
    const re = new RegExp(parts.map((p) => `(?=.*${p})`).join(""), "i");
    query = Book.find({
      ...filter,
      $or: [
        { title: re },
        { description: re },
        { authors: re },
        { tags: re },
      ],
    }).select("title authors year language tags slug coverUrl");
  }

  const items = await query.limit(60).lean();
  return NextResponse.json({ items });
}