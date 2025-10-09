// backend/src/models/Book.ts
import { Schema, models, model, Types } from "mongoose";

const BookSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, index: true },
    authors: [{ type: String, index: true }],
    year: Number,
    language: String,
    tags: [{ type: String, index: true }],
    description: String,
    coverPath: String,
    coverUrl: String,
    pdfPath: String,
    pdfUrl: String,
    posicao: { type: Number, default: 0},
  },
  { timestamps: true }
);

export type BookLean = {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  authors: string[];
  year?: number;
  language?: string;
  tags: string[];
  description?: string;
  coverPath?: string;
  coverUrl?: string;
  pdfPath?: string;
  pdfUrl?: string;
  posicao?: number;
};

export default models.Book || model("Book", BookSchema);
