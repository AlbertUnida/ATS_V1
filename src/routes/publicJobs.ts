import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { createOrUpdateApplication } from "../services/applications";
import { sendPublicApplicationNotification } from "../services/mailer";
import { logPublicApplicationAttempt } from "../services/publicApplicationLog";

type RateEntry = {
  count: number;
  expiresAt: number;
};

const applyRateLimiter = new Map<string, RateEntry>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.PUBLIC_APPLICATIONS_RATE_LIMIT ?? 5);
const PUBLIC_APPLICATIONS_ENABLED = process.env.PUBLIC_APPLICATIONS_ENABLED !== "false";
const PUBLIC_PORTAL_BASE_URL =
  process.env.PUBLIC_PORTAL_URL?.replace(/\/$/, "") ??
  process.env.APP_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:5173";
const CAPTCHA_REQUIRED = process.env.PUBLIC_CAPTCHA_REQUIRED !== "false";
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY ?? "";
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.5);

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? req.ip ?? null;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.ip ?? null;
}

function assertRateLimit(req: Request) {
  const key = getClientIp(req) ?? "unknown";
  const now = Date.now();
  const entry = applyRateLimiter.get(key);

  if (!entry || entry.expiresAt < now) {
    applyRateLimiter.set(key, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    throw new Error("RATE_LIMIT");
  }

  entry.count += 1;
  applyRateLimiter.set(key, entry);
}

type RecaptchaVerificationResult = {
  success: boolean;
  score: number | null;
  error?: string;
};

async function verifyRecaptchaToken(token: string, ip: string | null): Promise<RecaptchaVerificationResult> {
  const params = new URLSearchParams();
  params.append("secret", RECAPTCHA_SECRET);
  params.append("response", token);
  if (ip) params.append("remoteip", ip);

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`recaptcha_request_failed_${response.status}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    score?: number;
    action?: string;
    hostname?: string;
    "error-codes"?: string[];
  };

  const score = typeof data.score === "number" ? data.score : null;

  if (!data.success) {
    return {
      success: false,
      score,
      error: data["error-codes"]?.join(",") ?? "verification_failed",
    };
  }

  if (score !== null && score < RECAPTCHA_MIN_SCORE) {
    return {
      success: false,
      score,
      error: `low_score_${score}`,
    };
  }

  return { success: true, score };
}

const router = Router();

const employmentTypeValues = [
  "tiempo_completo",
  "medio_tiempo",
  "contrato",
  "practicas",
  "temporal",
] as const;

const workModalityValues = ["presencial", "remoto", "hibrido"] as const;

const listCompaniesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get("/public/companies", async (req, res) => {
  const parsed = listCompaniesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const { search, limit } = parsed.data;
  const values: unknown[] = [];
  const conditions: string[] = ["c.is_active = TRUE"];

  if (search && search.length > 0) {
    values.push(`%${search.toLowerCase()}%`);
    const idx = values.length;
    conditions.push(`(LOWER(c.nombre) LIKE $${idx} OR LOWER(c.slug) LIKE $${idx})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit);

  try {
    const query = `
      SELECT c.company_id, c.nombre, c.slug
      FROM companies c
      ${whereClause}
      ORDER BY c.nombre ASC
      LIMIT $${values.length}
    `;
    const { rows } = await pool.query(query, values);
    return res.json({ items: rows });
  } catch (error) {
    console.error("[public] Error listing companies", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).optional(),
  company_id: z.string().uuid().optional(),
  company_slug: z.string().trim().max(120).optional(),
  employment_type: z.enum(employmentTypeValues).optional(),
  modality: z.enum(workModalityValues).optional(),
  location: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
});

