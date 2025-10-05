BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enumeraciones base (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE job_status AS ENUM ('abierto', 'pausado', 'cerrado');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
    CREATE TYPE employment_type AS ENUM (
      'tiempo_completo',
      'medio_tiempo',
      'contrato',
      'practicas',
      'temporal'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_modality') THEN
    CREATE TYPE work_modality AS ENUM ('presencial', 'remoto', 'hibrido');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_status') THEN
    CREATE TYPE application_status AS ENUM (
      'Nuevo',
      'En revision',
      'Entrevista',
      'Oferta',
      'Contratado',
      'Rechazado'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin', 'hr_admin', 'recruiter', 'hiring_manager', 'interviewer');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_mode') THEN
    CREATE TYPE interview_mode AS ENUM ('presencial', 'remoto', 'telefono');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_result') THEN
    CREATE TYPE interview_result AS ENUM ('pendiente', 'aprobado', 'rechazado', 'cancelado');
  END IF;
END;
$$;

-- Función utilitaria para updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Usuarios internos del sistema
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  rol user_role NOT NULL DEFAULT 'recruiter',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Departamentos/áreas de la organización
CREATE TABLE IF NOT EXISTS departments (
  department_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  lead_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ofertas laborales
CREATE TABLE IF NOT EXISTS jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  departamento_id UUID REFERENCES departments(department_id) ON DELETE SET NULL,
  departamento TEXT,
  estado job_status NOT NULL DEFAULT 'abierto',
  tipo_empleo employment_type NOT NULL DEFAULT 'tiempo_completo',
  modalidad_trabajo work_modality,
  ubicacion TEXT,
  rango_salarial_min NUMERIC(12,2),
  rango_salarial_max NUMERIC(12,2),
  moneda VARCHAR(3),
  fecha_publicacion DATE,
  fecha_cierre DATE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
  notas_internas TEXT,
  CHECK (
    rango_salarial_min IS NULL
    OR rango_salarial_max IS NULL
    OR rango_salarial_max >= rango_salarial_min
  )
);

-- Ajustes para tablas legacy jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS departamento_id UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS modalidad_trabajo work_modality;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ubicacion TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rango_salarial_min NUMERIC(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rango_salarial_max NUMERIC(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS moneda VARCHAR(3);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fecha_publicacion DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fecha_cierre DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS creado_por UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notas_internas TEXT;
ALTER TABLE jobs ALTER COLUMN estado SET DEFAULT 'abierto';
ALTER TABLE jobs ALTER COLUMN tipo_empleo SET DEFAULT 'tiempo_completo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'jobs' AND constraint_name = 'jobs_departamento_id_fkey'
  )
  THEN
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_departamento_id_fkey FOREIGN KEY (departamento_id)
    REFERENCES departments(department_id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'jobs' AND constraint_name = 'jobs_creado_por_fkey'
  )
  THEN
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_creado_por_fkey FOREIGN KEY (creado_por)
    REFERENCES users(user_id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Candidatos deduplicados por email
CREATE TABLE IF NOT EXISTS candidatos (
  candidato_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_completo TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefono TEXT,
  resumen_url TEXT,
  linkedin_url TEXT,
  ciudad TEXT,
  pais TEXT,
  fuente TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ajustes para tablas legacy candidatos
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS ciudad TEXT;
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS pais TEXT;
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS fuente TEXT;
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Aplicaciones a ofertas
CREATE TABLE IF NOT EXISTS applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  candidato_id UUID NOT NULL REFERENCES candidatos(candidato_id) ON DELETE CASCADE,
  estado application_status NOT NULL DEFAULT 'Nuevo',
  source TEXT,
  salario_expectativa NUMERIC(12,2),
  moneda VARCHAR(3),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, candidato_id)
);

-- Ajustes para tablas legacy applications
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'origen'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'source'
  )
  THEN
    ALTER TABLE applications RENAME COLUMN origen TO source;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'origen_ref'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'source_details'
  )
  THEN
    ALTER TABLE applications RENAME COLUMN origen_ref TO source_details;
  END IF;
END;
$$;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS source_details TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS salario_expectativa NUMERIC(12,2);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS moneda VARCHAR(3);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE applications ALTER COLUMN estado SET DEFAULT 'Nuevo';

-- Historial de cambios de estado en el pipeline
CREATE TABLE IF NOT EXISTS application_stage_history (
  stage_history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  estado_anterior application_status,
  estado_nuevo application_status NOT NULL,
  comentario TEXT,
  cambiado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notas colaborativas
CREATE TABLE IF NOT EXISTS application_notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  autor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  contenido TEXT NOT NULL,
  categoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Entrevistas asociadas a la aplicación
CREATE TABLE IF NOT EXISTS interviews (
  interview_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  programada_para TIMESTAMPTZ NOT NULL,
  duracion_minutos INTEGER,
  modalidad interview_mode,
  ubicacion TEXT,
  enlace TEXT,
  resultado interview_result DEFAULT 'pendiente',
  feedback TEXT,
  entrevistadores UUID[] DEFAULT ARRAY[]::UUID[],
  creado_por UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices recomendados
CREATE INDEX IF NOT EXISTS idx_jobs_estado ON jobs (estado);
CREATE INDEX IF NOT EXISTS idx_jobs_departamento_id ON jobs (departamento_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications (job_id);
CREATE INDEX IF NOT EXISTS idx_applications_estado ON applications (estado);
CREATE INDEX IF NOT EXISTS idx_stage_history_application_id ON application_stage_history (application_id);
CREATE INDEX IF NOT EXISTS idx_application_notes_application_id ON application_notes (application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON interviews (application_id);

-- Triggers updated_at (drop + create para idempotencia)
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_departments_updated ON departments;
CREATE TRIGGER trg_departments_updated
BEFORE UPDATE ON departments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_jobs_updated ON jobs;
CREATE TRIGGER trg_jobs_updated
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_candidatos_updated ON candidatos;
CREATE TRIGGER trg_candidatos_updated
BEFORE UPDATE ON candidatos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_applications_updated ON applications;
CREATE TRIGGER trg_applications_updated
BEFORE UPDATE ON applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_application_notes_updated ON application_notes;
CREATE TRIGGER trg_application_notes_updated
BEFORE UPDATE ON application_notes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_interviews_updated ON interviews;
CREATE TRIGGER trg_interviews_updated
BEFORE UPDATE ON interviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
