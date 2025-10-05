-- Companies catalog
CREATE TABLE IF NOT EXISTS companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  ruc TEXT,
  plan_codigo TEXT,
  plan_expira DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_companies_updated'
  ) THEN
    CREATE TRIGGER trg_companies_updated
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies (slug);

INSERT INTO companies (nombre, slug, is_active, plan_codigo)
SELECT 'Legacy Company', 'legacy', TRUE, 'legacy'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE slug = 'legacy');

ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitacion_aceptada BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_company_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES companies(company_id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

WITH legacy AS (
  SELECT company_id FROM companies WHERE slug = 'legacy'
)
UPDATE users
SET company_id = COALESCE(company_id, (SELECT company_id FROM legacy))
WHERE is_super_admin = FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_company_scope_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_company_scope_check
      CHECK (
        (is_super_admin AND company_id IS NULL)
        OR (NOT is_super_admin AND company_id IS NOT NULL)
      )
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS company_id UUID;

WITH legacy AS (
  SELECT company_id FROM companies WHERE slug = 'legacy'
)
UPDATE departments
SET company_id = COALESCE(company_id, (SELECT company_id FROM legacy));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_company_id_fkey'
  ) THEN
    ALTER TABLE departments
      ADD CONSTRAINT departments_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES companies(company_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE departments ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_company_nombre_key'
  ) THEN
    ALTER TABLE departments
      ADD CONSTRAINT departments_company_nombre_key UNIQUE (company_id, nombre);
  END IF;
END;
$$;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_id UUID;

WITH dept_company AS (
  SELECT d.department_id, d.company_id
  FROM departments d
)
UPDATE jobs j
SET company_id = COALESCE(j.company_id, dc.company_id)
FROM dept_company dc
WHERE j.departamento_id = dc.department_id;

WITH legacy AS (
  SELECT company_id FROM companies WHERE slug = 'legacy'
)
UPDATE jobs
SET company_id = COALESCE(company_id, (SELECT company_id FROM legacy));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_company_id_fkey'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES companies(company_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE jobs ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs (company_id);

ALTER TABLE users VALIDATE CONSTRAINT users_company_id_fkey;
ALTER TABLE users VALIDATE CONSTRAINT users_company_scope_check;
ALTER TABLE departments VALIDATE CONSTRAINT departments_company_id_fkey;
ALTER TABLE jobs VALIDATE CONSTRAINT jobs_company_id_fkey;