router.get("/public/jobs", async (req, res) => {
  const parsed = listJobsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const {
    page: pageParam,
    limit: limitParam,
    search,
    company_id: companyId,
    company_slug: companySlug,
    employment_type: employmentType,
    modality,
    location,
    department,
  } = parsed.data;

  const pageNumber = pageParam ?? 1;
  const pageSize = limitParam ?? 10;

  const values: unknown[] = [];
  const conditions: string[] = ["j.estado = 'abierto'", "c.is_active = TRUE"];

  if (companyId) {
    values.push(companyId);
    conditions.push(`j.company_id = $${values.length}`);
  }

  if (companySlug) {
    values.push(companySlug.toLowerCase());
    conditions.push(`LOWER(c.slug) = $${values.length}`);
  }

  if (employmentType) {
    values.push(employmentType);
    conditions.push(`j.tipo_empleo = $${values.length}::employment_type`);
  }

  if (modality) {
    values.push(modality);
    conditions.push(`j.modalidad_trabajo = $${values.length}::work_modality`);
  }

  if (location && location.length > 0) {
    values.push(`%${location.toLowerCase()}%`);
    conditions.push(`LOWER(j.ubicacion) LIKE $${values.length}`);
  }

  if (department && department.length > 0) {
    values.push(`%${department.toLowerCase()}%`);
    conditions.push(`LOWER(COALESCE(j.departamento, '')) LIKE $${values.length}`);
  }

  if (search && search.length > 0) {
    values.push(`%${search.toLowerCase()}%`);
    const idx = values.length;
    conditions.push(`(LOWER(j.titulo) LIKE $${idx} OR LOWER(j.descripcion) LIKE $${idx})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countQuery = `
      SELECT COUNT(*)::bigint AS total
      FROM jobs j
      JOIN companies c ON c.company_id = j.company_id
      ${whereClause}
    `;
    const countResult = await pool.query<{ total: string }>(countQuery, values);
    const total = Number(countResult.rows[0]?.total ?? 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(pageNumber, pages);
    const offset = (normalizedPage - 1) * pageSize;

    const jobsQuery = `
      SELECT
        j.job_id,
        j.titulo,
        j.descripcion,
        j.departamento,
        j.departamento_id,
        j.tipo_empleo,
        j.modalidad_trabajo,
        j.ubicacion,
        j.rango_salarial_min,
        j.rango_salarial_max,
        j.moneda,
        j.fecha_publicacion,
        j.fecha_cierre,
        j.fecha_registro,
        c.company_id,
        c.nombre AS company_nombre,
        c.slug AS company_slug
      FROM jobs j
      JOIN companies c ON c.company_id = j.company_id
      ${whereClause}
      ORDER BY j.fecha_publicacion DESC NULLS LAST, j.fecha_registro DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const listValues = [...values, pageSize, offset];
    const { rows } = await pool.query(jobsQuery, listValues);

    return res.json({
      items: rows,
      total,
      page: normalizedPage,
      pages,
      limit: pageSize,
    });
  } catch (error) {
    console.error("[public] Error listing jobs", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/public/jobs/:id", async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  try {
    const query = `
      SELECT
        j.job_id,
        j.titulo,
        j.descripcion,
        j.departamento,
        j.departamento_id,
        j.tipo_empleo,
        j.modalidad_trabajo,
        j.ubicacion,
        j.rango_salarial_min,
        j.rango_salarial_max,
        j.moneda,
        j.fecha_publicacion,
        j.fecha_cierre,
        j.fecha_registro,
        c.company_id,
        c.nombre AS company_nombre,
        c.slug AS company_slug
      FROM jobs j
      JOIN companies c ON c.company_id = j.company_id
      WHERE j.job_id = $1 AND j.estado = 'abierto' AND c.is_active = TRUE
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [idParse.data]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Vacante no disponible" });
    }
    return res.json({ job: rows[0] });
  } catch (error) {
    console.error("[public] Error fetching job", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

const publicApplicationSchema = z.object({
  nombre_completo: z.string().trim().min(3).max(160),
  email: z.string().trim().max(200).email(),
  telefono: z.string().trim().max(60).optional(),
  resumen_url: z.string().trim().url().optional(),
  linkedin_url: z.string().trim().url().optional(),
  ciudad: z.string().trim().max(120).optional(),
  pais: z.string().trim().max(120).optional(),
  mensaje: z.string().trim().max(2000).optional(),
  salario_expectativa: z.number().nonnegative().optional(),
  moneda: z.string().trim().length(3).optional(),
  acepta_politica: z.boolean().refine((value) => value, {
    message: "Debe aceptar la política de privacidad",
  }),
  recaptcha_token: z.string().trim().min(10).max(200).optional(),
});

router.post("/public/jobs/:id/apply", async (req, res) => {
  if (!PUBLIC_APPLICATIONS_ENABLED) {
    return res.status(404).json({ message: "Postulaciones públicas deshabilitadas" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const parsed = publicApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const jobId = idParse.data;
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"]?.toString() ?? null;
  const sourceDetailsPayload = {
    channel: "portal_publico",
    ip,
    userAgent,
  };
  let recaptchaScore: number | null = null;

  try {
    assertRateLimit(req);
  } catch (error) {
    if ((error as Error).message === "RATE_LIMIT") {
      void logPublicApplicationAttempt({
        jobId,
        email: payload.email,
        ip,
        userAgent,
        source: "portal_publico",
        sourceDetails: sourceDetailsPayload,
        status: "rate_limited",
      });
      return res.status(429).json({ message: "Demasiados intentos. Vuelve a intentarlo más tarde." });
    }
    console.error("[public] Rate limit error", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }

  if (CAPTCHA_REQUIRED) {
    if (!payload.recaptcha_token) {
      void logPublicApplicationAttempt({
        jobId,
        email: payload.email,
        ip,
        userAgent,
        source: "portal_publico",
        sourceDetails: sourceDetailsPayload,
        status: "captcha_failed",
        error: "missing_token",
      });
      return res.status(400).json({ message: "Captcha requerido" });
    }
    if (!RECAPTCHA_SECRET) {
      console.error("[public] RECAPTCHA_SECRET_KEY no configurado");
      return res.status(500).json({ message: "Captcha no disponible" });
    }

    try {
      const verification = await verifyRecaptchaToken(payload.recaptcha_token, ip);
      recaptchaScore = verification.score;
      if (!verification.success) {
        void logPublicApplicationAttempt({
          jobId,
          email: payload.email,
          ip,
          userAgent,
          source: "portal_publico",
          sourceDetails: sourceDetailsPayload,
          status: "captcha_failed",
          error: verification.error,
          recaptchaScore,
        });
        return res.status(400).json({ message: "No se pudo validar el captcha" });
      }
    } catch (error) {
      console.error("[public] Error verificando captcha", error);
      return res.status(500).json({ message: "Error verificando captcha" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const jobResult = await client.query<{
      company_id: string;
      estado: string;
      is_active: boolean;
      titulo: string;
      company_nombre: string;
    }>(
      `
        SELECT j.company_id, j.estado, c.is_active, j.titulo, c.nombre AS company_nombre
        FROM jobs j
        JOIN companies c ON c.company_id = j.company_id
        WHERE j.job_id = $1
        FOR UPDATE
      `,
      [jobId],
    );

    if (jobResult.rowCount === 0) {
      await client.query("ROLLBACK");
      void logPublicApplicationAttempt({
        jobId,
        email: payload.email,
        ip,
        userAgent,
        source: "portal_publico",
        sourceDetails: sourceDetailsPayload,
        status: "invalid",
        error: "job_not_found",
        recaptchaScore,
      });
      return res.status(404).json({ message: "Vacante no disponible" });
    }

    const jobRow = jobResult.rows[0];
    if (jobRow.estado !== "abierto" || !jobRow.is_active) {
      await client.query("ROLLBACK");
      void logPublicApplicationAttempt({
        jobId,
        email: payload.email,
        ip,
        userAgent,
        source: "portal_publico",
        sourceDetails: sourceDetailsPayload,
        status: "job_closed",
        recaptchaScore,
      });
      return res.status(409).json({ message: "La vacante no acepta postulaciones" });
    }

    const sanitizedMessage = payload.mensaje?.trim() ? payload.mensaje.trim() : null;
    const sourceDetailsJson = JSON.stringify(sourceDetailsPayload);

    const applicationResult = await createOrUpdateApplication(client, {
      jobId,
      candidate: {
        nombre_completo: payload.nombre_completo.trim(),
        email: payload.email.trim().toLowerCase(),
        telefono: payload.telefono?.trim() ?? null,
        resumen_url: payload.resumen_url?.trim() ?? null,
        linkedin_url: payload.linkedin_url?.trim() ?? null,
        ciudad: payload.ciudad?.trim() ?? null,
        pais: payload.pais?.trim() ?? null,
        fuente: "portal_publico",
      },
      estado: "Nuevo",
      source: "portal_publico",
      sourceDetails: sourceDetailsJson,
      salarioExpectativa: payload.salario_expectativa ?? null,
      moneda: payload.moneda?.trim().toUpperCase() ?? null,
      changedBy: null,
      historyComment: sanitizedMessage ? "Postulación enviada desde portal público" : "Portal público",
    });

    const recipientsResult = await client.query<{ email: string }>(
      `
        SELECT email
        FROM users
        WHERE company_id = $1
          AND activo = TRUE
          AND invitacion_aceptada = TRUE
          AND rol::text IN ('admin', 'hr_admin')
      `,
      [jobRow.company_id],
    );

    const recipients = recipientsResult.rows.map((row) => row.email).filter(Boolean);

    if (sanitizedMessage) {
      await client.query(
        `
          INSERT INTO application_notes (application_id, autor_id, contenido, categoria)
          VALUES ($1, NULL, $2, $3)
        `,
        [applicationResult.application.application_id, sanitizedMessage, "portal_publico"],
      );
    }

    await client.query("COMMIT");

    if (!applicationResult.wasExisting && recipients.length > 0) {
      const jobUrl = `${PUBLIC_PORTAL_BASE_URL}/portal/vacantes`;
      void sendPublicApplicationNotification({
        to: recipients,
        jobTitle: jobRow.titulo,
        companyName: jobRow.company_nombre,
        candidateName: payload.nombre_completo.trim(),
        candidateEmail: payload.email.trim(),
        candidatePhone: payload.telefono?.trim() ?? null,
        message: sanitizedMessage,
        jobUrl,
      }).catch((notifyError) => {
        console.error("[public] Error enviando notificación de postulación", notifyError);
      });
    }

    void logPublicApplicationAttempt({
      jobId,
      email: payload.email,
      ip,
      userAgent,
      source: "portal_publico",
      sourceDetails: sourceDetailsPayload,
      status: applicationResult.wasExisting ? "duplicate" : "received",
      recaptchaScore,
    });

    return res.status(applicationResult.wasExisting ? 200 : 201).json({
      status: applicationResult.wasExisting ? "duplicate" : "received",
      application: applicationResult.application,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[public] Error rolling back public application", rollbackError);
    }
    console.error("[public] Error applying to job", error);
    void logPublicApplicationAttempt({
      jobId,
      email: payload.email,
      ip,
      userAgent,
      source: "portal_publico",
      sourceDetails: sourceDetailsPayload,
      status: "error",
      error: (error as Error)?.message ?? String(error),
      recaptchaScore,
    });
    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});

export default router;
