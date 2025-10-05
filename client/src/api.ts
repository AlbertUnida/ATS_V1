import { clearAuth, getAuth, type StoredAuth } from './lib/session';

export type JobStatus = 'abierto' | 'pausado' | 'cerrado';
export type EmploymentType =
  | 'tiempo_completo'
  | 'medio_tiempo'
  | 'contrato'
  | 'practicas'
  | 'temporal';
export type WorkModality = 'presencial' | 'remoto' | 'hibrido';

export type UserRole = 'admin' | 'hr_admin' | 'recruiter' | 'hiring_manager' | 'interviewer';

export type PlatformUser = {
  user_id: string;
  email: string;
  nombre: string;
  rol: UserRole;
  company_id: string | null;
  is_super_admin: boolean;
  invitacion_aceptada: boolean;
  activo: boolean;
  invitation_expires_at: string | null;
  invitation_sent_at: string | null;
  invitation_accepted_at: string | null;
};

export type InvitationEvent = {
  event_id: string;
  token_hash: string | null;
  accept_url: string | null;
  sent_at: string;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
  created_by_nombre: string | null;
  created_by_email: string | null;
  reused_existing: boolean;
  email_delivery_attempted: boolean;
  email_delivery_success: boolean | null;
  email_delivery_message: string | null;
};

export type InvitationHistoryResponse = {
  items: InvitationEvent[];
  total: number;
  page: number;
  pages: number;
  limit: number;
};

export type InvitationSummary = {
  token: string;
  expires_at: string;
  accept_url?: string;
};

export type InvitationDetails = {
  email: string;
  nombre: string | null;
  company_id: string | null;
  expires_at: string;
};

export type EmailDeliveryResult = {
  attempted: boolean;
  success: boolean;
  message: string;
  providerId?: string;
};

