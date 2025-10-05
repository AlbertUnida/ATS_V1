import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";

const router = Router();

const employmentTypeValues = [
  "tiempo_completo",
  "medio_tiempo",
  "contrato",
  "practicas",
  "temporal",
] as const;

const employeeStatusValues = ["activo", "suspendido", "baja"] as const;


const parseNumberFromQuery = (value: unknown) => {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

const pageParam = z.preprocess(parseNumberFromQuery, z.number().int().min(1)).optional();
const limitParam = z.preprocess(parseNumberFromQuery, z.number().int().min(1).max(100)).optional();

const dateRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const noteSchema = z.object({
  contenido: z.string().trim().min(1).max(2000),
  categoria: z.string().trim().max(120).optional(),
});

const updateNoteSchema = z.object({
  contenido: z.string().trim().min(1).max(2000).optional(),
  categoria: z.string().trim().max(120).optional(),
});

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  storage_path: z.string().trim().min(1).max(500),
  mime_type: z.string().trim().max(120).optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

const historyEntrySchema = z.object({
  started_at: z.string().regex(dateRegex),
  ended_at: z.string().regex(dateRegex).optional(),
  job_title: z.string().trim().max(180).optional(),
  department_id: z.string().uuid().optional(),
  manager_id: z.string().uuid().optional(),
  employment_type: z.enum(employmentTypeValues).optional(),
  salary_amount: z.number().nonnegative().optional(),
  salary_currency: z.string().trim().length(3).optional(),
  salary_period: z.string().trim().max(30).optional(),
  note: z.string().trim().max(1000).optional(),
});

const listEmployeesQuerySchema = z.object({
  page: pageParam,
  limit: limitParam,
  search: z.string().trim().max(120).optional(),
  status: z.enum(employeeStatusValues).optional(),
  department_id: z.string().uuid().optional(),
  manager_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
});

const createEmployeeSchema = z.object({
  company_id: z.string().uuid().optional(),
  employee_number: z.string().trim().max(60).optional(),
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  display_name: z.string().trim().max(200).optional(),
  email_corporate: z.string().trim().email().optional(),
  email_personal: z.string().trim().email().optional(),
  phone: z.string().trim().max(60).optional(),
  birthdate: z.string().regex(dateRegex).optional(),
  hire_date: z.string().regex(dateRegex),
  end_date: z.string().regex(dateRegex).optional(),
  probation_end: z.string().regex(dateRegex).optional(),
  employment_type: z.enum(employmentTypeValues).optional(),
  department_id: z.string().uuid().optional(),
  manager_id: z.string().uuid().optional(),
  job_title: z.string().trim().max(180).optional(),
  location: z.string().trim().max(180).optional(),
  status: z.enum(employeeStatusValues).optional(),
  salary_amount: z.number().nonnegative().optional(),
  salary_currency: z.string().trim().length(3).optional(),
  salary_period: z.string().trim().max(30).optional(),
  job_history: z
    .object({
      started_at: z.string().regex(dateRegex),
      note: z.string().trim().max(1000).optional(),
    })
    .optional(),
  user_id: z.string().uuid().optional(),
});

const updateEmployeeSchema = z
  .object({
    first_name: z.string().trim().min(1).max(120).optional(),
    last_name: z.string().trim().min(1).max(120).optional(),
    display_name: z.string().trim().max(200).optional(),
    email_corporate: z.string().trim().email().optional(),
    email_personal: z.string().trim().email().optional(),
    phone: z.string().trim().max(60).optional(),
    birthdate: z.string().regex(dateRegex).optional(),
    hire_date: z.string().regex(dateRegex).optional(),
    end_date: z.string().regex(dateRegex).optional(),
    probation_end: z.string().regex(dateRegex).optional(),
    employment_type: z.enum(employmentTypeValues).optional(),
    department_id: z.string().uuid().optional(),
    manager_id: z.string().uuid().optional(),
    job_title: z.string().trim().max(180).optional(),
    location: z.string().trim().max(180).optional(),
    status: z.enum(employeeStatusValues).optional(),
    salary_amount: z.number().nonnegative().optional(),
    salary_currency: z.string().trim().length(3).optional(),
    salary_period: z.string().trim().max(30).optional(),
    employee_number: z.string().trim().max(60).optional(),
    job_history: z
      .object({
        started_at: z.string().regex(dateRegex),
        job_title: z.string().trim().max(180).optional(),
        department_id: z.string().uuid().optional(),
        manager_id: z.string().uuid().optional(),
        employment_type: z.enum(employmentTypeValues).optional(),
        salary_amount: z.number().nonnegative().optional(),
        salary_currency: z.string().trim().length(3).optional(),
        salary_period: z.string().trim().max(30).optional(),
        note: z.string().trim().max(1000).optional(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe proporcionar al menos un campo",
  });

function canManageEmployees(user: Express.Request["currentUser"]) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return user.rol === "admin" || user.rol === "hr_admin";
}

function canViewEmployees(user: Express.Request["currentUser"]) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return ["admin", "hr_admin", "recruiter", "hiring_manager"].includes(user.rol);
}

function buildFullName(row: { first_name: string | null; last_name: string | null; display_name: string | null }) {
  if (row.display_name && row.display_name.trim().length > 0) {
    return row.display_name.trim();
  }
  const first = row.first_name?.trim() ?? "";
  const last = row.last_name?.trim() ?? "";
  return `${first} ${last}`.trim();
}

async function ensureDepartment(client: any, departmentId: string, companyId: string) {
  const result = await client.query(
    "SELECT 1 FROM departments WHERE department_id = $1 AND company_id = $2 LIMIT 1",
    [departmentId, companyId],
  );
  return result.rowCount > 0;
}

async function ensureEmployee(client: any, employeeId: string, companyId: string) {
  const result = await client.query(
    "SELECT 1 FROM employees WHERE employee_id = $1 AND company_id = $2 LIMIT 1",
    [employeeId, companyId],
  );
  return result.rowCount > 0;
}

async function getEmployeeSummary(client: any, employeeId: string) {
  const result = await client.query(
    "SELECT employee_id, company_id, department_id FROM employees WHERE employee_id = $1 LIMIT 1",
    [employeeId],
  );
  return result.rows[0] ?? null;
}

async function ensureUser(client: any, userId: string, companyId: string | null, isSuperAdmin: boolean) {
  if (!companyId || isSuperAdmin) {
    const result = await client.query(
      "SELECT company_id, is_super_admin FROM users WHERE user_id = $1 LIMIT 1",
      [userId],
    );
    if (result.rowCount === 0) return false;
    const row = result.rows[0];
    if (row.is_super_admin) return true;
    if (companyId && row.company_id !== companyId) return false;
    return true;
  }

  const result = await client.query(
    "SELECT 1 FROM users WHERE user_id = $1 AND (company_id = $2 OR is_super_admin) LIMIT 1",
    [userId, companyId],
  );
  return result.rowCount > 0;
}

async function fetchEmployeeDetail(employeeId: string, companyId: string) {
  const detailQuery = `
    SELECT
      e.employee_id,
      e.company_id,
      e.user_id,
      e.employee_number,
      e.first_name,
      e.last_name,
      e.display_name,
      e.email_corporate,
      e.email_personal,
      e.phone,
      e.birthdate,
      e.hire_date,
      e.end_date,
      e.probation_end,
      e.employment_type::text AS employment_type,
      e.department_id,
      d.nombre AS department_name,
      e.manager_id,
      COALESCE(m.display_name, TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, '')))) AS manager_name,
      e.job_title,
      e.location,
      e.status::text AS status,
      e.salary_amount::text AS salary_amount,
      e.salary_currency,
      e.salary_period,
      e.created_at,
      e.updated_at,
      e.created_by,
      e.updated_by
    FROM employees e
    LEFT JOIN employees m ON m.employee_id = e.manager_id
    LEFT JOIN departments d ON d.department_id = e.department_id
    WHERE e.employee_id = $1 AND e.company_id = $2
    LIMIT 1
  `;

  const detailResult = await pool.query(detailQuery, [employeeId, companyId]);
  if (detailResult.rowCount === 0) {
    return null;
  }

  const historyResult = await pool.query(
    `
      SELECT history_id,
             started_at,
             ended_at,
             job_title,
             department_id,
             employment_type::text AS employment_type,
             salary_amount::text AS salary_amount,
             salary_currency,
             salary_period,
             note,
             created_at,
             created_by
      FROM employee_job_history
      WHERE employee_id = $1
      ORDER BY started_at DESC NULLS LAST, created_at DESC
      LIMIT 25
    `,
    [employeeId],
  );

  return {
    employee: detailResult.rows[0],
    history: historyResult.rows,
  };
}

async function validateManagerDepartment(client: any, managerId: string, targetDepartmentId: string | null) {
  if (!managerId || !targetDepartmentId) return true;
  const manager = await client.query(
    "SELECT department_id FROM employees WHERE employee_id = $1 LIMIT 1",
    [managerId],
  );
  if (manager.rowCount === 0) return false;
  const managerDepartment = manager.rows[0].department_id as string | null;
  if (!managerDepartment) return true;
  return managerDepartment === targetDepartmentId;
}

router.get("/api/employees", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const parsed = listEmployeesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Parametros invalidos", errors: parsed.error.flatten() });
  }

  const {
    page: pageParam,
    limit: limitParam,
    search,
    status,
    department_id: departmentId,
    manager_id: managerId,
    company_id: queryCompanyId,
  } = parsed.data;

  let targetCompanyId: string | null = null;
  if (currentUser?.is_super_admin) {
    targetCompanyId = queryCompanyId ?? req.companyId ?? null;
    if (!targetCompanyId) {
      return res.status(400).json({ message: "Debe especificar la empresa" });
    }
  } else {
    targetCompanyId = req.companyId ?? currentUser?.company_id ?? null;
    if (!targetCompanyId) {
      return res.status(400).json({ message: "No se pudo determinar la empresa" });
    }
  }

  const page = pageParam ?? 1;
  const limit = limitParam ?? 20;
  const offset = (page - 1) * limit;

  const values: unknown[] = [targetCompanyId];
  const conditions: string[] = ["e.company_id = $1"];

  if (status) {
    values.push(status);
    conditions.push(`e.status = $${values.length}::employee_status`);
  }

  if (departmentId) {
    values.push(departmentId);
    conditions.push(`e.department_id = $${values.length}`);
  }

  if (managerId) {
    values.push(managerId);
    conditions.push(`e.manager_id = $${values.length}`);
  }

  if (search && search.trim().length > 0) {
    const term = `%${search.trim().toLowerCase()}%`;
    values.push(term, term, term);
    const idxName = values.length - 2;
    const idxEmail = values.length - 1;
    const idxPersonal = values.length;
    conditions.push(
      `(
        LOWER(e.first_name) LIKE $${idxName}
        OR LOWER(e.last_name) LIKE $${idxName}
        OR LOWER(e.display_name) LIKE $${idxName}
        OR LOWER(e.email_corporate) LIKE $${idxEmail}
        OR LOWER(e.email_personal) LIKE $${idxPersonal}
        OR LOWER(e.employee_number) LIKE $${idxName}
      )`,
    );
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  try {
    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total FROM employees e ${whereClause}`,
      values,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    const pages = Math.max(1, Math.ceil(total / limit));
    const normalizedPage = Math.min(page, pages);
    const normalizedOffset = (normalizedPage - 1) * limit;

    const listValues = [...values, limit, normalizedOffset];
    const dataQuery = `
      SELECT
        e.employee_id,
        e.employee_number,
        e.first_name,
        e.last_name,
        e.display_name,
        e.job_title,
        e.status::text AS status,
        e.hire_date,
        e.department_id,
        d.nombre AS department_name,
        e.manager_id,
        COALESCE(m.display_name, TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, '')))) AS manager_name,
        e.email_corporate,
        e.location
      FROM employees e
      LEFT JOIN employees m ON m.employee_id = e.manager_id
      LEFT JOIN departments d ON d.department_id = e.department_id
      ${whereClause}
      ORDER BY LOWER(e.last_name) ASC, LOWER(e.first_name) ASC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}
    `;

    const listResult = await pool.query(dataQuery, listValues);

    return res.json({
      items: listResult.rows,
      total,
      page: normalizedPage,
      pages,
      limit,
    });
  } catch (error) {
    console.error("[employees] Error listing employees", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.post("/api/employees", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canManageEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const payload = parsed.data;
  let targetCompanyId: string | null = null;

  if (currentUser?.is_super_admin) {
    targetCompanyId = payload.company_id ?? req.companyId ?? null;
    if (!targetCompanyId) {
      return res.status(400).json({ message: "Debe indicar la empresa" });
    }
  } else {
    targetCompanyId = req.companyId ?? currentUser?.company_id ?? null;
    if (!targetCompanyId) {
      return res.status(400).json({ message: "No se pudo determinar la empresa" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (payload.department_id) {
      const valid = await ensureDepartment(client, payload.department_id, targetCompanyId);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Departamento no pertenece a la empresa" });
      }
    }

    if (payload.manager_id) {
      const valid = await ensureEmployee(client, payload.manager_id, targetCompanyId);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El manager indicado no pertenece a la empresa" });
      }
      const sameDepartment = await validateManagerDepartment(
        client,
        payload.manager_id,
        payload.department_id ?? null,
      );
      if (!sameDepartment) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El manager debe pertenecer al mismo departamento" });
      }
    }

    if (payload.user_id) {
      const valid = await ensureUser(client, payload.user_id, targetCompanyId, Boolean(currentUser?.is_super_admin));
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El usuario indicado no pertenece a la empresa" });
      }
    }

    const status = payload.status ?? "activo";
    const salaryCurrency = payload.salary_currency ? payload.salary_currency.toUpperCase() : null;

    const insertQuery = `
      INSERT INTO employees (
        company_id,
        user_id,
        employee_number,
        first_name,
        last_name,
        display_name,
        email_corporate,
        email_personal,
        phone,
        birthdate,
        hire_date,
        end_date,
        probation_end,
        employment_type,
        department_id,
        manager_id,
        job_title,
        location,
        status,
        salary_amount,
        salary_currency,
        salary_period,
        created_by,
        updated_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
      )
      RETURNING *
    `;

    const insertValues = [
      targetCompanyId,
      payload.user_id ?? null,
      payload.employee_number ?? null,
      payload.first_name.trim(),
      payload.last_name.trim(),
      payload.display_name?.trim() ?? null,
      payload.email_corporate?.trim().toLowerCase() ?? null,
      payload.email_personal?.trim().toLowerCase() ?? null,
      payload.phone?.trim() ?? null,
      payload.birthdate ?? null,
      payload.hire_date,
      payload.end_date ?? null,
      payload.probation_end ?? null,
      payload.employment_type ?? null,
      payload.department_id ?? null,
      payload.manager_id ?? null,
      payload.job_title?.trim() ?? null,
      payload.location?.trim() ?? null,
      status,
      payload.salary_amount ?? null,
      salaryCurrency,
      payload.salary_period?.trim() ?? null,
      currentUser?.user_id ?? null,
      currentUser?.user_id ?? null,
    ];

    const { rows } = await client.query(insertQuery, insertValues);
    const employeeRow = rows[0];

    const historyStart = payload.job_history?.started_at ?? payload.hire_date;
    await client.query(
      `
        INSERT INTO employee_job_history (
          employee_id, started_at, ended_at, job_title, department_id, manager_id, employment_type,
          salary_amount, salary_currency, salary_period, note, created_by
        ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        employeeRow.employee_id,
        historyStart,
        payload.job_title?.trim() ?? null,
        payload.department_id ?? null,
        payload.manager_id ?? null,
        payload.employment_type ?? null,
        payload.salary_amount ?? null,
        salaryCurrency,
        payload.salary_period?.trim() ?? null,
        payload.job_history?.note?.trim() ?? null,
        currentUser?.user_id ?? null,
      ],
    );

    await client.query("COMMIT");

    return res.status(201).json({ employee: employeeRow });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[employees] Error rolling back employee creation", rollbackError);
    }
    console.error("[employees] Error creating employee", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});

