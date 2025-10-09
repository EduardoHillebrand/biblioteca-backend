// backend/src/models/User.ts
import { Schema, models, model, Types } from "mongoose";

const UserSchema = new Schema({
  name: String,
  email: { type: String, unique: true, index: true },
  passwordHash: String,
  role: { type: String, enum: ["admin","user"], default: "user" },
  favorites: [{ type: Schema.Types.ObjectId, ref: "Book" }],
}, { timestamps: true });

export type UserLean = {
  _id: Types.ObjectId;
  favorites?: Types.ObjectId[];
  role: "admin" | "user";
  name: string;
  email: string;
};

export default models.User || model("User", UserSchema);
