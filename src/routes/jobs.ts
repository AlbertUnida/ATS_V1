import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";

const router = Router();

const jobStatusValues = ["abierto", "pausado", "cerrado"] as const;
const employmentTypeValues = [
  "tiempo_completo",
  "medio_tiempo",
  "contrato",
  "practicas",
  "temporal",
] as const;
const workModalityValues = ["presencial", "remoto", "hibrido"] as const;

const createJobSchema = z
  .object({
    titulo: z.string().min(3, "El titulo debe tener al menos 3 caracteres"),
    descripcion: z.string().min(10, "La descripcion debe tener al menos 10 caracteres"),
    departamento: z.string().min(1).optional(),
    departamento_id: z.string().uuid().optional(),
    estado: z.enum(jobStatusValues).optional(),
    tipo_empleo: z.enum(employmentTypeValues).optional(),
    modalidad_trabajo: z.enum(workModalityValues).optional(),
    ubicacion: z.string().min(2).optional(),
    rango_salarial_min: z.number().nonnegative().optional(),
    rango_salarial_max: z.number().nonnegative().optional(),
    moneda: z.string().min(3).max(3).optional(),
    fecha_publicacion: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
      .optional(),
    fecha_cierre: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
      .optional(),
    notas_internas: z.string().optional(),
    creado_por: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      if (data.rango_salarial_min !== undefined && data.rango_salarial_max !== undefined) {
        return data.rango_salarial_max >= data.rango_salarial_min;
      }
      return true;
    },
    {
      message: "El rango salarial maximo no puede ser menor al minimo",
      path: ["rango_salarial_max"],
    },
  );

const listJobsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    estado: z.enum(jobStatusValues).optional(),
    departamento: z.string().min(1).optional(),
    departamento_id: z.string().uuid().optional(),
    tipo_empleo: z.enum(employmentTypeValues).optional(),
    modalidad_trabajo: z.enum(workModalityValues).optional(),
  })
  .strict();

router.post("/api/jobs", async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const currentUserId = req.currentUser?.user_id ?? null;

  const {
    titulo,
    descripcion,
    departamento,
    departamento_id,
    estado = "abierto",
    tipo_empleo = "tiempo_completo",
    modalidad_trabajo,
    ubicacion,
    rango_salarial_min,
    rango_salarial_max,
    moneda,
    fecha_publicacion,
    fecha_cierre,
    notas_internas,
    creado_por,
  } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let departamentoNombre = departamento ?? null;
    if (departamento_id) {
      const { rows } = await client.query(
        "SELECT nombre, company_id FROM departments WHERE department_id = $1",
        [departamento_id],
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El departamento indicado no existe" });
      }
      if (rows[0].company_id !== companyId) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "Departamento fuera del alcance de la compañía" });
      }
      if (!departamentoNombre) {
        departamentoNombre = rows[0].nombre;
      }
    }

    const creatorId = creado_por ?? currentUserId;
    if (creatorId) {
      const { rowCount } = await client.query(
        "SELECT 1 FROM users WHERE user_id = $1 AND (is_super_admin OR company_id = $2)",
        [creatorId, companyId],
      );
      if (rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El usuario creador no pertenece a la compañía" });
      }
    }

    const insertQuery = `
      INSERT INTO jobs (
        titulo,
        descripcion,
        departamento,
        departamento_id,
        estado,
        tipo_empleo,
        modalidad_trabajo,
        ubicacion,
        rango_salarial_min,
        rango_salarial_max,
        moneda,
        fecha_publicacion,
        fecha_cierre,
        notas_internas,
        creado_por,
        company_id
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::job_status,
        $6::employment_type,
        $7::work_modality,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16
      )
      RETURNING
        job_id,
        titulo,
        descripcion,
        departamento,
        departamento_id,
        estado,
        tipo_empleo,
        modalidad_trabajo,
        ubicacion,
        rango_salarial_min,
        rango_salarial_max,
        moneda,
        fecha_publicacion,
        fecha_cierre,
        notas_internas,
        fecha_registro,
        updated_at,
        creado_por,
        company_id
    `;

    const values = [
      titulo,
      descripcion,
      departamentoNombre,
      departamento_id ?? null,
      estado,
      tipo_empleo,
      modalidad_trabajo ?? null,
      ubicacion ?? null,
      rango_salarial_min ?? null,
      rango_salarial_max ?? null,
      moneda ? moneda.toUpperCase() : null,
      fecha_publicacion ?? null,
      fecha_cierre ?? null,
      notas_internas ?? null,
      creatorId ?? null,
      companyId,
    ];

    const { rows } = await client.query(insertQuery, values);
    await client.query("COMMIT");
    return res.status(201).json({ job: rows[0] });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Error creating job:", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    });

    if (error?.code === "23505") {
      return res.status(409).json({ message: "Conflicto al crear la oferta", detail: error.detail });
    }

    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});

router.get("/api/jobs", async (req, res) => {
  const parsedQuery = listJobsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsedQuery.error.flatten() });
  }

  const companyId = req.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "No se pudo determinar la compañia" });
  }

  const { page, limit, estado, departamento, departamento_id, tipo_empleo, modalidad_trabajo } =
    parsedQuery.data;
  const offset = (page - 1) * limit;

  const filters: string[] = ["company_id = $1::uuid"];
  const params: Array<string | number> = [companyId];
  let index = 2;

  if (estado) {
    filters.push(`estado = $${index++}::job_status`);
    params.push(estado);
  }
  if (departamento) {
    filters.push(`departamento = $${index++}`);
    params.push(departamento);
  }
  if (departamento_id) {
    filters.push(`departamento_id = $${index++}::uuid`);
    params.push(departamento_id);
  }
  if (tipo_empleo) {
    filters.push(`tipo_empleo = $${index++}::employment_type`);
    params.push(tipo_empleo);
  }
  if (modalidad_trabajo) {
    filters.push(`modalidad_trabajo = $${index++}::work_modality`);
    params.push(modalidad_trabajo);
  }

  const where = `WHERE ${filters.join(" AND ")}`;

  try {
    const countQuery = `SELECT COUNT(*)::int AS total FROM jobs ${where}`;
    const { rows: countRows } = await pool.query(countQuery, params);
    const total = countRows[0]?.total ?? 0;

    const dataQuery = `
      SELECT
        job_id,
        titulo,
        descripcion,
        departamento,
        departamento_id,
        estado,
        tipo_empleo,
        modalidad_trabajo,
        ubicacion,
        rango_salarial_min,
        rango_salarial_max,
        moneda,
        fecha_publicacion,
        fecha_cierre,
        notas_internas,
        fecha_registro,
        updated_at,
        creado_por,
        company_id
      FROM jobs
      ${where}
      ORDER BY fecha_registro DESC
      LIMIT $${index++} OFFSET $${index++}
    `;
    const { rows } = await pool.query(dataQuery, [...params, limit, offset]);
    const pages = Math.max(Math.ceil(total / limit), 1);
    return res.json({ items: rows, total, page, pages });
  } catch (error) {
    console.error("Error listing jobs:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