router.get("/api/employees/:id", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  try {
    const employeeRow = await pool.query(
      "SELECT employee_id, company_id FROM employees WHERE employee_id = $1 LIMIT 1",
      [idParse.data],
    );
    if (employeeRow.rowCount === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    const companyId = employeeRow.rows[0].company_id as string;
    if (!currentUser?.is_super_admin) {
      const allowedCompanyId = req.companyId ?? currentUser?.company_id ?? null;
      if (!allowedCompanyId || allowedCompanyId !== companyId) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const data = await fetchEmployeeDetail(idParse.data, companyId);
    if (!data) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    return res.json(data);
  } catch (error) {
    console.error("[employees] Error fetching detail", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.patch("/api/employees/:id", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canManageEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const employeeInfo = await client.query(
      "SELECT company_id, department_id, manager_id FROM employees WHERE employee_id = $1 FOR UPDATE",
      [idParse.data],
    );

    if (employeeInfo.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    const companyId = employeeInfo.rows[0].company_id as string;
    const existingDepartmentId = employeeInfo.rows[0].department_id as string | null;
    const existingManagerId = employeeInfo.rows[0].manager_id as string | null;

    if (!currentUser?.is_super_admin) {
      const allowedCompanyId = req.companyId ?? currentUser?.company_id ?? null;
      if (!allowedCompanyId || allowedCompanyId !== companyId) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const targetDepartmentId = payload.department_id !== undefined ? payload.department_id ?? null : existingDepartmentId;
    const targetManagerId = payload.manager_id !== undefined ? payload.manager_id ?? null : existingManagerId;

    if (payload.department_id) {
      const valid = await ensureDepartment(client, payload.department_id, companyId);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Departamento no pertenece a la empresa" });
      }
    }

    if (payload.manager_id) {
      const valid = await ensureEmployee(client, payload.manager_id, companyId);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El manager indicado no pertenece a la empresa" });
      }
    }

    if (targetManagerId && targetManagerId === idParse.data) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Un empleado no puede reportar a sí mismo" });
    }

    if (payload.job_history?.manager_id) {
      const valid = await ensureEmployee(client, payload.job_history.manager_id, companyId);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El manager indicado en el historial no pertenece a la empresa" });
      }
    }

    if (payload.job_history?.department_id) {
      const valid = await ensureDepartment(client, payload.job_history.department_id, companyId);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El departamento indicado en el historial no pertenece a la empresa" });
      }
    }

    if (targetManagerId) {
      const sameDepartment = await validateManagerDepartment(client, targetManagerId, targetDepartmentId);
      if (!sameDepartment) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El manager debe pertenecer al mismo departamento" });
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const setField = (column: string, value: unknown) => {
      updates.push(`${column} = $${idx}`);
      values.push(value);
      idx += 1;
    };

    if (payload.first_name !== undefined) setField("first_name", payload.first_name.trim());
    if (payload.last_name !== undefined) setField("last_name", payload.last_name.trim());
    if (payload.display_name !== undefined) setField("display_name", payload.display_name?.trim() ?? null);
    if (payload.email_corporate !== undefined) setField("email_corporate", payload.email_corporate?.trim().toLowerCase() ?? null);
    if (payload.email_personal !== undefined) setField("email_personal", payload.email_personal?.trim().toLowerCase() ?? null);
    if (payload.phone !== undefined) setField("phone", payload.phone?.trim() ?? null);
    if (payload.birthdate !== undefined) setField("birthdate", payload.birthdate ?? null);
    if (payload.hire_date !== undefined) setField("hire_date", payload.hire_date ?? null);
    if (payload.end_date !== undefined) setField("end_date", payload.end_date ?? null);
    if (payload.probation_end !== undefined) setField("probation_end", payload.probation_end ?? null);
    if (payload.employment_type !== undefined) setField("employment_type", payload.employment_type ?? null);
    if (payload.department_id !== undefined) setField("department_id", payload.department_id ?? null);
    if (payload.manager_id !== undefined) setField("manager_id", payload.manager_id ?? null);
    if (payload.job_title !== undefined) setField("job_title", payload.job_title?.trim() ?? null);
    if (payload.location !== undefined) setField("location", payload.location?.trim() ?? null);
    if (payload.status !== undefined) setField("status", payload.status);
    if (payload.salary_amount !== undefined) setField("salary_amount", payload.salary_amount ?? null);
    if (payload.salary_currency !== undefined)
      setField("salary_currency", payload.salary_currency ? payload.salary_currency.toUpperCase() : null);
    if (payload.salary_period !== undefined) setField("salary_period", payload.salary_period?.trim() ?? null);
    if (payload.employee_number !== undefined) setField("employee_number", payload.employee_number?.trim() ?? null);

    if (updates.length > 0) {
      setField("updated_by", currentUser?.user_id ?? null);
      const updateQuery = `
        UPDATE employees
        SET ${updates.join(", ")}, updated_at = NOW()
        WHERE employee_id = $${idx}
      `;
      values.push(idParse.data);
      await client.query(updateQuery, values);
    }

    const historyDepartment =
      payload.job_history?.department_id ?? payload.department_id ?? existingDepartmentId ?? null;
    const historyManager = payload.job_history?.manager_id ?? payload.manager_id ?? existingManagerId ?? null;

    if (payload.job_history) {
      const historyCurrency = payload.job_history.salary_currency
        ? payload.job_history.salary_currency.toUpperCase()
        : null;
      await client.query(
        `
          INSERT INTO employee_job_history (
            employee_id, started_at, ended_at, job_title, department_id, manager_id,
            employment_type, salary_amount, salary_currency, salary_period, note, created_by
          ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          idParse.data,
          payload.job_history.started_at,
          payload.job_history.job_title?.trim() ?? null,
          historyDepartment,
          historyManager,
          payload.job_history.employment_type ?? payload.employment_type ?? null,
          payload.job_history.salary_amount ?? payload.salary_amount ?? null,
          historyCurrency ?? (payload.salary_currency ? payload.salary_currency.toUpperCase() : null),
          payload.job_history.salary_period?.trim() ?? payload.salary_period?.trim() ?? null,
          payload.job_history.note?.trim() ?? null,
          currentUser?.user_id ?? null,
        ],
      );
    }

    await client.query("COMMIT");

    const detail = await fetchEmployeeDetail(idParse.data, companyId);
    return res.json(detail ?? {});
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[employees] Error rolling back update", rollbackError);
    }
    console.error("[employees] Error updating employee", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
});

router.get("/api/employees/:id/notes", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  try {
    const employee = await getEmployeeSummary(pool, idParse.data);
    if (!employee) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }
    if (!currentUser?.is_super_admin) {
      const allowedCompanyId = req.companyId ?? currentUser?.company_id ?? null;
      if (!allowedCompanyId || allowedCompanyId !== employee.company_id) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const { rows } = await pool.query(
      `
        SELECT note_id, contenido, categoria, created_at, updated_at, created_by
        FROM employee_notes
        WHERE employee_id = $1
        ORDER BY created_at DESC
      `,
      [idParse.data],
    );
    return res.json({ items: rows });
  } catch (error) {
    console.error('[employees] Error listing notes', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

router.post("/api/employees/:id/notes", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canManageEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const body = noteSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: body.error.flatten() });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const employee = await client.query(
      "SELECT company_id FROM employees WHERE employee_id = $1 FOR UPDATE",
      [idParse.data],
    );
    if (employee.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Empleado no encontrado" });
    }
    if (!currentUser?.is_super_admin) {
      const allowedCompanyId = req.companyId ?? currentUser?.company_id ?? null;
      if (!allowedCompanyId || allowedCompanyId !== employee.rows[0].company_id) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const insert = await client.query(
      `
        INSERT INTO employee_notes (employee_id, contenido, categoria, created_by)
        VALUES ($1,$2,$3,$4)
        RETURNING note_id, contenido, categoria, created_at, updated_at, created_by
      `,
      [idParse.data, body.data.contenido.trim(), body.data.categoria?.trim() ?? null, currentUser?.user_id ?? null],
    );

    await client.query("COMMIT");
    return res.status(201).json({ note: insert.rows[0] });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error('[employees] Error rollback note', rollbackError);
    }
    console.error('[employees] Error creating note', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

router.patch("/api/employees/:employeeId/notes/:noteId", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canManageEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const paramsParse = z
    .object({ employeeId: z.string().uuid(), noteId: z.string().uuid() })
    .safeParse({ employeeId: req.params.employeeId, noteId: req.params.noteId });
  if (!paramsParse.success) {
    return res.status(400).json({ message: "Parametros invalidos" });
  }

  const body = updateNoteSchema.safeParse(req.body);
  if (!body.success || Object.keys(body.data).length === 0) {
    return res.status(400).json({ message: "Debe indicar campos a actualizar" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const employee = await client.query(
      "SELECT company_id FROM employees WHERE employee_id = $1 FOR UPDATE",
      [paramsParse.data.employeeId],
    );
    if (employee.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Empleado no encontrado" });
    }
    if (!currentUser?.is_super_admin) {
      const allowedCompanyId = req.companyId ?? currentUser?.company_id ?? null;
      if (!allowedCompanyId || allowedCompanyId !== employee.rows[0].company_id) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (body.data.contenido !== undefined) {
      updates.push(`contenido = $${idx}`);
      values.push(body.data.contenido?.trim() ?? null);
      idx += 1;
    }
    if (body.data.categoria !== undefined) {
      updates.push(`categoria = $${idx}`);
      values.push(body.data.categoria?.trim() ?? null);
      idx += 1;
    }

    if (updates.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Sin cambios" });
    }

    const updateQuery = `
      UPDATE employee_notes
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE note_id = $${idx} AND employee_id = $${idx + 1}
      RETURNING note_id, contenido, categoria, created_at, updated_at, created_by
    `;
    values.push(paramsParse.data.noteId, paramsParse.data.employeeId);

    const result = await client.query(updateQuery, values);
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Nota no encontrada" });
    }

    await client.query("COMMIT");
    return res.json({ note: result.rows[0] });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error('[employees] Error rollback note update', rollbackError);
    }
    console.error('[employees] Error updating note', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

router.delete("/api/employees/:employeeId/notes/:noteId", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canManageEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const paramsParse = z
    .object({ employeeId: z.string().uuid(), noteId: z.string().uuid() })
    .safeParse({ employeeId: req.params.employeeId, noteId: req.params.noteId });
  if (!paramsParse.success) {
    return res.status(400).json({ message: "Parametros invalidos" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM employee_notes WHERE note_id = $1 AND employee_id = $2 RETURNING note_id",
      [paramsParse.data.noteId, paramsParse.data.employeeId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Nota no encontrada" });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('[employees] Error deleting note', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

router.get("/api/employees/:id/attachments", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canViewEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  try {
    const employee = await getEmployeeSummary(pool, idParse.data);
    if (!employee) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }
    if (!currentUser?.is_super_admin) {
      const allowedCompanyId = req.companyId ?? currentUser?.company_id ?? null;
      if (!allowedCompanyId || allowedCompanyId !== employee.company_id) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const { rows } = await pool.query(
      `
        SELECT attachment_id, filename, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at
        FROM employee_attachments
        WHERE employee_id = $1
        ORDER BY uploaded_at DESC
      `,
      [idParse.data],
    );

    return res.json({ items: rows });
  } catch (error) {
    console.error('[employees] Error listing attachments', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

router.post("/api/employees/:id/attachments", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canManageEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const body = attachmentSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: body.error.flatten() });
  }

  try {
    const employee = await getEmployeeSummary(pool, idParse.data);
    if (!employee) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }
    if (!currentUser?.is_super_admin) {
      const allowedCompanyId = req.companyId ?? currentUser?.company_id ?? null;
      if (!allowedCompanyId || allowedCompanyId !== employee.company_id) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const insert = await pool.query(
      `
        INSERT INTO employee_attachments (employee_id, filename, storage_path, mime_type, size_bytes, uploaded_by)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING attachment_id, filename, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at
      `,
      [
        idParse.data,
        body.data.filename.trim(),
        body.data.storage_path.trim(),
        body.data.mime_type?.trim() ?? null,
        body.data.size_bytes ?? null,
        currentUser?.user_id ?? null,
      ],
    );

    return res.status(201).json({ attachment: insert.rows[0] });
  } catch (error) {
    console.error('[employees] Error creating attachment', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

router.delete("/api/employees/:employeeId/attachments/:attachmentId", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canManageEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const paramsParse = z
    .object({ employeeId: z.string().uuid(), attachmentId: z.string().uuid() })
    .safeParse({ employeeId: req.params.employeeId, attachmentId: req.params.attachmentId });
  if (!paramsParse.success) {
    return res.status(400).json({ message: "Parametros invalidos" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM employee_attachments WHERE attachment_id = $1 AND employee_id = $2 RETURNING attachment_id",
      [paramsParse.data.attachmentId, paramsParse.data.employeeId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Adjunto no encontrado" });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('[employees] Error deleting attachment', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

router.post("/api/employees/:id/history", async (req, res) => {
  const currentUser = req.currentUser;
  if (!canManageEmployees(currentUser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const body = historyEntrySchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ message: "Datos invalidos", errors: body.error.flatten() });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const employee = await client.query(
      "SELECT company_id, department_id, manager_id FROM employees WHERE employee_id = $1 FOR UPDATE",
      [idParse.data],
    );
    if (employee.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Empleado no encontrado" });
    }
    const companyId = employee.rows[0].company_id as string;
    if (!currentUser?.is_super_admin) {
      const allowedCompanyId = req.companyId ?? currentUser?.company_id ?? null;
      if (!allowedCompanyId || allowedCompanyId !== companyId) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    if (body.data.department_id) {
      const valid = await ensureDepartment(client, body.data.department_id, companyId);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Departamento no pertenece a la empresa" });
      }
    }

    if (body.data.manager_id) {
      const valid = await ensureEmployee(client, body.data.manager_id, companyId);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El manager indicado no pertenece a la empresa" });
      }
      const sameDepartment = await validateManagerDepartment(
        client,
        body.data.manager_id,
        body.data.department_id ?? employee.rows[0].department_id ?? null,
      );
      if (!sameDepartment) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "El manager debe pertenecer al mismo departamento" });
      }
    }

    const currency = body.data.salary_currency ? body.data.salary_currency.toUpperCase() : null;

    const insert = await client.query(
      `
        INSERT INTO employee_job_history (
          employee_id, started_at, ended_at, job_title, department_id, manager_id,
          employment_type, salary_amount, salary_currency, salary_period, note, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING history_id, started_at, ended_at, job_title, department_id, manager_id,
                  employment_type::text AS employment_type, salary_amount::text AS salary_amount,
                  salary_currency, salary_period, note, created_at, created_by
      `,
      [
        idParse.data,
        body.data.started_at,
        body.data.ended_at ?? null,
        body.data.job_title?.trim() ?? null,
        body.data.department_id ?? employee.rows[0].department_id ?? null,
        body.data.manager_id ?? employee.rows[0].manager_id ?? null,
        body.data.employment_type ?? null,
        body.data.salary_amount ?? null,
        currency,
        body.data.salary_period?.trim() ?? null,
        body.data.note?.trim() ?? null,
        currentUser?.user_id ?? null,
      ],
    );

    await client.query("COMMIT");
    return res.status(201).json({ history: insert.rows[0] });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error('[employees] Error rollback history', rollbackError);
    }
    console.error('[employees] Error creating history entry', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

export default router;
