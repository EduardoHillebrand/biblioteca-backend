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
  } catch { }
}
function removeDirIfExists(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { }
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
    orderBy = "posicao",
    orderDir = "desc",
  } = req.query as any;

  const filter: any = {};
  if (language) filter.language = language;
  if (tag) filter.tags = tag;
  if (yearFrom || yearTo) filter.year = {};
  if (yearFrom) filter.year.$gte = Number(yearFrom);
  if (yearTo) filter.year.$lte = Number(yearTo);

  const sort: Record<string, 1 | -1> = {};
  const allowed = new Set(["createdAt", "year", "title", "posicao"]);
  const key = allowed.has(String(orderBy)) ? String(orderBy) : "posicao";
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

    // define posicao como max(posicao)+1 para colocar o livro no topo
    const maxPos = await Book.find().sort({ posicao: -1 }).limit(1).select("posicao").lean<{ posicao?: number }[]>();
    const nextPos = (maxPos[0]?.posicao ?? 0) + 1;

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
      posicao: nextPos,
      pdfUrl: `/files/pdf/${slug}`, // continua servindo por slug
      coverUrl: `/files/cover/${slug}`, // idem
    });

    // após criar, verifica posições e corrige se necessário
    try {
      const ok = await verifyPositions();
      if (!ok) await fixPositions();
    } catch (e) {
      console.error("verifyPositions error", e);
    }

    res.json({ id: book._id, slug: book.slug });
  }
);

// função utilitária: corrige posições para evitar duplicatas e gaps
async function fixPositions() {
  await connectDB();
  // ordena por posicao desc, em caso de empate ordena por createdAt desc (mais recente primeiro)
  const all = await Book.find().select("_id posicao createdAt").sort({ posicao: -1, createdAt: -1 }).lean<{ _id: any; posicao?: number; createdAt?: Date }[]>();

  // queremos atribuir valores sem buracos, do maior para o menor, começando em N
  const n = all.length;
  const ops: any[] = [];
  // mapping by _id position we'll set
  for (let i = 0; i < all.length; i++) {
    const target = n - i; // primeiro recebe n, último recebe 1
    const item = all[i];
    if ((item.posicao ?? 0) !== target) {
      ops.push({ updateOne: { filter: { _id: item._id }, update: { $set: { posicao: target } } } });
    }
  }

  if (ops.length) {
    await Book.bulkWrite(ops);
  }
  return { total: n, fixed: ops.length };
}

// verifica se as posições estão corretas (1..N sem duplicatas/gaps); retorna true se estava ok
async function verifyPositions(): Promise<boolean> {
  await connectDB();
  const all = await Book.find().select("posicao").lean<{ posicao?: number }[]>();
  const n = all.length;
  const posList = all.map(x => Number(x.posicao) || 0);
  // set of positions
  const posSet = new Set(posList.filter(p => p > 0));
  // quick checks: must have exactly n unique positions and max position must be n
  if (posSet.size !== n) return false;
  const maxPos = Math.max(...posList, 0);
  if (maxPos !== n) return false;
  // ensure all numbers 1..n are present
  for (let i = 1; i <= n; i++) if (!posSet.has(i)) return false;
  return true;
}

// endpoint para forçar correção de posições
router.post("/admin/books/fix-positions", requireAdmin, async (_req: any, res) => {
  try {
    const r = await fixPositions();
    return res.json(r);
  } catch (e) {
    console.error("fixPositions error", e);
    return res.status(500).json({ error: "Erro ao corrigir posições" });
  }
});

