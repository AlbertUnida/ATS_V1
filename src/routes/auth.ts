import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { pool } from "../config/db";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const JWT_SECRET: Secret = process.env.JWT_SECRET ?? "dev-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";

const invitationTokenSchema = z.object({
  token: z.string().min(10).max(200),
});

const acceptInvitationSchema = z.object({
  password: z.string().min(8),
  nombre: z.string().trim().min(2).max(120).optional(),
});

function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const lowerEmail = email.toLowerCase();

  try {
    const { rows } = await pool.query(
      `SELECT user_id, email, nombre, rol::text AS rol, company_id, is_super_admin, activo, invitacion_aceptada, password_hash
       FROM users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [lowerEmail],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    const user = rows[0];

    if (!user.activo || !user.invitacion_aceptada) {
      return res.status(403).json({ message: "La cuenta est?? inactiva o no ha sido activada" });
    }

    if (!user.password_hash) {
      return res.status(403).json({ message: "La cuenta a??n no tiene contrase??a establecida" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      await pool.query(
        `UPDATE users
         SET failed_attempts = LEAST(failed_attempts + 1, 50), updated_at = NOW()
         WHERE user_id = $1`,
        [user.user_id],
      );
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    await pool.query(
      `UPDATE users
       SET failed_attempts = 0, last_login = NOW(), updated_at = NOW(), password_updated_at = COALESCE(password_updated_at, NOW())
       WHERE user_id = $1`,
      [user.user_id],
    );

    const signOptions: SignOptions = {};
    signOptions.expiresIn = (Number.isNaN(Number(JWT_EXPIRES_IN)) ? JWT_EXPIRES_IN : Number(JWT_EXPIRES_IN)) as SignOptions["expiresIn"];

    const token = jwt.sign(
      {
        sub: user.user_id,
        email: user.email,
        company_id: user.company_id,
        is_super_admin: user.is_super_admin,
        rol: user.rol,
      },
      JWT_SECRET,
      signOptions,
    );

    return res.json({
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        company_id: user.company_id,
        is_super_admin: user.is_super_admin,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/auth/invitations/:token", async (req, res) => {
  const parsed = invitationTokenSchema.safeParse({ token: req.params.token });
  if (!parsed.success) {
    return res.status(400).json({ message: "Token invalido" });
  }

  const tokenHash = hashInvitationToken(parsed.data.token);

  try {
    const { rows } = await pool.query<{
      user_id: string;
      email: string;
      nombre: string;
      company_id: string | null;
      invitacion_aceptada: boolean;
      invitation_expires_at: string | null;
    }>(
      `SELECT user_id, email, nombre, company_id, invitacion_aceptada, invitation_expires_at
       FROM users
       WHERE invitation_token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Invitacion no encontrada" });
    }

    const user = rows[0];
    const now = Date.now();
    const expiresAt = user.invitation_expires_at ? new Date(user.invitation_expires_at).getTime() : 0;

    if (user.invitacion_aceptada) {
      return res.status(409).json({ message: "La invitacion ya fue aceptada" });
    }

    if (!expiresAt || expiresAt < now) {
      return res.status(410).json({ message: "La invitacion ha expirado" });
    }

    return res.json({
      email: user.email,
      nombre: user.nombre,
      company_id: user.company_id,
      expires_at: user.invitation_expires_at,
    });
  } catch (error) {
    console.error("[auth] Error verificando invitacion", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.post("/api/auth/invitations/:token/accept", async (req, res) => {
  const paramsParsed = invitationTokenSchema.safeParse({ token: req.params.token });
  if (!paramsParsed.success) {
    return res.status(400).json({ message: "Token invalido" });
  }

  const bodyParsed = acceptInvitationSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: bodyParsed.error.flatten() });
  }

  const tokenHash = hashInvitationToken(paramsParsed.data.token);
  const { password, nombre } = bodyParsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lookup = await client.query<{
      user_id: string;
      email: string;
      nombre: string;
      company_id: string | null;
      invitacion_aceptada: boolean;
      invitation_expires_at: string | null;
    }>(
      `SELECT user_id, email, nombre, company_id, invitacion_aceptada, invitation_expires_at
       FROM users
       WHERE invitation_token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );

    if (lookup.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Invitacion no encontrada" });
    }

    const user = lookup.rows[0];
    const now = Date.now();
    const expiresAt = user.invitation_expires_at ? new Date(user.invitation_expires_at).getTime() : 0;

    if (user.invitacion_aceptada) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La invitacion ya fue aceptada" });
    }

    if (!expiresAt || expiresAt < now) {
      await client.query("ROLLBACK");
      return res.status(410).json({ message: "La invitacion ha expirado" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const trimmedName = nombre?.trim() || null;

    await client.query(
      `UPDATE users
         SET invitacion_aceptada = TRUE,
             invitation_token_hash = NULL,
             invitation_expires_at = NULL,
             invitation_accepted_at = NOW(),
             password_hash = $1,
             password_updated_at = NOW(),
             activo = TRUE,
             failed_attempts = 0,
             nombre = COALESCE($2, nombre),
             updated_at = NOW()
       WHERE user_id = $3`,
      [passwordHash, trimmedName, user.user_id],
    );

    await client.query("COMMIT");
    return res.json({ message: "Invitacion aceptada" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[auth] Error aceptando invitacion", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});
export default router;








