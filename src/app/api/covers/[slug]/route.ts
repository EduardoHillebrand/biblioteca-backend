export const runtime = "nodejs";
import { dbConnect } from "@/lib/db";
import Book from "@/models/Book";
import fs from "fs";

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  await dbConnect();
  const book = await Book.findOne({ slug: params.slug }).lean();
  if (!book?.coverPath) return new Response("Not found", { status: 404 });
  const stat = fs.statSync(book.coverPath);
  const stream = fs.createReadStream(book.coverPath);
  return new Response(stream as any, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=604800",
    },
  });
}