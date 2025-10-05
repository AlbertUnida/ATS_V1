import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";

const router = Router();

const createDepartmentSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  descripcion: z.string().max(1000).optional(),
  lead_user_id: z.string().uuid().optional(),
});

const updateDepartmentSchema = z
  .object({
    nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
    descripcion: z.string().max(1000).optional(),
    lead_user_id: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe proporcionar al menos un campo para actualizar",
  });

router.post("/api/departments", async (req, res) => {
  const parsed = createDepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const { nombre, descripcion, lead_user_id } = parsed.data;
  const trimmedNombre = nombre.trim();
  const trimmedDescripcion = descripcion?.trim();

  try {
    if (lead_user_id) {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM users WHERE user_id = $1 AND (is_super_admin OR company_id = $2)",
        [lead_user_id, companyId],
      );
      if (rowCount === 0) {
        return res.status(400).json({ message: "El usuario asignado no pertenece a la compañía" });
      }
    }

    const insertQuery = `
      INSERT INTO departments (nombre, descripcion, lead_user_id, company_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (company_id, nombre) DO UPDATE
        SET descripcion = COALESCE(EXCLUDED.descripcion, departments.descripcion),
            lead_user_id = EXCLUDED.lead_user_id,
            updated_at = NOW()
      RETURNING department_id, nombre, descripcion, lead_user_id, company_id, created_at, updated_at
    `;
    const { rows } = await pool.query(insertQuery, [
      trimmedNombre,
      trimmedDescripcion ?? null,
      lead_user_id ?? null,
      companyId,
    ]);
    return res.status(201).json({ department: rows[0] });
  } catch (error: any) {
    console.error("Error creating department:", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.put("/api/departments/:id", async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const departmentId = req.params.id;
  const parsed = updateDepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const payload = parsed.data;

  try {
    const { rows: existingRows } = await pool.query(
      "SELECT department_id FROM departments WHERE department_id = $1 AND company_id = $2",
      [departmentId, companyId],
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ message: "Departamento no encontrado" });
    }

    if (Object.prototype.hasOwnProperty.call(payload, "lead_user_id") && payload.lead_user_id) {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM users WHERE user_id = $1 AND (is_super_admin OR company_id = $2)",
        [payload.lead_user_id, companyId],
      );
      if (rowCount === 0) {
        return res.status(400).json({ message: "El usuario asignado no pertenece a la compañía" });
      }
    }

    const updates: string[] = [];
    const values: Array<string | null> = [];
    let index = 1;

    if (Object.prototype.hasOwnProperty.call(payload, "nombre")) {
      const trimmed = payload.nombre?.trim() ?? null;
      updates.push(`nombre = $${index++}`);
      values.push(trimmed);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "descripcion")) {
      const trimmed = payload.descripcion?.trim() ?? null;
      updates.push(`descripcion = $${index++}`);
      values.push(trimmed);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "lead_user_id")) {
      updates.push(`lead_user_id = $${index++}`);
      values.push(payload.lead_user_id ?? null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No hay campos para actualizar" });
    }

    const updateQuery = `
      UPDATE departments
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE department_id = $${index++} AND company_id = $${index}
      RETURNING department_id, nombre, descripcion, lead_user_id, company_id, created_at, updated_at
    `;
    values.push(departmentId, companyId);

    const { rows } = await pool.query(updateQuery, values);
    return res.json({ department: rows[0] });
  } catch (error) {
    console.error("Error updating department:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.delete("/api/departments/:id", async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const departmentId = req.params.id;

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM departments WHERE department_id = $1 AND company_id = $2",
      [departmentId, companyId],
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Departamento no encontrado" });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting department:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/api/departments", async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT department_id, nombre, descripcion, lead_user_id, company_id, created_at, updated_at
        FROM departments
        WHERE company_id = $1
        ORDER BY nombre ASC
      `,
      [companyId],
    );
    return res.json({ items: rows });
  } catch (error) {
    console.error("Error listing departments:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
