export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  await dbConnect();
  const user = await User.findOne({ email });
  if (!user) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });

  const token = signToken({ sub: String(user._id), role: user.role });
  const res = NextResponse.json({ id: user._id, name: user.name, role: user.role });
  res.cookies.set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}