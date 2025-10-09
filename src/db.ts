import mongoose from "mongoose";

const uri = process.env.MONGODB_URI as string;
if (!uri) throw new Error("MONGODB_URI não definido");

let cached: typeof mongoose | null = null;
export async function connectDB() {
  if (cached) return cached;
  cached = await mongoose.connect(uri);
  return cached;
}