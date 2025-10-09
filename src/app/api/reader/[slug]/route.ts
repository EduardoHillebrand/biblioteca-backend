export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import Book from "@/models/Book";
import fs from "fs";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  await dbConnect();
  const book = await Book.findOne({ slug: params.slug }).lean();
  if (!book?.pdfPath) return new Response("Not found", { status: 404 });

  const filePath = book.pdfPath;
  const stat = fs.statSync(filePath);
  const range = req.headers.get("range");

  if (!range) {
    const stream = fs.createReadStream(filePath);
    return new Response(stream as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
      },
    });
  }

  const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
  const chunk = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });
  return new Response(stream as any, {
    status: 206,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(chunk),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
    },
  });
}