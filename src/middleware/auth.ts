import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string | undefined;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definido nas variáveis de ambiente");
}

export type JWTPayload = { sub: string; role: "admin" | "user" };

// estende o tipo do Express para evitar @ts-ignore
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      cookies?: Record<string, string>;
    }
  }
}

function parseCookies(raw?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function getToken(req: Request): string | null {
  // Authorization: Bearer xxx
  const h = req.header("authorization") || req.header("Authorization");
  if (h && h.toLowerCase().startsWith("bearer ")) {
    return h.slice(7).trim();
  }

  // cookie-parser coloca em req.cookies
  if (req.cookies?.token) return req.cookies.token;

  // fallback sem cookie-parser
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.token) return cookies.token;

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET!) as JWTPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Somente admin" });
    }
    next();
  });
}
