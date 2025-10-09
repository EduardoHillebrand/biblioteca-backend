import { Router } from "express";
import { connectDB } from "../db";
import { requireAuth } from "../middleware/auth";
import User from "../models/User";
import Book, { BookLean } from "../models/Book";

const router = Router();

// GET favoritos do usuário logado
router.get("/favorites", requireAuth, async (req: any, res) => {
  await connectDB();
  const u = await User.findById(req.user.sub)
    .populate("favorites", "title authors slug coverUrl")
    .lean<{ _id: any; favorites?: Pick<BookLean,"title"|"authors"|"slug"|"coverUrl">[] } | null>();

  return res.json({ items: u?.favorites ?? [] });
});

// POST adiciona favorito
router.post("/favorites", requireAuth, async (req: any, res) => {
  await connectDB();
  const { slug } = req.body as { slug?: string };
  if (!slug) return res.status(400).json({ error: "slug é obrigatório" });
  const book = await Book.findOne({ slug }).select("_id").lean<{ _id: any } | null>();
  if (!book) return res.status(404).json({ error: "Livro não encontrado" });
  await User.updateOne({ _id: req.user.sub }, { $addToSet: { favorites: book._id } });
  return res.json({ ok: true });
});

// DELETE remove favorito
router.delete("/favorites", requireAuth, async (req: any, res) => {
  await connectDB();
  const slug = String(req.query.slug || "");
  if (!slug) return res.status(400).json({ error: "slug é obrigatório" });
  const book = await Book.findOne({ slug }).select("_id").lean<{ _id: any } | null>();
  if (!book) return res.status(404).json({ error: "Livro não encontrado" });
  await User.updateOne({ _id: req.user.sub }, { $pull: { favorites: book._id } });
  return res.json({ ok: true });
});

export default router;
