import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { connectDB } from "../db";

const router = Router();

router.post("/register", async (req, res) => {
  const { name, email, password, role, adminCode } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "Dados inválidos" });
  await connectDB();
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error: "Email já cadastrado" });

  let userRole: "admin" | "user" = "user";
  if (role === "admin") {
    if (process.env.ADMIN_INVITE_CODE && adminCode === process.env.ADMIN_INVITE_CODE) userRole = "admin";
    else return res.status(403).json({ error: "Código de admin inválido" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role: userRole });
  return res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Dados inválidos" });
  await connectDB();
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "Credenciais inválidas" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Credenciais inválidas" });

  const token = jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET as string, { expiresIn: "7d" });
  // retorna token e também grava cookie (útil se front e back estiverem no mesmo domínio)
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });
  return res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
});

router.get("/me", async (req, res) => {
  // me simples via token no header ou cookie
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  if (!token) return res.json({ user: null });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    await connectDB();
    const user = await User.findById(payload.sub).select("name email role");
    return res.json({ user });
  } catch {
    return res.json({ user: null });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", { path: "/" });
  res.json({ ok: true });
});

export default router;