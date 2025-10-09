import { Router } from "express";
import { connectDB } from "../db";
import { requireAuth } from "../middleware/auth";
import User from "../models/User";
import Book from "../models/Book";

const router = Router();

router.get("/favorites", requireAuth, async (req, res) => {
  await connectDB();
  const user = await User.findById(req.user!.sub).populate("favorites", "title authors slug coverUrl").lean();
  res.json({ items: user?.favorites || [] });
});

router.post("/favorites", requireAuth, async (req, res) => {
  const { slug } = req.body || {};
  await connectDB();
  const book = await Book.findOne({ slug }).select("_id");
  if (!book) return res.status(404).json({ error: "Livro não encontrado" });
  await User.updateOne({ _id: req.user!.sub }, { $addToSet: { favorites: book._id } });
  res.json({ ok: true });
});

router.delete("/favorites/:slug", requireAuth, async (req, res) => {
  await connectDB();
  const book = await Book.findOne({ slug: req.params.slug }).select("_id");
  if (!book) return res.status(404).json({ error: "Livro não encontrado" });
  await User.updateOne({ _id: req.user!.sub }, { $pull: { favorites: book._id } });
  res.json({ ok: true });
});

export default router;