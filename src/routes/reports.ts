import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";

const router = Router();

const dateRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const reportQuerySchema = z.object({
  start: z.string().regex(dateRegex).optional(),
  end: z.string().regex(dateRegex).optional(),
  status: z.enum(['received', 'duplicate', 'rate_limited', 'captcha_failed', 'job_closed', 'invalid', 'error']).optional(),
});

function canViewReports(user: Express.Request["currentUser"] | undefined) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return user.rol === "admin" || user.rol === "hr_admin";
}

router.get("/api/reports/public-applications", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewReports(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const { start, end, status } = parsed.data;
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (start) {
    values.push(start);
    conditions.push(`created_at >= $${values.length}`);
  }

  if (end) {
    values.push(`${end} 23:59:59`);
    conditions.push(`created_at <= $${values.length}`);
  }

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const summaryQuery = `
      SELECT date_trunc('day', created_at) AS day,
             status,
             COUNT(*)::bigint AS total
      FROM public_applications_log
      ${whereClause}
      GROUP BY day, status
      ORDER BY day DESC, status ASC
      LIMIT 365
    `;

    const { rows } = await pool.query(summaryQuery, values);

    const totalsQuery = `
      SELECT status, COUNT(*)::bigint AS total
      FROM public_applications_log
      ${whereClause}
      GROUP BY status
    `;

    const totals = await pool.query(totalsQuery, values);

    return res.json({
      items: rows,
      totals: totals.rows,
    });
  } catch (error) {
    console.error("[reports] Error fetching public applications report", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;