// PATCH /admin/books/reorder - atualiza posições (array de slugs na ordem desejada)
router.patch("/admin/books/reorder", requireAdmin, async (req: any, res) => {
  await connectDB();
  const { slugs } = req.body as { slugs?: string[] };
  if (!Array.isArray(slugs)) return res.status(400).json({ error: "slugs é obrigatório (array)" });

  // posicao: itens mais ao topo recebem valor maior
  // exemplo: se slugs.length = N, primeiro recebe N, ultimo recebe 1
  const n = slugs.length;
  const ops = slugs.map((s, idx) => ({
    updateOne: {
      filter: { slug: s },
      update: { $set: { posicao: n - idx } },
    },
  }));

  try {
    if (ops.length) {
      await Book.bulkWrite(ops);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("reorder error", e);
    return res.status(500).json({ error: "Falha ao reordenar" });
  }
});

// PATCH /admin/books/:slug - atualiza livro (admin)
router.patch(
  "/admin/books/:slug",
  requireAdmin,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "cover", maxCount: 1 },
    { name: "meta", maxCount: 1 },
  ]),
  async (req: any, res) => {
    await connectDB();

    const slug = req.params.slug;
    const book = await Book.findOne({ slug }).exec();
    if (!book) return res.status(404).json({ error: "Não encontrado" });

    const metaRaw = req.body.meta || (req.files?.meta?.[0] && req.files.meta[0].buffer.toString("utf8"));
    let meta = {} as any;
    if (metaRaw) {
      try { meta = JSON.parse(metaRaw); } catch { return res.status(400).json({ error: "meta inválida" }); }
    }

    // atualiza campos básicos (posicao não é alterado aqui)
    if (meta.title) book.title = meta.title;
    if (meta.authors) book.authors = meta.authors;
    if (meta.year !== undefined) book.year = meta.year;
    if (meta.language !== undefined) book.language = meta.language;
    if (meta.tags) book.tags = meta.tags;
    if (meta.description !== undefined) book.description = meta.description;

    // slug: se mudou, garante único e move arquivos de pasta
    if (meta.slug && meta.slug !== slug) {
      const baseSlug = meta.slug;
      const newSlug = await ensureUniqueSlug(baseSlug);

      const oldBookDir = path.join(storageDir, "books", slug);
      const oldCoverDir = path.join(storageDir, "covers", slug);
      const newBookDir = path.join(storageDir, "books", newSlug);
      const newCoverDir = path.join(storageDir, "covers", newSlug);

      try {
        fs.mkdirSync(path.dirname(newBookDir), { recursive: true });
        fs.mkdirSync(path.dirname(newCoverDir), { recursive: true });
        if (fs.existsSync(oldBookDir)) fs.renameSync(oldBookDir, newBookDir);
        if (fs.existsSync(oldCoverDir)) fs.renameSync(oldCoverDir, newCoverDir);
      } catch (e) {
        // ignore move errors
      }

      // atualiza caminhos se existirem
      if (book.pdfPath) book.pdfPath = book.pdfPath.replace(`/books/${slug}/`, `/books/${newSlug}/`);
      if (book.coverPath) book.coverPath = book.coverPath.replace(`/covers/${slug}/`, `/covers/${newSlug}/`);
      book.slug = newSlug;
      book.pdfUrl = `/files/pdf/${newSlug}`;
      book.coverUrl = `/files/cover/${newSlug}`;
    }

    // arquivos enviados substituem os antigos
    const pdfFile = req.files?.pdf?.[0];
    const coverFile = req.files?.cover?.[0];
    const targetSlug = book.slug;

    if (pdfFile) {
      const bookDir = path.join(storageDir, "books", targetSlug);
      fs.mkdirSync(bookDir, { recursive: true });
      // apaga pdf antigo
      if (book.pdfPath) removeIfExists(book.pdfPath);
      const pdfName = `${randomName(16)}.pdf`;
      const pdfPath = path.join(bookDir, pdfName);
      fs.writeFileSync(pdfPath, pdfFile.buffer);
      book.pdfPath = pdfPath;
      book.pdfUrl = `/files/pdf/${targetSlug}`;
    }

    if (coverFile) {
      const coverDir = path.join(storageDir, "covers", targetSlug);
      fs.mkdirSync(coverDir, { recursive: true });
      if (book.coverPath) removeIfExists(book.coverPath);
      const coverName = `${randomName(16)}.jpg`;
      const coverPath = path.join(coverDir, coverName);
      fs.writeFileSync(coverPath, coverFile.buffer);
      book.coverPath = coverPath;
      book.coverUrl = `/files/cover/${targetSlug}`;
    }

    await book.save();
    return res.json({ id: book._id, slug: book.slug });
  }
);

// arquivos
router.get("/files/cover/:slug", async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).lean<BookLean | null>();
  const coverPath = book?.coverPath as string | undefined;
  let finalCoverPath: string | null = null;

  if (coverPath) {
    try {
      if (fs.existsSync(coverPath)) finalCoverPath = coverPath;
    } catch { }
  }

  // fallback: placeholder in backend storage
  const placeholderInStorage = path.join(storageDir, "placeholder.jpg");
  try {
    if (!finalCoverPath && fs.existsSync(placeholderInStorage)) finalCoverPath = placeholderInStorage;
  } catch { }

  // se temos um arquivo final para servir, stream ele
  if (finalCoverPath) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=604800");
    const stream = fs.createReadStream(finalCoverPath);
    stream.on("error", (err) => {
      console.error("Error streaming cover:", err);
      try { if (!res.headersSent) res.status(404).end(); else res.end(); } catch { }
    });
    return stream.pipe(res);
  }

  // se não achou nada no backend, redireciona para placeholder público do frontend (se configurado)
  const frontendOrigin = process.env.FRONTEND_ORIGIN?.split(",")?.[0];
  if (frontendOrigin) {
    const url = `${frontendOrigin.replace(/\/$/, "")}/placeholder.jpg`;
    return res.redirect(url);
  }

  return res.status(404).end();
});

// PDF com suporte a Range
router.get("/files/pdf/:slug", async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).lean<BookLean | null>();
  if (!book?.pdfPath) return res.status(404).end();

  const pdfPath = book.pdfPath as string;
  let stat;
  try {
    stat = fs.statSync(pdfPath);
  } catch (e) {
    return res.status(404).end();
  }
  const range = req.headers.range;
  if (!range) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Accept-Ranges", "bytes");
    const stream = fs.createReadStream(pdfPath);
    stream.on("error", (err) => {
      console.error("Error streaming pdf:", err);
      try { if (!res.headersSent) res.status(404).end(); else res.end(); } catch { }
    });
    return stream.pipe(res);
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
  const stream = fs.createReadStream(pdfPath, { start, end });
  stream.on("error", (err) => {
    console.error("Error streaming pdf range:", err);
    try { if (!res.headersSent) res.status(404).end(); else res.end(); } catch { }
  });
  stream.pipe(res);
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

