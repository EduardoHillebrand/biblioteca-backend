import { Schema, models, model } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user", index: true },
    favorites: [{ type: Schema.Types.ObjectId, ref: "Book" }],
  },
  { timestamps: true }
);

export default models.User || model("User", UserSchema);