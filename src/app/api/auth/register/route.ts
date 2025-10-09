export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { name, email, password, role, adminCode } = await req.json();
  if (!name || !email || !password) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  await dbConnect();
  const exists = await User.findOne({ email });
  if (exists) return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });

  let userRole: "admin" | "user" = "user";
  if (role === "admin") {
    if (process.env.ADMIN_INVITE_CODE && adminCode === process.env.ADMIN_INVITE_CODE) userRole = "admin";
    else return NextResponse.json({ error: "Código de admin inválido" }, { status: 403 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role: userRole });
  return NextResponse.json({ id: user._id, name: user.name, email: user.email, role: user.role });
}