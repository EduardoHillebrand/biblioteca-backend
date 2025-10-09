export const runtime = "nodejs";
import { dbConnect } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import User from "@/models/User";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = getAuth();
  if (!auth) return NextResponse.json({ user: null });
  await dbConnect();
  const user = await User.findById(auth.sub).select("name email role");
  return NextResponse.json({ user });
}