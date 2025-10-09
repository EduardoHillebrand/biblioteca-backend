import { Schema, model, models } from "mongoose";

const BookSchema = new Schema({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  authors: [{ type: String, index: true }],
  year: Number,
  language: String,         // pode continuar "pt-BR"
  tags: [{ type: String, index: true }],
  description: String,
  coverPath: String,
  coverUrl: String,
  pdfPath: String,
  pdfUrl: String,
}, { timestamps: true });

// índice de texto sem usar o campo "language"
BookSchema.index(
  { title: "text", description: "text" },
  { default_language: "portuguese", language_override: "textLang" } // <- qualquer nome que você não usa
);

export default models.Book || model("Book", BookSchema);

