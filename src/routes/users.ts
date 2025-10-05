import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { pool } from "../config/db";
import { sendInvitationEmail } from "../services/mailer";

const router = Router();

const ALLOWED_INVITER_ROLES = new Set(["admin", "hr_admin"]);
const DEFAULT_INVITE_EXPIRATION_HOURS = 72;
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:5173";

const parseNumberFromQuery = (value: unknown) => {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

const pageParam = z.preprocess(parseNumberFromQuery, z.number().int().min(1)).optional();

const limitParam = z
  .preprocess(parseNumberFromQuery, z.number().int().min(1).max(100))
  .optional();

const updateUserSchema = z
  .object({
    rol: z.enum(["admin", "hr_admin", "recruiter", "hiring_manager", "interviewer"]).optional(),
    activo: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe proporcionar al menos un campo",
  });

const listUsersQuerySchema = z.object({
  include_invitations: z.string().optional(),
  company_id: z.string().uuid().optional(),
  page: pageParam,
  limit: limitParam,
  search: z.string().trim().max(120).optional(),
  rol: z.enum(["admin", "hr_admin", "recruiter", "hiring_manager", "interviewer"]).optional(),
  activo: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  estado: z.enum(["pendiente", "aceptado"]).optional(),
});

const historyQuerySchema = z.object({
  page: pageParam,
  limit: limitParam,
  delivery: z.enum(["todos", "enviado", "error", "pendiente"]).optional(),
  reused: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const inviteUserSchema = z.object({
  email: z.string().trim().email(),
  nombre: z.string().trim().min(2).max(120),
  rol: z.enum(["admin", "hr_admin", "recruiter", "hiring_manager", "interviewer"]),
  company_id: z.string().uuid().optional(),
  expires_in_hours: z.number().int().min(1).max(336).optional(),
});

type InviteUserPayload = z.infer<typeof inviteUserSchema>;

type DbUserRow = {
  user_id: string;
  email: string;
  nombre: string;
  rol: string;
  company_id: string | null;
  is_super_admin: boolean;
  invitacion_aceptada: boolean;
  activo: boolean;
  invitation_expires_at: string | null;
  invitation_sent_at: string | null;
  invitation_accepted_at: string | null;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function canInvite(currentUser: Express.Request["currentUser"] | undefined): boolean {
  if (!currentUser) return false;
  if (currentUser.is_super_admin) return true;
  return ALLOWED_INVITER_ROLES.has(currentUser.rol);
}

function resolveTargetCompanyId(payload: InviteUserPayload, req: Express.Request): string | null {
  const currentUser = req.currentUser;
  if (!currentUser) return null;

  if (currentUser.is_super_admin) {
    if (payload.company_id) {
      return payload.company_id;
    }
    if (req.companyId) {
      return req.companyId ?? null;
    }
    return null;
  }

  return req.companyId ?? null;
}



router.get("/api/users", async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) {
    return res.status(401).json({ message: "No autenticado" });
  }

  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const {
    include_invitations: includeInvitationsParam,
    company_id: queryCompanyId,
    page: pageParam,
    limit: limitParam,
    search,
    rol: filterRole,
    activo: filterActive,
    estado: filterEstado,
  } = parsed.data;

  const includeInvitations = includeInvitationsParam ? includeInvitationsParam !== "false" : true;

  let targetCompanyId: string | null = null;

  if (currentUser.is_super_admin) {
    targetCompanyId = queryCompanyId ?? req.companyId ?? null;
  } else {
    if (!req.companyId) {
      return res.status(400).json({ message: "No se pudo determinar la empresa" });
    }
    targetCompanyId = req.companyId;
  }

  const pageNumber = pageParam ?? 1;
  const pageSize = limitParam ?? 10;
  const offset = (pageNumber - 1) * pageSize;

  const values: unknown[] = [];
  const conditions: string[] = [];

  if (!currentUser.is_super_admin) {
    values.push(targetCompanyId);
    conditions.push(`company_id = $${values.length}`);
    conditions.push("is_super_admin = FALSE");
  } else if (targetCompanyId) {
    values.push(targetCompanyId);
    conditions.push(`(company_id = $${values.length} OR is_super_admin)`);
  }

  if (!includeInvitations) {
    conditions.push("invitacion_aceptada = TRUE");
  }

  if (filterRole) {
    values.push(filterRole);
    conditions.push(`rol = $${values.length}::user_role`);
  }

  if (typeof filterActive === "boolean") {
    values.push(filterActive);
    conditions.push(`activo = $${values.length}`);
  }

  if (filterEstado === "pendiente") {
    conditions.push("invitacion_aceptada = FALSE");
  } else if (filterEstado === "aceptado") {
    conditions.push("invitacion_aceptada = TRUE");
  }

  if (search && search.trim().length > 0) {
    const likeValue = `%${search.trim().toLowerCase()}%`;
    values.push(likeValue);
    conditions.push(`(LOWER(email) LIKE $${values.length} OR LOWER(nombre) LIKE $${values.length})`);
  }

  const baseQuery = `
    SELECT
      user_id,
      email,
      nombre,
      rol::text AS rol,
      company_id,
      is_super_admin,
      activo,
      invitacion_aceptada,
      invitation_expires_at,
      invitation_sent_at,
      invitation_accepted_at
    FROM users
  `;

  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = ' ORDER BY invitacion_aceptada ASC, LOWER(nombre) ASC';
  const finalQuery = `${baseQuery}${whereClause}${orderClause} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

  try {
    const queryValues = [...values, pageSize, offset];
    const { rows } = await pool.query<DbUserRow>(finalQuery, queryValues);
    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total FROM users${whereClause}`,
      values,
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = pageNumber > pages ? pages : pageNumber;

    return res.json({
      items: rows,
      total,
      page: normalizedPage,
      pages,
      limit: pageSize,
    });
  } catch (error) {
    console.error('[users] Error listing users', error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/users/:id/invitations/history", async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) {
    return res.status(401).json({ message: "No autenticado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const queryParse = historyQuerySchema.safeParse(req.query);
  if (!queryParse.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: queryParse.error.flatten() });
  }

  const targetId = idParse.data;
  const { page: pageParam, limit: limitParam, delivery, reused } = queryParse.data;
  const pageNumber = pageParam ?? 1;
  const pageSize = limitParam ?? 10;

  try {
    const { rows } = await pool.query(
      `SELECT user_id, company_id, is_super_admin, email, nombre
       FROM users
       WHERE user_id = $1
       LIMIT 1`,
      [targetId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const targetUser = rows[0];

    if (!currentUser.is_super_admin) {
      if (targetUser.is_super_admin) {
        return res.status(403).json({ message: "No puede consultar este usuario" });
      }
      if (!req.companyId || targetUser.company_id !== req.companyId) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const values: Array<string | boolean> = [targetId];
    const conditions: string[] = ["e.user_id = $1"];

    if (typeof reused === "boolean") {
      values.push(reused);
      conditions.push(`e.reused_existing = $${values.length}`);
    }

    const normalizedDelivery = delivery && delivery !== "todos" ? delivery : undefined;
    if (normalizedDelivery === "enviado") {
      conditions.push("(e.email_delivery_attempted = TRUE AND e.email_delivery_success = TRUE)");
    } else if (normalizedDelivery === "error") {
      conditions.push("(e.email_delivery_attempted = TRUE AND COALESCE(e.email_delivery_success, FALSE) = FALSE)");
    } else if (normalizedDelivery === "pendiente") {
      conditions.push("e.email_delivery_attempted = FALSE");
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countQuery = `SELECT COUNT(*)::bigint AS total FROM user_invitation_events e ${whereClause}`;
    const countResult = await pool.query<{ total: string }>(countQuery, values);
    const total = Number(countResult.rows[0]?.total ?? 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(pageNumber, pages);
    const offset = (normalizedPage - 1) * pageSize;

    const historyQuery = `
      SELECT e.event_id,
             e.token_hash,
             e.accept_url,
             e.sent_at,
             e.expires_at,
             e.created_at,
             e.created_by,
             e.reused_existing,
             e.email_delivery_attempted,
             e.email_delivery_success,
             e.email_delivery_message,
             c.nombre AS created_by_nombre,
             c.email AS created_by_email
      FROM user_invitation_events e
      LEFT JOIN users c ON c.user_id = e.created_by
      ${whereClause}
      ORDER BY e.sent_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const listValues = [...values, pageSize, offset];
    const historyResult = await pool.query(historyQuery, listValues);

    return res.json({
      items: historyResult.rows,
      total,
      page: normalizedPage,
      pages,
      limit: pageSize,
    });
  } catch (error) {
    console.error('[users] Error fetching invitation history', error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.post("/api/users/invitations", async (req, res) => {
  if (!canInvite(req.currentUser)) {
    return res.status(403).json({ message: "No tiene permisos para invitar usuarios" });
  }

  const parsed = inviteUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const targetCompanyId = resolveTargetCompanyId(payload, req);

  if (!targetCompanyId) {
    return res.status(400).json({ message: "Debe indicar la empresa para la invitacion" });
  }

  let targetCompanyName: string | null = null;
  try {
    const companyResult = await pool.query<{ nombre: string }>(
      "SELECT nombre FROM companies WHERE company_id = $1 LIMIT 1",
      [targetCompanyId]
    );
    if (companyResult.rowCount === 0) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }
    targetCompanyName = companyResult.rows[0].nombre;
  } catch (error) {
    console.error('[users] Error obteniendo empresa', error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }

  const normalizedEmail = payload.email.toLowerCase();
  const trimmedName = payload.nombre.trim();
  const expiresInHours = payload.expires_in_hours ?? DEFAULT_INVITE_EXPIRATION_HOURS;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = hashToken(token);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query<DbUserRow & { password_hash: string | null }>(
      `
        SELECT
          user_id,
          email,
          nombre,
          rol::text AS rol,
          company_id,
          is_super_admin,
          invitacion_aceptada,
          activo,
          invitation_expires_at,
          invitation_sent_at,
          invitation_accepted_at,
          password_hash
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [normalizedEmail],
    );

    const expiresAtIso = expiresAt.toISOString();
    let resultRow: DbUserRow;
    let wasExisting = false;

    if ((existingResult.rowCount ?? 0) > 0) {
      const user = existingResult.rows[0];

      if (user.is_super_admin && !req.currentUser?.is_super_admin) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "No puede modificar un super admin" });
      }

      if (!req.currentUser?.is_super_admin && user.company_id !== targetCompanyId) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Ya existe un usuario con ese email para otra empresa" });
      }

      if (user.invitacion_aceptada && user.activo) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "El usuario ya tiene acceso activo" });
      }

      wasExisting = true;

      const updateResult = await client.query<DbUserRow>(
        `
          UPDATE users
          SET
            nombre = $1,
            rol = $2::user_role,
            company_id = $3,
            invitacion_aceptada = FALSE,
            activo = TRUE,
            invitation_token_hash = $4,
            invitation_expires_at = $5,
            invitation_sent_at = NOW(),
            invitation_created_by = $6,
            password_hash = NULL,
            password_updated_at = NULL,
            updated_at = NOW()
          WHERE user_id = $7
          RETURNING
            user_id,
            email,
            nombre,
            rol::text AS rol,
            company_id,
            is_super_admin,
            invitacion_aceptada,
            activo,
            invitation_expires_at,
            invitation_sent_at,
            invitation_accepted_at
        `,
        [
          trimmedName,
          payload.rol,
          targetCompanyId,
          tokenHash,
          expiresAtIso,
          req.currentUser?.user_id ?? null,
          user.user_id,
        ],
      );
      resultRow = updateResult.rows[0];
    } else {
      const insertResult = await client.query<DbUserRow>(
        `
          INSERT INTO users (
            nombre,
            email,
            rol,
            company_id,
            is_super_admin,
            activo,
            invitacion_aceptada,
            invitation_token_hash,
            invitation_expires_at,
            invitation_sent_at,
            invitation_created_by
          ) VALUES ($1, $2, $3::user_role, $4, FALSE, TRUE, FALSE, $5, $6, NOW(), $7)
          RETURNING
            user_id,
            email,
            nombre,
            rol::text AS rol,
            company_id,
            is_super_admin,
            invitacion_aceptada,
            activo,
            invitation_expires_at,
            invitation_sent_at,
            invitation_accepted_at
        `,
        [
          trimmedName,
          normalizedEmail,
          payload.rol,
          targetCompanyId,
          tokenHash,
          expiresAtIso,
          req.currentUser?.user_id ?? null,
        ],
      );
      resultRow = insertResult.rows[0];
    }

    await client.query("COMMIT");

    let acceptUrl: string;
    try {
      acceptUrl = new URL(`/invitations/${token}`, APP_BASE_URL).toString();
    } catch {
      acceptUrl = `${APP_BASE_URL.replace(/\/$/, '')}/invitations/${token}`;
    }

    const emailDelivery = await sendInvitationEmail({
      to: normalizedEmail,
      nombre: trimmedName,
      companyName: targetCompanyName,
      acceptUrl,
      expiresAt: expiresAtIso,
    });

    try {
      await client.query(
        'INSERT INTO user_invitation_events (user_id, token_hash, accept_url, expires_at, created_by, reused_existing, email_delivery_attempted, email_delivery_success, email_delivery_message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
          resultRow.user_id,
          tokenHash,
          acceptUrl,
          expiresAtIso,
          req.currentUser?.user_id ?? null,
          wasExisting,
          emailDelivery.attempted,
          emailDelivery.success ?? null,
          emailDelivery.message ?? null,
        ],
      );
    } catch (historyError) {
      console.error('[users] Error recording invitation event', historyError);
    }

    const responsePayload = {
      user: resultRow,
      invitation: {
        token,
        expires_at: expiresAtIso,
        accept_url: acceptUrl,
      },
      reused_existing: wasExisting,
      email_delivery: emailDelivery,
      company: targetCompanyName
        ? { company_id: targetCompanyId, nombre: targetCompanyName }
        : null,
    };

    return res.status(wasExisting ? 200 : 201).json(responsePayload);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[users] Error rolling back invitation", rollbackError);
    }
    console.error("[users] Error creating invitation", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});





