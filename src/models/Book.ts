import { Schema, models, model } from "mongoose";

const BookSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, index: "text" },
    authors: [{ type: String, index: true }],
    year: Number,
    language: String,
    tags: [{ type: String, index: true }],
    description: String,
    coverPath: String,  // caminho local
    coverUrl: String,   // URL pública caso use CDN no futuro
    pdfPath: String,
    pdfUrl: String,
  },
  { timestamps: true }
);

BookSchema.index({ title: "text", description: "text", tags: 1, authors: 1 });

export default models.Book || model("Book", BookSchema);