export type CompanySummary = {
  company_id: string;
  nombre: string;
  slug: string;
  ruc: string | null;
  plan_codigo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicCompanySummary = {
  company_id: string;
  nombre: string;
  slug: string;
};

export type PublicJob = {
  job_id: string;
  titulo: string;
  descripcion: string;
  departamento: string | null;
  departamento_id: string | null;
  tipo_empleo: EmploymentType;
  modalidad_trabajo: WorkModality | null;
  ubicacion: string | null;
  rango_salarial_min: string | null;
  rango_salarial_max: string | null;
  moneda: string | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  fecha_registro: string;
  company_id: string;
  company_nombre: string;
  company_slug: string;
};

export type ApplicationSummary = {
  application_id: string;
  job_id: string;
  candidato_id: string;
  estado: ApplicationStatus;
  source: string | null;
  source_details: string | null;
  salario_expectativa: string | null;
  moneda: string | null;
  applied_at: string;
  updated_at: string;
};

export type PublicApplicationPayload = {
  nombre_completo: string;
  email: string;
  telefono?: string;
  resumen_url?: string;
  linkedin_url?: string;
  ciudad?: string;
  pais?: string;
  mensaje?: string;
  salario_expectativa?: number;
  moneda?: string;
  acepta_politica: boolean;
  recaptcha_token?: string;
};

export type PublicApplicationResponse = {
  status: 'received' | 'duplicate';
  application: ApplicationSummary;
};

export type EmployeeStatus = 'activo' | 'suspendido' | 'baja';

export type EmployeeSummary = {
  employee_id: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  display_name: string | null;
  job_title: string | null;
  status: EmployeeStatus;
  hire_date: string | null;
  department_id: string | null;
  department_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  email_corporate: string | null;
  location: string | null;
};

export type EmployeeDetail = {
  employee: {
    employee_id: string;
    company_id: string;
    user_id: string | null;
    employee_number: string | null;
    first_name: string;
    last_name: string;
    display_name: string | null;
    email_corporate: string | null;
    email_personal: string | null;
    phone: string | null;
    birthdate: string | null;
    hire_date: string | null;
    end_date: string | null;
    probation_end: string | null;
    employment_type: EmploymentType | null;
    department_id: string | null;
    department_name: string | null;
    manager_id: string | null;
    manager_name: string | null;
    job_title: string | null;
    location: string | null;
    status: EmployeeStatus;
    salary_amount: string | null;
    salary_currency: string | null;
    salary_period: string | null;
    created_at: string;
    updated_at: string;
  };
  history: Array<{
    history_id: string;
    started_at: string;
    ended_at: string | null;
    job_title: string | null;
    department_id: string | null;
    employment_type: EmploymentType | null;
    salary_amount: string | null;
    salary_currency: string | null;
    salary_period: string | null;
    note: string | null;
    created_at: string;
    created_by: string | null;
  }>;
};

export type EmployeeNote = {
  note_id: string;
  contenido: string;
  categoria: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type EmployeeAttachment = {
  attachment_id: string;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type PublicApplicationsReport = {
  items: Array<{
    day: string;
    status: string;
    total: string;
  }>;
  totals: Array<{
    status: string;
    total: string;
  }>;
};

export type PublicApplicationsConversion = {
  summary: {
    total_logs: string;
    matched: string;
    interviews: string;
    offers: string;
    hires: string;
  } | null;
  status: Array<{ status: string | null; total: string }>;
};

export type PublicApplicationsResponseTime = {
  samples: string;
  avg_hours: string | null;
  median_hours: string | null;
  p90_hours: string | null;
} | null;

export type PublicApplicationsSources = {
  channels: {
    breakdown: Array<{
      day: string;
      channel: string;
      total_logs: string;
      matched: string;
      interviews: string;
      offers: string;
      hires: string;
    }>;
    totals: Array<{
      channel: string;
      total_logs: string;
      matched: string;
      interviews: string;
      offers: string;
      hires: string;
    }>;
  };
  platforms: {
    breakdown: Array<{ day: string; platform: string; total: string }>;
    totals: Array<{ platform: string; total: string }>;
  };
};

export type InvitationReport = {
  events: Array<{ day: string; sent: string; reused: string; delivered: string }>;
  acceptance: {
    invited_users: string;
    accepted_users: string;
    avg_hours_to_accept: string | null;
  } | null;
  acceptedTimeline: Array<{ day: string; accepted: string }>;
};

const devUserEmail = import.meta.env.VITE_DEV_USER_EMAIL ?? '';
const devCompanyId = import.meta.env.VITE_DEV_COMPANY_ID ?? '';

type FetchOptions = {
  skipAuthHeaders?: boolean;
};

async function apiFetch<T>(input: string, init: RequestInit = {}, options: FetchOptions = {}): Promise<T> {
  const headers = new Headers(init.headers ?? undefined);
  const auth = getAuth();

  if (!options.skipAuthHeaders && auth?.token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${auth.token}`);
  }

  if (!auth && !options.skipAuthHeaders) {
    if (devUserEmail && !headers.has('x-user-email')) headers.set('x-user-email', devUserEmail);
    if (devCompanyId && !headers.has('x-company-id')) headers.set('x-company-id', devCompanyId);
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    clearAuth();
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Error HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export type Job = {
  job_id: string;
  titulo: string;
  descripcion: string;
  departamento: string | null;
  departamento_id: string | null;
  estado: JobStatus;
  tipo_empleo: EmploymentType;
  modalidad_trabajo: WorkModality | null;
  ubicacion: string | null;
  rango_salarial_min: string | null;
  rango_salarial_max: string | null;
  moneda: string | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  notas_internas: string | null;
  fecha_registro: string;
  updated_at: string;
  creado_por: string | null;
  company_id: string;
};

export type Department = {
  department_id: string;
  nombre: string;
  descripcion: string | null;
  lead_user_id: string | null;
  company_id: string;
  created_at: string;
  updated_at: string;
};

export type LoginResponse = {
  token: string;
  user: StoredAuth['user'];
};

export async function login(payload: { email: string; password: string }): Promise<LoginResponse> {
  return apiFetch<LoginResponse>(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { skipAuthHeaders: true },
  );
}

export async function listDepartments(params: { companyId?: string } = {}): Promise<Department[]> {
  const init: RequestInit = {};
  if (params.companyId) {
    init.headers = { 'x-company-id': params.companyId };
  }
  const data = await apiFetch<{ items: Department[] }>('/api/departments', init);
  return data.items;
}

export type ListEmployeesParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmployeeStatus | 'todos';
  department_id?: string;
  manager_id?: string;
  company_id?: string;
};

export async function listEmployees(params: ListEmployeesParams = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search.trim());
  if (params.status && params.status !== 'todos') query.set('status', params.status);
  if (params.department_id) query.set('department_id', params.department_id);
  if (params.manager_id) query.set('manager_id', params.manager_id);
  if (params.company_id) query.set('company_id', params.company_id);
  const qs = query.toString();
  const path = qs ? `/api/employees?${qs}` : '/api/employees';
  return apiFetch<{ items: EmployeeSummary[]; total: number; page: number; pages: number; limit: number }>(path);
}

export type CreateEmployeePayload = {
  company_id?: string;
  employee_number?: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  email_corporate?: string;
  email_personal?: string;
  phone?: string;
  birthdate?: string;
  hire_date: string;
  end_date?: string;
  probation_end?: string;
  employment_type?: EmploymentType;
  department_id?: string;
  manager_id?: string;
  job_title?: string;
  location?: string;
  status?: EmployeeStatus;
  salary_amount?: number;
  salary_currency?: string;
  salary_period?: string;
  job_history?: {
    started_at: string;
    note?: string;
  };
  user_id?: string;
};

export async function createEmployee(payload: CreateEmployeePayload) {
  return apiFetch<{ employee: EmployeeSummary }>('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getEmployee(id: string) {
  return apiFetch<EmployeeDetail>(`/api/employees/${id}`);
}

export type UpdateEmployeePayload = Partial<CreateEmployeePayload> & {
  job_history?: {
    started_at: string;
    job_title?: string;
    department_id?: string;
    manager_id?: string;
    employment_type?: EmploymentType;
    salary_amount?: number;
    salary_currency?: string;
    salary_period?: string;
    note?: string;
  };
};

export async function updateEmployee(id: string, payload: UpdateEmployeePayload) {
  return apiFetch<EmployeeDetail>(`/api/employees/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listEmployeeNotes(employeeId: string) {
  const data = await apiFetch<{ items: EmployeeNote[] }>(`/api/employees/${employeeId}/notes`);
  return data.items;
}

export async function createEmployeeNote(employeeId: string, payload: { contenido: string; categoria?: string }) {
  return apiFetch<{ note: EmployeeNote }>(`/api/employees/${employeeId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateEmployeeNote(
  employeeId: string,
  noteId: string,
  payload: { contenido?: string; categoria?: string },
) {
  return apiFetch<{ note: EmployeeNote }>(`/api/employees/${employeeId}/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteEmployeeNote(employeeId: string, noteId: string) {
  await apiFetch(`/api/employees/${employeeId}/notes/${noteId}`, {
    method: 'DELETE',
  });
}

export async function listEmployeeAttachments(employeeId: string) {
  const data = await apiFetch<{ items: EmployeeAttachment[] }>(`/api/employees/${employeeId}/attachments`);
  return data.items;
}

export async function createEmployeeAttachment(
  employeeId: string,
  payload: { filename: string; storage_path: string; mime_type?: string; size_bytes?: number },
) {
  return apiFetch<{ attachment: EmployeeAttachment }>(`/api/employees/${employeeId}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteEmployeeAttachment(employeeId: string, attachmentId: string) {
  await apiFetch(`/api/employees/${employeeId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
}

export async function addEmployeeHistory(
  employeeId: string,
  payload: {
    started_at: string;
    ended_at?: string;
    job_title?: string;
    department_id?: string;
    manager_id?: string;
    employment_type?: EmploymentType;
    salary_amount?: number;
    salary_currency?: string;
    salary_period?: string;
    note?: string;
  },
) {
  return apiFetch<{ history: EmployeeDetail['history'][number] }>(`/api/employees/${employeeId}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchPublicApplicationsReport(params: {
  start?: string;
  end?: string;
  status?: string;
  company_id?: string;
} = {}) {
  const query = new URLSearchParams();
  if (params.start) query.set('start', params.start);
  if (params.end) query.set('end', params.end);
  if (params.status) query.set('status', params.status);
  if (params.company_id) query.set('company_id', params.company_id);
  const qs = query.toString();
  const path = qs ? `/api/reports/public-applications?${qs}` : '/api/reports/public-applications';
  return apiFetch<PublicApplicationsReport>(path);
}

export async function fetchPublicApplicationsConversion(params: { start?: string; end?: string; company_id?: string } = {}) {
  const query = new URLSearchParams();
  if (params.start) query.set('start', params.start);
  if (params.end) query.set('end', params.end);
  if (params.company_id) query.set('company_id', params.company_id);
  const qs = query.toString();
  const path = qs ? `/api/reports/public-applications/conversion?${qs}` : '/api/reports/public-applications/conversion';
  return apiFetch<PublicApplicationsConversion>(path);
}

export async function fetchPublicApplicationsResponseTime(params: { start?: string; end?: string; company_id?: string } = {}) {
  const query = new URLSearchParams();
  if (params.start) query.set('start', params.start);
  if (params.end) query.set('end', params.end);
  if (params.company_id) query.set('company_id', params.company_id);
  const qs = query.toString();
  const path = qs ? `/api/reports/public-applications/response-time?${qs}` : '/api/reports/public-applications/response-time';
  return apiFetch<PublicApplicationsResponseTime>(path);
}

export async function fetchPublicApplicationsSources(params: { start?: string; end?: string; company_id?: string } = {}) {
  const query = new URLSearchParams();
  if (params.start) query.set('start', params.start);
  if (params.end) query.set('end', params.end);
  if (params.company_id) query.set('company_id', params.company_id);
  const qs = query.toString();
  const path = qs ? `/api/reports/public-applications/sources?${qs}` : '/api/reports/public-applications/sources';
  return apiFetch<PublicApplicationsSources>(path);
}

export async function fetchInvitationReport(params: { start?: string; end?: string; company_id?: string } = {}) {
  const query = new URLSearchParams();
  if (params.start) query.set('start', params.start);
  if (params.end) query.set('end', params.end);
  if (params.company_id) query.set('company_id', params.company_id);
  const qs = query.toString();
  const path = qs ? `/api/reports/invitations?${qs}` : '/api/reports/invitations';
  return apiFetch<InvitationReport>(path);
}

export async function createDepartment(payload: { nombre: string; descripcion?: string }) {
  return apiFetch<{ department: Department }>('/api/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateDepartment(
  id: string,
  payload: { nombre?: string; descripcion?: string; lead_user_id?: string | null },
) {
  return apiFetch<{ department: Department }>(`/api/departments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteDepartment(id: string) {
  await apiFetch(`/api/departments/${id}`, { method: 'DELETE' });
}

export async function listCompanies(params: { search?: string; includeInactive?: boolean; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('q', params.search);
  if (params.includeInactive !== true) query.set('is_active', 'true');
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  const qs = query.toString();
  const pathUrl = qs ? `/api/companies?${qs}` : '/api/companies';
  const data = await apiFetch<{ items: CompanySummary[] }>(pathUrl);
  return data.items;
}

export async function createJob(payload: {
  titulo: string;
  descripcion: string;
  departamento?: string;
  departamento_id?: string;
  estado?: JobStatus;
  tipo_empleo?: EmploymentType;
  modalidad_trabajo?: WorkModality;
  ubicacion?: string;
  rango_salarial_min?: number;
  rango_salarial_max?: number;
  moneda?: string;
  fecha_publicacion?: string;
  fecha_cierre?: string;
  notas_internas?: string;
}) {
  return apiFetch<{ job: Job }>('/api/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function listJobs(
  params: {
    page?: number;
    limit?: number;
    estado?: JobStatus;
    departamento?: string;
    departamento_id?: string;
    tipo_empleo?: EmploymentType;
    modalidad_trabajo?: WorkModality;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.estado) query.set('estado', params.estado);
  if (params.departamento) query.set('departamento', params.departamento);
  if (params.departamento_id) query.set('departamento_id', params.departamento_id);
  if (params.tipo_empleo) query.set('tipo_empleo', params.tipo_empleo);
  if (params.modalidad_trabajo) query.set('modalidad_trabajo', params.modalidad_trabajo);

  const qs = query.toString();
  const path = qs ? `/api/jobs?${qs}` : '/api/jobs';
  return apiFetch<{ items: Job[]; total: number; page: number; pages: number }>(path);
}

export async function listPublicCompanies(params: { search?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search.trim());
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const path = qs ? `/public/companies?${qs}` : '/public/companies';
  const data = await apiFetch<{ items: PublicCompanySummary[] }>(path, {}, { skipAuthHeaders: true });
  return data.items;
}

export async function listPublicJobs(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    company_id?: string;
    company_slug?: string;
    employment_type?: EmploymentType;
    modality?: WorkModality;
    location?: string;
    department?: string;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search && params.search.trim()) query.set('search', params.search.trim());
  if (params.company_id) query.set('company_id', params.company_id);
  if (params.company_slug) query.set('company_slug', params.company_slug);
  if (params.employment_type) query.set('employment_type', params.employment_type);
  if (params.modality) query.set('modality', params.modality);
  if (params.location && params.location.trim()) query.set('location', params.location.trim());
  if (params.department && params.department.trim()) query.set('department', params.department.trim());
  const qs = query.toString();
  const path = qs ? `/public/jobs?${qs}` : '/public/jobs';
  return apiFetch<{ items: PublicJob[]; total: number; page: number; pages: number; limit: number }>(
    path,
    {},
    { skipAuthHeaders: true },
  );
}

export async function getPublicJob(id: string) {
  return apiFetch<{ job: PublicJob }>(`/public/jobs/${id}`, {}, { skipAuthHeaders: true });
}

export async function applyToPublicJob(jobId: string, payload: PublicApplicationPayload) {
  return apiFetch<PublicApplicationResponse>(
    `/public/jobs/${jobId}/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { skipAuthHeaders: true },
  );
}

export const applicationStatuses = [
  'Nuevo',
  'En revision',
  'Entrevista',
  'Oferta',
  'Contratado',
  'Rechazado',
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export type ApplicationRow = {
  application_id: string;
  estado: ApplicationStatus;
  applied_at: string;
  updated_at: string;
  source: string | null;
  source_details: string | null;
  salario_expectativa: string | null;
  moneda: string | null;
  nombre_completo: string;
  email: string;
  telefono: string | null;
  resumen_url: string | null;
  linkedin_url: string | null;
  ciudad: string | null;
  pais: string | null;
  fuente: string | null;
};

export type StageHistoryEntry = {
  stage_history_id: string;
  estado_anterior: ApplicationStatus | null;
  estado_nuevo: ApplicationStatus;
  comentario: string | null;
  cambiado_por: string | null;
  cambiado_por_nombre: string | null;
  cambiado_por_email: string | null;
  changed_at: string;
};

export type ApplicationNote = {
  note_id: string;
  contenido: string;
  categoria: string | null;
  autor_id: string | null;
  autor_nombre: string | null;
  autor_email: string | null;
  created_at: string;
  updated_at: string;
};

export async function listApplications(jobId: string): Promise<ApplicationRow[]> {
  const data = await apiFetch<{ items: ApplicationRow[] }>(`/api/jobs/${jobId}/applications`);
  return data.items;
}

export async function listStageHistory(applicationId: string): Promise<StageHistoryEntry[]> {
  const data = await apiFetch<{ items: StageHistoryEntry[] }>(`/api/applications/${applicationId}/stage-history`);
  return data.items;
}

export async function listApplicationNotes(applicationId: string): Promise<ApplicationNote[]> {
  const data = await apiFetch<{ items: ApplicationNote[] }>(`/api/applications/${applicationId}/notes`);
  return data.items;
}

export async function createApplicationNote(
  applicationId: string,
  payload: { contenido: string; categoria?: string; autor_id: string },
) {
  return apiFetch<{ note: ApplicationNote }>(`/api/applications/${applicationId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateApplicationStatus(id: string, estado: ApplicationStatus) {
  return apiFetch(`/api/applications/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ estado }),
  });
}

export async function listUsers(params: { includeInvitations?: boolean; companyId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.includeInvitations === false) query.set('include_invitations', 'false');
  if (params.companyId) query.set('company_id', params.companyId);
  const qs = query.toString();
  const pathUrl = qs ? `/api/users?${qs}` : '/api/users';
  const data = await apiFetch<{ items: PlatformUser[] }>(pathUrl);
  return data.items;
}

export async function inviteUser(payload: {
  email: string;
  nombre: string;
  rol: UserRole;
  company_id?: string;
  expires_in_hours?: number;
}) {
  return apiFetch<{ user: PlatformUser; invitation: InvitationSummary; reused_existing: boolean; email_delivery?: EmailDeliveryResult; company: { company_id: string; nombre: string } | null }>(
    '/api/users/invitations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export async function getInvitationDetails(token: string): Promise<InvitationDetails> {
  return apiFetch<InvitationDetails>(`/api/auth/invitations/${token}`, {}, { skipAuthHeaders: true });
}

export async function acceptInvitation(token: string, payload: { password: string; nombre?: string }) {
  return apiFetch<{ message: string }>(
    `/api/auth/invitations/${token}/accept`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { skipAuthHeaders: true },
  );
}

export function logout() {
  clearAuth();
}

export async function listInvitationHistory(
  userId: string,
  params: {
    page?: number;
    limit?: number;
    delivery?: 'todos' | 'enviado' | 'error' | 'pendiente';
    reused?: boolean;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.delivery && params.delivery !== 'todos') {
    query.set('delivery', params.delivery);
  }
  if (typeof params.reused === 'boolean') {
    query.set('reused', params.reused ? 'true' : 'false');
  }
  const qs = query.toString();
  const url = qs
    ? `/api/users/${userId}/invitations/history?${qs}`
    : `/api/users/${userId}/invitations/history`;
  return apiFetch<InvitationHistoryResponse>(url);
}

export async function updateUser(id: string, payload: { rol?: UserRole; activo?: boolean }) {
  return apiFetch<{ user: PlatformUser }>(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

