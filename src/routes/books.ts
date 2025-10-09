import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { connectDB } from "../db";
import Book from "../models/Book";
import { requireAdmin } from "../middleware/auth";
import { slugify } from "../utils/slugify";

const router = Router();
const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
fs.mkdirSync(path.join(storageDir, "books"), { recursive: true });
fs.mkdirSync(path.join(storageDir, "covers"), { recursive: true });

const upload = multer({ storage: multer.memoryStorage() });

function escapeRegExp(str: string) { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// GET /books lista/pesquisa
router.get("/books", async (req, res) => {
  await connectDB();
  const { q, language, tag, yearFrom, yearTo } = req.query as any;
  const filter: any = {};
  if (language) filter.language = language;
  if (tag) filter.tags = tag;
  if (yearFrom || yearTo) filter.year = {};
  if (yearFrom) filter.year.$gte = Number(yearFrom);
  if (yearTo) filter.year.$lte = Number(yearTo);

  let query = Book.find(filter).select("title authors year language tags slug coverUrl");
  if (q) {
    const parts = String(q).trim().split(/\s+/).map(escapeRegExp);
    const re = new RegExp(parts.map((p) => `(?=.*${p})`).join(""), "i");
    query = Book.find({
      ...filter,
      $or: [{ title: re }, { description: re }, { authors: re }, { tags: re }],
    }).select("title authors year language tags slug coverUrl");
  }

  const items = await query.limit(60).lean();
  res.json({ items });
});

// GET /books/:slug detalhe
router.get("/books/:slug", async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).lean();
  if (!book) return res.status(404).json({ error: "Não encontrado" });
  res.json(book);
});

// POST /admin/books cria livro (admin)
router.post("/admin/books", requireAdmin, upload.fields([{ name: "pdf", maxCount: 1 }, { name: "cover", maxCount: 1 }, { name: "meta", maxCount: 1 }]), async (req: any, res) => {
  await connectDB();
  const metaRaw = req.body.meta || (req.files?.meta?.[0] && req.files.meta[0].buffer.toString("utf8"));
  if (!metaRaw) return res.status(400).json({ error: "meta ausente" });
  const meta = JSON.parse(metaRaw);

  const slug = meta.slug || slugify(meta.title);
  const pdfFile = req.files?.pdf?.[0];
  const coverFile = req.files?.cover?.[0];
  if (!pdfFile || !coverFile) return res.status(400).json({ error: "pdf e cover são obrigatórios" });

  const pdfPath = path.join(storageDir, "books", `${slug}.pdf`);
  const coverPath = path.join(storageDir, "covers", `${slug}.jpg`);
  fs.writeFileSync(pdfPath, pdfFile.buffer);
  fs.writeFileSync(coverPath, coverFile.buffer);

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
    pdfUrl: `/files/pdf/${slug}`,
    coverUrl: `/files/cover/${slug}`,
  });
  res.json({ id: book._id, slug: book.slug });
});

// arquivos
router.get("/files/cover/:slug", async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).lean();
  if (!book?.coverPath) return res.status(404).end();
  res.setHeader("Content-Type", "image/jpeg");
  fs.createReadStream(book.coverPath).pipe(res);
});

// PDF com suporte a Range
router.get("/files/pdf/:slug", async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).lean();
  if (!book?.pdfPath) return res.status(404).end();

  const stat = fs.statSync(book.pdfPath);
  const range = req.headers.range;
  if (!range) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(stat.size));
    return fs.createReadStream(book.pdfPath).pipe(res);
  }
  const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
  const chunk = end - start + 1;
  res.status(206);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(chunk));
  res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  res.setHeader("Accept-Ranges", "bytes");
  fs.createReadStream(book.pdfPath, { start, end }).pipe(res);
});

export default router;