router.patch("/api/users/:id", async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) {
    return res.status(401).json({ message: "No autenticado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const payloadResult = updateUserSchema.safeParse(req.body);
  if (!payloadResult.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: payloadResult.error.flatten() });
  }

  const targetId = idParse.data;
  const payload = payloadResult.data;

  try {
    const userQuery = await pool.query(
      `SELECT user_id, company_id, is_super_admin, rol::text AS rol, invitacion_aceptada
       FROM users
       WHERE user_id = $1
       LIMIT 1`,
      [targetId],
    );

    if (userQuery.rowCount === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const targetUser = userQuery.rows[0];

    if (!currentUser.is_super_admin) {
      if (targetUser.is_super_admin) {
        return res.status(403).json({ message: "No puede modificar este usuario" });
      }
      if (!req.companyId || targetUser.company_id !== req.companyId) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const updates: string[] = [];
    const values: Array<string | boolean> = [];
    let index = 1;

    if (Object.prototype.hasOwnProperty.call(payload, "rol")) {
      updates.push(`rol = $${index++}::user_role`);
      values.push(payload.rol ?? targetUser.rol);
    }

    if (Object.prototype.hasOwnProperty.call(payload, "activo")) {
      updates.push(`activo = $${index++}`);
      values.push(payload.activo ?? false);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No hay cambios" });
    }

    const query = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = $${index} RETURNING user_id, email, nombre, rol::text AS rol, company_id, is_super_admin, invitacion_aceptada, activo, invitation_expires_at, invitation_sent_at, invitation_accepted_at`;
    values.push(targetId);

    const updated = await pool.query(query, values);
    return res.json({ user: updated.rows[0] });
  } catch (error) {
    console.error('[users] Error updating user', error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;



