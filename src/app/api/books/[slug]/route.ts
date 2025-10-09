export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Book from "@/models/Book";

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  await dbConnect();
  const book = await Book.findOne({ slug: params.slug }).lean();
  if (!book) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(book);
}