BEGIN;

-- Estado de empleados
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_status') THEN
    CREATE TYPE employee_status AS ENUM ('activo', 'suspendido', 'baja');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS employees (
  employee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  employee_number TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT,
  email_corporate TEXT,
  email_personal TEXT,
  phone TEXT,
  birthdate DATE,
  hire_date DATE,
  end_date DATE,
  probation_end DATE,
  employment_type employment_type,
  department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL,
  manager_id UUID REFERENCES employees(employee_id) ON DELETE SET NULL,
  job_title TEXT,
  location TEXT,
  status employee_status NOT NULL DEFAULT 'activo',
  salary_amount NUMERIC(12,2),
  salary_currency VARCHAR(3),
  salary_period TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  UNIQUE (company_id, employee_number),
  UNIQUE (company_id, email_corporate)
);

CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);

CREATE TABLE IF NOT EXISTS employee_job_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  started_at DATE NOT NULL,
  ended_at DATE,
  job_title TEXT,
  department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL,
  manager_id UUID REFERENCES employees(employee_id) ON DELETE SET NULL,
  employment_type employment_type,
  salary_amount NUMERIC(12,2),
  salary_currency VARCHAR(3),
  salary_period TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_job_history_employee ON employee_job_history(employee_id);

CREATE TABLE IF NOT EXISTS employee_notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  categoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_notes_employee ON employee_notes(employee_id);

CREATE TABLE IF NOT EXISTS employee_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_attachments_employee ON employee_attachments(employee_id);

-- Logs del portal público de postulaciones
CREATE TABLE IF NOT EXISTS public_applications_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(job_id) ON DELETE SET NULL,
  candidate_email TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  ip INET,
  user_agent TEXT,
  recaptcha_score NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_app_log_job ON public_applications_log(job_id);
CREATE INDEX IF NOT EXISTS idx_public_app_log_status ON public_applications_log(status);
CREATE INDEX IF NOT EXISTS idx_public_app_log_created ON public_applications_log(created_at);

-- Trigger updated_at para empleados
DROP TRIGGER IF EXISTS trg_employees_updated ON employees;
CREATE TRIGGER trg_employees_updated
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_employee_notes_updated ON employee_notes;
CREATE TRIGGER trg_employee_notes_updated
BEFORE UPDATE ON employee_notes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

