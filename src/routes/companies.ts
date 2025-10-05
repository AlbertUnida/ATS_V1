import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";

const router = Router();

const superAdminQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  is_active: z
    .union([z.literal("true"), z.literal("false")])
    .transform((value) => value === "true")
    .optional(),
  limit: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(1).max(200))
    .optional(),
});

router.get("/api/companies", async (req, res) => {
  const currentUser = req.currentUser;
  if (!currentUser) {
    return res.status(401).json({ message: "No autenticado" });
  }

  const baseSelect =
    "SELECT company_id, nombre, slug, ruc, plan_codigo, is_active, created_at, updated_at FROM companies";

  if (!currentUser.is_super_admin) {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({ message: "No se pudo determinar la empresa" });
    }

    try {
      const { rows } = await pool.query(`${baseSelect} WHERE company_id = $1`, [companyId]);
      return res.json({ items: rows });
    } catch (error) {
      console.error("[companies] Error listing companies for user", error);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  }

  const parsed = superAdminQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const { q, is_active: isActive, limit } = parsed.data;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (typeof q === "string" && q.length > 0) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push("(LOWER(nombre) LIKE $" + values.length + " OR LOWER(slug) LIKE $" + values.length + ")");
  }

  if (typeof isActive === "boolean") {
    values.push(isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const whereClause = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = typeof limit === "number" ? ` LIMIT ${limit}` : "";

  try {
    const { rows } = await pool.query(`${baseSelect}${whereClause} ORDER BY nombre ASC${limitClause}`, values);
    return res.json({ items: rows });
  } catch (error) {
    console.error("[companies] Error listing companies", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
