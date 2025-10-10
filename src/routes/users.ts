import { Router } from "express";
import { connectDB } from "../db";
import User from "../models/User";
import { requireAdmin } from "../middleware/auth";

const router = Router();

// GET /admin/users - lista usuários (admins primeiro)
router.get("/admin/users", requireAdmin, async (req, res) => {
    await connectDB();
    const q = (req.query.q || "").toString().trim();
    const filter: any = {};
    if (q) {
        const re = { $regex: q, $options: "i" };
        filter.$or = [{ name: re }, { email: re }];
    }

    // busca e ordena: admins primeiro, depois por nome
    const usersRaw = await User.find(filter).select("name email role").lean();
    const users = (usersRaw || []).sort((a: any, b: any) => {
        if (a.role === b.role) return String(a.name || "").localeCompare(String(b.name || ""));
        return a.role === "admin" ? -1 : 1;
    });

    const items = users.map((u: any) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role }));
    res.json({ items });
});

// DELETE /admin/users/:id - remove usuário (admin only)
router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
    await connectDB();
    const id = req.params.id;
    // evita que admin exclua a propria conta via painel
    if (req.user?.sub === id) return res.status(400).json({ error: "Não é permitido excluir a própria conta" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "Não encontrado" });

    await User.deleteOne({ _id: user._id });
    return res.status(204).send();
});

// PATCH /admin/users/:id/role - alterna role ou define explicitamente
router.patch("/admin/users/:id/role", requireAdmin, async (req, res) => {
    await connectDB();
    const id = req.params.id;
    const bodyRole = (req.body && (req.body.role as string)) || undefined;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "Não encontrado" });

    // evita que admin demita a si mesmo
    if (req.user?.sub === id && bodyRole && bodyRole !== "admin") {
        return res.status(400).json({ error: "Não é permitido alterar sua própria role" });
    }

    if (bodyRole) {
        if (bodyRole !== "admin" && bodyRole !== "user") return res.status(400).json({ error: "role inválida" });
        user.role = bodyRole as "admin" | "user";
    } else {
        // alterna
        user.role = user.role === "admin" ? "user" : "admin";
    }

    await user.save();
    return res.json({ id: String(user._id), role: user.role });
});

export default router;
