import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";

const router = Router();

const createNoteSchema = z.object({
  autor_id: z.string().uuid(),
  contenido: z.string().min(1, "El contenido es requerido"),
  categoria: z.string().max(120).optional(),
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

router.get("/api/applications/:id/stage-history", async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const applicationId = req.params.id;

  if (!(await ensureApplicationInCompany(applicationId, companyId))) {
    return res.status(404).json({ message: "Application no encontrada para la compañía" });
  }

  try {
    const query = `
      SELECT h.stage_history_id,
             h.estado_anterior,
             h.estado_nuevo,
             h.comentario,
             h.cambiado_por,
             u.nombre AS cambiado_por_nombre,
             u.email AS cambiado_por_email,
             h.changed_at
      FROM application_stage_history h
      LEFT JOIN users u ON u.user_id = h.cambiado_por
      WHERE h.application_id = $1
      ORDER BY h.changed_at DESC
    `;
    const { rows } = await pool.query(query, [applicationId]);
    return res.json({ items: rows });
  } catch (error) {
    console.error("Error listando stage history:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/applications/:id/notes", async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const applicationId = req.params.id;

  if (!(await ensureApplicationInCompany(applicationId, companyId))) {
    return res.status(404).json({ message: "Application no encontrada para la compañía" });
  }

  try {
    const query = `
      SELECT n.note_id,
             n.contenido,
             n.categoria,
             n.autor_id,
             u.nombre AS autor_nombre,
             u.email AS autor_email,
             n.created_at,
             n.updated_at
      FROM application_notes n
      LEFT JOIN users u ON u.user_id = n.autor_id
      WHERE n.application_id = $1
      ORDER BY n.created_at DESC
    `;
    const { rows } = await pool.query(query, [applicationId]);
    return res.json({ items: rows });
  } catch (error) {
    console.error("Error listando notas:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.post("/api/applications/:id/notes", async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const applicationId = req.params.id;
  const parsed = createNoteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  if (!(await ensureApplicationInCompany(applicationId, companyId))) {
    return res.status(404).json({ message: "Application no encontrada para la compañía" });
  }

  const { autor_id, contenido, categoria } = parsed.data;

  try {
    const userCheck = await pool.query(
      "SELECT is_super_admin FROM users WHERE user_id = $1 AND (is_super_admin OR company_id = $2)",
      [autor_id, companyId],
    );
    if ((userCheck.rowCount ?? 0) === 0) {
      return res.status(400).json({ message: "El autor indicado no pertenece a la compañía" });
    }

    const insertQuery = `
      INSERT INTO application_notes (application_id, autor_id, contenido, categoria)
      VALUES ($1, $2, $3, $4)
      RETURNING note_id,
                contenido,
                categoria,
                autor_id,
                created_at,
                updated_at
    `;
    const { rows } = await pool.query(insertQuery, [
      applicationId,
      autor_id,
      contenido.trim(),
      categoria?.trim() ?? null,
    ]);

    const note = rows[0];
    const authorQuery = await pool.query(
      "SELECT nombre AS autor_nombre, email AS autor_email FROM users WHERE user_id = $1",
      [autor_id],
    );

    return res.status(201).json({
      note: {
        ...note,
        autor_nombre: authorQuery.rows[0]?.autor_nombre ?? null,
        autor_email: authorQuery.rows[0]?.autor_email ?? null,
      },
    });
  } catch (error) {
    console.error("Error creando nota:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
