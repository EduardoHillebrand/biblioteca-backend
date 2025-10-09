import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type JWTPayload = { sub: string; role: "admin" | "user" };

declare global {
  namespace Express { interface Request { user?: JWTPayload } }
}

function getToken(req: Request) {
  const h = req.header("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  const cookie = req.headers.cookie?.match(/(?:^|;)\s*token=([^;]+)/);
  return cookie ? decodeURIComponent(cookie[1]) : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET as string) as JWTPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Somente admin" });
    next();
  });
}