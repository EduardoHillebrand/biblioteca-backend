import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { connectDB } from "../db";
import Book, { BookLean } from "../models/Book";
import { requireAdmin } from "../middleware/auth";
import { slugify } from "../utils/slugify";
import User from "../models/User";

const router = Router();

const storageDir =
  process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
fs.mkdirSync(path.join(storageDir, "books"), { recursive: true });
fs.mkdirSync(path.join(storageDir, "covers"), { recursive: true });

// memória + limite de tamanho do arquivo
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// nome aleatório hexadecimal, ex 16 chars
function randomName(len = 16) {
  return crypto.randomBytes(len / 2).toString("hex");
}

// garante slug único no banco
async function ensureUniqueSlug(base: string) {
  let s = base;
  let i = 2;
  while (await Book.exists({ slug: s })) {
    s = `${base}-${i++}`;
  }
  return s;
}

function removeIfExists(p: string) {
  try {
    fs.rmSync(p, { force: true });
  } catch {}
}
function removeDirIfExists(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

// GET /books lista/pesquisa
router.get("/books", async (req, res) => {
  await connectDB();
  const {
    q,
    language,
    tag,
    yearFrom,
    yearTo,
    orderBy = "createdAt",
    orderDir = "desc",
  } = req.query as any;

  const filter: any = {};
  if (language) filter.language = language;
  if (tag) filter.tags = tag;
  if (yearFrom || yearTo) filter.year = {};
  if (yearFrom) filter.year.$gte = Number(yearFrom);
  if (yearTo) filter.year.$lte = Number(yearTo);

  const sort: Record<string, 1 | -1> = {};
  const allowed = new Set(["createdAt", "year", "title"]);
  const key = allowed.has(String(orderBy)) ? String(orderBy) : "createdAt";
  sort[key] = String(orderDir).toLowerCase() === "asc" ? 1 : -1;

  let query = Book.find(filter)
    .select("title authors year language tags slug coverUrl")
    .sort(sort);

  if (q) {
    const parts = String(q).trim().split(/\s+/).map(escapeRegExp);
    const re = new RegExp(parts.map((p) => `(?=.*${p})`).join(""), "i");
    query = Book.find({
      ...filter,
      $or: [{ title: re }, { description: re }, { authors: re }, { tags: re }],
    })
      .select("title authors year language tags slug coverUrl")
      .sort(sort);
  }

  const items = await query.limit(60).lean<BookLean[]>();
  res.json({ items });
});

// GET /books/:slug detalhe
router.get("/books/:slug", async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).lean<BookLean | null>();
  if (!book) return res.status(404).json({ error: "Não encontrado" });
  res.json(book);
});

// POST /admin/books cria livro (admin)
router.post(
  "/admin/books",
  requireAdmin,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "cover", maxCount: 1 },
    { name: "meta", maxCount: 1 },
  ]),
  async (req: any, res) => {
    await connectDB();

    const metaRaw =
      req.body.meta ||
      (req.files?.meta?.[0] && req.files.meta[0].buffer.toString("utf8"));
    if (!metaRaw) return res.status(400).json({ error: "meta ausente" });

    const meta = JSON.parse(metaRaw);
    if (!meta?.title) return res.status(400).json({ error: "title é obrigatório" });

    const baseSlug = meta.slug || slugify(meta.title);
    const slug = await ensureUniqueSlug(baseSlug);

    const pdfFile = req.files?.pdf?.[0];
    const coverFile = req.files?.cover?.[0];
    if (!pdfFile || !coverFile)
      return res.status(400).json({ error: "pdf e cover são obrigatórios" });

    // cria pastas por slug
    const bookDir = path.join(storageDir, "books", slug);
    const coverDir = path.join(storageDir, "covers", slug);
    fs.mkdirSync(bookDir, { recursive: true });
    fs.mkdirSync(coverDir, { recursive: true });

    // nomes aleatórios mantendo extensão
    const pdfName = `${randomName(16)}.pdf`;
    const coverName = `${randomName(16)}.jpg`;

    const pdfPath = path.join(bookDir, pdfName);
    const coverPath = path.join(coverDir, coverName);

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
      pdfUrl: `/files/pdf/${slug}`, // continua servindo por slug
      coverUrl: `/files/cover/${slug}`, // idem
    });

    res.json({ id: book._id, slug: book.slug });
  }
);

// arquivos
router.get("/files/cover/:slug", async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).lean<BookLean | null>();
  if (!book?.coverPath) return res.status(404).end();
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=604800");
  fs.createReadStream(book.coverPath).pipe(res);
});

// PDF com suporte a Range
router.get("/files/pdf/:slug", async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).lean<BookLean | null>();
  if (!book?.pdfPath) return res.status(404).end();

  const stat = fs.statSync(book.pdfPath);
  const range = req.headers.range;
  if (!range) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Accept-Ranges", "bytes");
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

// DELETE /admin/books/:slug remove livro e arquivos
router.delete("/admin/books/:slug", requireAdmin, async (req, res) => {
  await connectDB();
  const slug = req.params.slug;

  const book = await Book.findOne({ slug }).lean<BookLean | null>();
  if (!book) return res.status(404).json({ error: "Não encontrado" });

  // remove referências em favoritos
  await User.updateMany(
    { favorites: book._id },
    { $pull: { favorites: book._id } }
  );

  // apaga arquivos e pastas do slug
  const bookDir = path.join(storageDir, "books", slug);
  const coverDir = path.join(storageDir, "covers", slug);

  if (book.pdfPath) removeIfExists(book.pdfPath);
  if (book.coverPath) removeIfExists(book.coverPath);
  removeDirIfExists(bookDir);
  removeDirIfExists(coverDir);

  // apaga do banco
  await Book.deleteOne({ _id: book._id });

  return res.status(204).send();
});

export default router;
