export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import User from "@/models/User";
import Book from "@/models/Book";

export async function GET() {
  const auth = getAuth();
  if (!auth) return NextResponse.json({ items: [] });
  await dbConnect();
  const user = await User.findById(auth.sub).populate("favorites", "title authors slug coverUrl").lean();
  return NextResponse.json({ items: user?.favorites || [] });
}

export async function POST(req: Request) {
  const auth = getAuth();
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { slug } = await req.json();
  await dbConnect();
  const book = await Book.findOne({ slug }).select("_id");
  if (!book) return NextResponse.json({ error: "Livro não encontrado" }, { status: 404 });
  await User.updateOne({ _id: auth.sub }, { $addToSet: { favorites: book._id } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = getAuth();
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  await dbConnect();
  const book = await Book.findOne({ slug }).select("_id");
  if (!book) return NextResponse.json({ error: "Livro não encontrado" }, { status: 404 });
  await User.updateOne({ _id: auth.sub }, { $pull: { favorites: book._id } });
  return NextResponse.json({ ok: true });
}