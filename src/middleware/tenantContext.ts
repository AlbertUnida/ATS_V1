import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";

type CurrentUser = {
  user_id: string;
  email: string;
  nombre: string;
  rol: string;
  company_id: string | null;
  is_super_admin: boolean;
};

type TokenPayload = {
  sub: string;
  email: string;
  company_id: string | null;
  is_super_admin: boolean;
  rol: string;
  exp?: number;
};

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Request {
      currentUser?: CurrentUser;
      companyId?: string | null;
    }
  }
}

const DEFAULT_DEV_EMAIL = process.env.DEV_DEFAULT_USER_EMAIL ?? "ana.gonzalez@pyme-demo.com";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

async function loadUserByEmail(email: string): Promise<CurrentUser | null> {
  const { rows } = await pool.query(
    `SELECT user_id, email, nombre, rol::text AS rol, company_id, is_super_admin, activo, invitacion_aceptada
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email],
  );

  if (rows.length === 0) return null;
  const user = rows[0];
  if (!user.activo || !user.invitacion_aceptada) return null;
  return user;
}

async function loadUserById(userId: string): Promise<CurrentUser | null> {
  const { rows } = await pool.query(
    `SELECT user_id, email, nombre, rol::text AS rol, company_id, is_super_admin, activo, invitacion_aceptada
     FROM users
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  if (rows.length === 0) return null;
  const user = rows[0];
  if (!user.activo || !user.invitacion_aceptada) return null;
  return user;
}

export const tenantContext: RequestHandler = async (req, res, next) => {
  const authorization = req.header("authorization");

  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.replace("Bearer ", "");
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      const user = await loadUserById(decoded.sub);
      if (!user) {
        return res.status(401).json({ message: "Token invalido" });
      }
      req.currentUser = user;
      const headerCompanyId = req.header("x-company-id");
      if (user.is_super_admin) {
        req.companyId = headerCompanyId ?? user.company_id ?? decoded.company_id ?? null;
      } else {
        req.companyId = user.company_id;
      }
      return next();
    } catch (error) {
      console.warn("[auth] Token invalido", (error as Error)?.message ?? error);
      return res.status(401).json({ message: "Token invalido" });
    }
  }

  // Development fallback using headers or default email
  const emailHeader = req.header("x-user-email");
  const email = (emailHeader ?? DEFAULT_DEV_EMAIL).toLowerCase();

  try {
    const user = await loadUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Usuario no autorizado" });
    }

    req.currentUser = user;
    const headerCompanyId = req.header("x-company-id");
    if (user.is_super_admin) {
      req.companyId = headerCompanyId ?? user.company_id ?? null;
    } else {
      if (!user.company_id) {
        return res.status(409).json({ message: "Usuario sin company asignada" });
      }
      req.companyId = user.company_id;
    }

    return next();
  } catch (error) {
    console.error("[auth] Error resolving tenant context", error);
    return res.status(500).json({ message: "Error autenticando usuario" });
  }
};
