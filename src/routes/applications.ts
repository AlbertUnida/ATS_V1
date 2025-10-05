import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { applicationStatusValues, createOrUpdateApplication } from "../services/applications";

const router = Router();

const createApplicationSchema = z.object({
  job_id: z.string().uuid(),
  candidato: z
    .object({
      nombre_completo: z.string().min(3),
      email: z.string().email(),
      telefono: z.string().optional(),
      resumen_url: z.string().url().optional(),
      linkedin_url: z.string().url().optional(),
      ciudad: z.string().optional(),
      pais: z.string().optional(),
      fuente: z.string().optional(),
    })
    .strict(),
  estado: z.enum(applicationStatusValues).optional(),
  source: z.string().min(2).optional(),
  source_details: z.string().optional(),
  salario_expectativa: z.number().nonnegative().optional(),
  moneda: z.string().min(3).max(3).optional(),
});

const updateStatusSchema = z.object({
  estado: z.enum(applicationStatusValues),
});

async function ensureApplicationInCompany(applicationId: string, companyId: string) {
  const result = await pool.query(
    `SELECT 1
     FROM applications a
     JOIN jobs j ON j.job_id = a.job_id
     WHERE a.application_id = $1 AND j.company_id = $2`,
    [applicationId, companyId],
  );
  return (result.rowCount ?? 0) > 0;
}

router.post("/api/applications", async (req, res) => {
  const parsed = createApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const {
    job_id,
    candidato,
    estado = "Nuevo",
    source,
    source_details,
    salario_expectativa,
    moneda,
  } = parsed.data;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const jobRows = await client.query(
      "SELECT company_id FROM jobs WHERE job_id = $1",
      [job_id],
    );
    if (jobRows.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "La oferta no existe" });
    }
    if (jobRows.rows[0].company_id !== companyId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No puedes operar sobre ofertas de otra compañía" });
    }

    const { application } = await createOrUpdateApplication(client, {
      jobId: job_id,
      candidate: {
        nombre_completo: candidato.nombre_completo,
        email: candidato.email,
        telefono: candidato.telefono ?? null,
        resumen_url: candidato.resumen_url ?? null,
        linkedin_url: candidato.linkedin_url ?? null,
        ciudad: candidato.ciudad ?? null,
        pais: candidato.pais ?? null,
        fuente: candidato.fuente ?? null,
      },
      estado,
      source: source ?? null,
      sourceDetails: source_details ?? null,
      salarioExpectativa: salario_expectativa ?? null,
      moneda,
      changedBy: req.currentUser?.user_id ?? null,
      historyComment: null,
    });

    await client.query("COMMIT");
    return res.status(201).json({ application });
  } catch (error: any) {
    await client.query("ROLLBACK");

    if (error?.code === "23503") {
      return res.status(400).json({
        message: "Relacion invalida (job o candidato no existe)",
        detail: error.detail,
      });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "La aplicacion ya existe", detail: error.detail });
    }

    console.error("Error creating application:", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    });
    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});

router.get("/api/jobs/:job_id/applications", async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const jobId = req.params.job_id;
  const estado = req.query.estado ? String(req.query.estado) : undefined;

  try {
    const jobAllowed = await pool.query(
      "SELECT 1 FROM jobs WHERE job_id = $1 AND company_id = $2",
      [jobId, companyId],
    );
    if (jobAllowed.rowCount === 0) {
      return res.status(403).json({ message: "No puedes acceder a las postulaciones de otra compañía" });
    }

    const params: Array<string> = [jobId];
    let whereEstado = "";
    if (estado) {
      whereEstado = "AND a.estado = $2";
      params.push(estado);
    }

    const query = `
      SELECT a.application_id,
             a.estado,
             a.applied_at,
             a.updated_at,
             a.source,
             a.source_details,
             a.salario_expectativa,
             a.moneda,
             c.candidato_id,
             c.nombre_completo,
             c.email,
             c.telefono,
             c.resumen_url,
             c.linkedin_url,
             c.ciudad,
             c.pais,
             c.fuente,
             j.titulo
      FROM applications a
      JOIN candidatos c ON c.candidato_id = a.candidato_id
      JOIN jobs j       ON j.job_id       = a.job_id
      WHERE a.job_id = $1
      ${whereEstado}
      ORDER BY a.applied_at DESC
    `;
    const { rows } = await pool.query(query, params);
    return res.json({ items: rows });
  } catch (error) {
    console.error("Error listing applications:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.put("/api/applications/:id", async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const applicationId = req.params.id;
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const allowed = await ensureApplicationInCompany(applicationId, companyId);
  if (!allowed) {
    return res.status(403).json({ message: "No puedes modificar aplicaciones de otra compañía" });
  }

  const { estado } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query(
      "SELECT estado FROM applications WHERE application_id = $1 FOR UPDATE",
      [applicationId],
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Application no encontrada" });
    }
    const previousEstado = current.rows[0].estado as (typeof applicationStatusValues)[number];

    const query = `
      UPDATE applications
      SET estado = $2::application_status, updated_at = NOW()
      WHERE application_id = $1
      RETURNING application_id, job_id, candidato_id, estado, source, source_details, salario_expectativa, moneda, applied_at, updated_at
    `;
    const { rows } = await client.query(query, [applicationId, estado]);

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Application no encontrada" });
    }

    if (previousEstado !== estado) {
      await client.query(
        `
          INSERT INTO application_stage_history (application_id, estado_anterior, estado_nuevo, comentario, cambiado_por)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [applicationId, previousEstado, estado, null, req.currentUser?.user_id ?? null],
      );
    }

    await client.query("COMMIT");
    return res.json({ application: rows[0] });
  } catch (error: any) {
    await client.query("ROLLBACK");

    console.error("Error updating application status:", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    });
    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});

export default router;
