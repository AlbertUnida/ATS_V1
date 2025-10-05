import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyToPublicJob,
  listPublicCompanies,
  listPublicJobs,
  type EmploymentType,
  type PublicApplicationPayload,
  type PublicCompanySummary,
  type PublicJob,
  type WorkModality,
} from '../api';
import { Link } from 'react-router-dom';

declare global {
  interface Window {
    grecaptcha?: {
      ready(callback: () => void): void;
      execute(siteKey: string, options: { action: string }): Promise<string>;
    };
  }
}

const PAGE_SIZE = 10;

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  tiempo_completo: 'Tiempo completo',
  medio_tiempo: 'Medio tiempo',
  contrato: 'Contrato',
  practicas: 'Prácticas',
  temporal: 'Temporal',
};

const MODALITY_LABELS: Record<WorkModality, string> = {
  presencial: 'Presencial',
  remoto: 'Remoto',
  hibrido: 'Híbrido',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatSalary(min: string | null, max: string | null, currency: string | null) {
  if (!min && !max) return 'A convenir';
  const formatValue = (raw: string | null) => {
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency ?? 'USD',
        maximumFractionDigits: 0,
      }).format(numeric);
    } catch {
      return `${numeric.toLocaleString()} ${currency ?? ''}`.trim();
    }
  };

  const from = formatValue(min);
  const to = formatValue(max);

  if (from && to) return `${from} – ${to}`;
  return from ?? to ?? 'A convenir';
}

function excerpt(text: string, maxLength = 220) {
  const clean = text.trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}…`;
}

type FormState = {
  nombre_completo: string;
  email: string;
  telefono: string;
  resumen_url: string;
  linkedin_url: string;
  ciudad: string;
  pais: string;
  mensaje: string;
  salario_expectativa: string;
  moneda: string;
  acepta_politica: boolean;
};

function createEmptyForm(): FormState {
  return {
    nombre_completo: '',
    email: '',
    telefono: '',
    resumen_url: '',
    linkedin_url: '',
    ciudad: '',
    pais: '',
    mensaje: '',
    salario_expectativa: '',
    moneda: '',
    acepta_politica: false,
  };
}

export default function PublicJobsPage() {
  const [companies, setCompanies] = useState<PublicCompanySummary[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('');
  const [modality, setModality] = useState<WorkModality | ''>('');
  const [location, setLocation] = useState('');
  const [department, setDepartment] = useState('');

  const [selectedJob, setSelectedJob] = useState<PublicJob | null>(null);
  const [form, setForm] = useState<FormState>(createEmptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<'received' | 'duplicate' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';
  const captchaEnabled = Boolean(recaptchaSiteKey);
  const [captchaReady, setCaptchaReady] = useState<boolean>(!captchaEnabled);
  const [captchaLoadError, setCaptchaLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadCompanies = async () => {
      setCompaniesLoading(true);
      setCompaniesError(null);
      try {
        const items = await listPublicCompanies();
        if (cancelled) return;
        setCompanies(items);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'No se pudieron obtener las empresas.';
        setCompaniesError(message);
      } finally {
        if (!cancelled) {
          setCompaniesLoading(false);
        }
      }
    };

    void loadCompanies();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      setJobsLoading(true);
      setJobsError(null);
      try {
        const response = await listPublicJobs({
          page,
          limit: PAGE_SIZE,
          search: search.trim() || undefined,
          company_id: companyFilter || undefined,
          employment_type: employmentType || undefined,
          modality: modality || undefined,
          location: location.trim() || undefined,
          department: department.trim() || undefined,
        });
        if (cancelled) return;

        setJobs(response.items);
        setTotal(response.total);
        setPages(response.pages);
        if (response.page !== page) {
          setPage(response.page);
        }

        if (selectedJob) {
          const updated = response.items.find((item) => item.job_id === selectedJob.job_id) ?? null;
          setSelectedJob(updated ?? null);
          if (!updated) {
            setForm(createEmptyForm());
            setFormError(null);
            setFormSuccess(null);
          }
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'No se pudieron obtener las vacantes.';
        setJobsError(message);
        setJobs([]);
        setTotal(0);
        setPages(1);
      } finally {
        if (!cancelled) {
          setJobsLoading(false);
        }
      }
    };

    void loadJobs();

    return () => {
      cancelled = true;
    };
  }, [page, search, companyFilter, employmentType, modality, location, department, selectedJob?.job_id]);

  const hasFilters = useMemo(
    () =>
      Boolean(
        search.trim() ||
          companyFilter ||
          employmentType ||
          modality ||
          location.trim() ||
          department.trim(),
      ),
    [search, companyFilter, employmentType, modality, location, department],
  );

  const resetForm = useCallback(() => {
    setForm(createEmptyForm());
    setFormError(null);
    setFormSuccess(null);
  }, []);

  const handleFormChange = useCallback(
    (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.type === 'checkbox' ? (event.target as HTMLInputElement).checked : event.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSelectJob = useCallback(
    (job: PublicJob | null) => {
      setSelectedJob(job);
      resetForm();
    },
    [resetForm],
  );

  useEffect(() => {
    if (!captchaEnabled) return;
    setCaptchaReady(false);
    setCaptchaLoadError(null);
    let cancelled = false;

    const ensureReady = () => {
      if (cancelled) return;
      window.grecaptcha?.ready(() => {
        if (!cancelled) setCaptchaReady(true);
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('#recaptcha-script');
    if (existing) {
      if (window.grecaptcha) {
        ensureReady();
      } else {
        existing.addEventListener('load', ensureReady, { once: true });
      }
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement('script');
    script.id = 'recaptcha-script';
    script.src = `https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = ensureReady;
    script.onerror = () => {
      if (!cancelled) {
        setCaptchaLoadError('No se pudo cargar el captcha. Actualiza la página e intenta de nuevo.');
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [captchaEnabled, recaptchaSiteKey]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedJob) return;

      setFormError(null);
      setFormSuccess(null);

      if (!form.nombre_completo.trim()) {
        setFormError('Ingresa tu nombre completo.');
        return;
      }
      if (!form.email.trim()) {
        setFormError('Ingresa un correo electrónico.');
        return;
      }
      if (!form.acepta_politica) {
        setFormError('Debes aceptar la política de privacidad.');
        return;
      }

      let salarioNumber: number | undefined;
      const salarioText = form.salario_expectativa.trim();
      if (salarioText) {
        const parsed = Number(salarioText);
        if (!Number.isFinite(parsed)) {
          setFormError('La expectativa salarial debe ser un número.');
          return;
        }
        salarioNumber = parsed;
      }

      const payload: PublicApplicationPayload = {
        nombre_completo: form.nombre_completo.trim(),
        email: form.email.trim(),
        acepta_politica: form.acepta_politica,
      };

      if (form.telefono.trim()) payload.telefono = form.telefono.trim();
      if (form.resumen_url.trim()) payload.resumen_url = form.resumen_url.trim();
      if (form.linkedin_url.trim()) payload.linkedin_url = form.linkedin_url.trim();
      if (form.ciudad.trim()) payload.ciudad = form.ciudad.trim();
      if (form.pais.trim()) payload.pais = form.pais.trim();
      if (form.mensaje.trim()) payload.mensaje = form.mensaje.trim();
      if (salarioNumber !== undefined) payload.salario_expectativa = salarioNumber;
      if (form.moneda.trim()) payload.moneda = form.moneda.trim();

      if (captchaEnabled) {
        if (captchaLoadError) {
          setFormError(captchaLoadError);
          return;
        }
        if (!captchaReady) {
          setFormError('El captcha aún se está inicializando. Intenta nuevamente en unos segundos.');
          return;
        }
        try {
          const token = await window.grecaptcha?.execute(recaptchaSiteKey, { action: 'public_apply' });
          if (!token) {
            throw new Error('token_vacio');
          }
          payload.recaptcha_token = token;
        } catch (err) {
          console.error('Captcha error', err);
          setFormError('No se pudo verificar el captcha. Vuelve a intentarlo.');
          return;
        }
      }

      setSubmitting(true);
      try {
        const response = await applyToPublicJob(selectedJob.job_id, payload);
        setFormSuccess(response.status);
        if (response.status === 'received') {
          setForm((prev) => ({
            ...createEmptyForm(),
            email: prev.email,
            nombre_completo: prev.nombre_completo,
            acepta_politica: prev.acepta_politica,
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo registrar la postulación.';
        setFormError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [form, selectedJob, captchaEnabled, captchaLoadError, captchaReady, recaptchaSiteKey],
  );

  const submitDisabled = submitting || (captchaEnabled && (!captchaReady || Boolean(captchaLoadError)));

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <header style={{ marginBottom: '2rem', display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Portal de Vacantes</h1>
        <p style={{ margin: 0, color: '#555' }}>
          Explora oportunidades laborales activas de empresas que utilizan Talent Flow. Selecciona una vacante para
          ver más detalles y ponte en contacto con la empresa para iniciar tu postulación.
        </p>
        <p style={{ margin: 0, fontSize: 14 }}>
          ¿Eres parte del equipo de recursos humanos? <Link to="/login">Inicia sesión</Link> para gestionar tus
          vacantes.
        </p>
      </header>

      <section style={{ border: '1px solid #e5e7eb', padding: '1rem', borderRadius: 12, marginBottom: '1.75rem' }}>
        <h2 style={{ marginTop: 0 }}>Filtrar</h2>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Palabra clave
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="titulo, descripcion"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Empresa
            <select
              value={companyFilter}
              onChange={(event) => {
                setCompanyFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">(todas)</option>
              {companies.map((company) => (
                <option key={company.company_id} value={company.company_id}>
                  {company.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Tipo de empleo
            <select
              value={employmentType}
              onChange={(event) => {
                setEmploymentType(event.target.value as EmploymentType | '');
                setPage(1);
              }}
            >
              <option value="">(todos)</option>
              {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((value) => (
                <option key={value} value={value}>
                  {EMPLOYMENT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Modalidad
            <select
              value={modality}
              onChange={(event) => {
                setModality(event.target.value as WorkModality | '');
                setPage(1);
              }}
            >
              <option value="">(todas)</option>
              {(Object.keys(MODALITY_LABELS) as WorkModality[]).map((value) => (
                <option key={value} value={value}>
                  {MODALITY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Ubicación
            <input
              type="text"
              value={location}
              onChange={(event) => {
                setLocation(event.target.value);
                setPage(1);
              }}
              placeholder="Ciudad o país"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Departamento
            <input
              type="text"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setPage(1);
              }}
              placeholder="Equipo o área"
            />
          </label>
        </div>
        <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 14 }}>
            Resultados: {total} {hasFilters ? '(con filtros)' : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCompanyFilter('');
              setEmploymentType('');
              setModality('');
              setLocation('');
              setDepartment('');
              setPage(1);
            }}
            disabled={!hasFilters}
          >
            Limpiar filtros
          </button>
        </div>
        {companiesError && <p style={{ color: 'crimson', marginTop: '0.75rem' }}>{companiesError}</p>}
        {companiesLoading && <p style={{ fontSize: 12, marginTop: '0.75rem' }}>Cargando listado de empresas…</p>}
      </section>

      <section>
        {jobsLoading ? (
          <p>Cargando vacantes…</p>
        ) : jobsError ? (
          <p style={{ color: 'crimson' }}>{jobsError}</p>
        ) : jobs.length === 0 ? (
          <p>No se encontraron vacantes activas con los criterios seleccionados.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {jobs.map((job) => {
              const isSelected = selectedJob?.job_id === job.job_id;
              return (
                <article
                  key={job.job_id}
                  style={{
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: '1rem',
                    backgroundColor: isSelected ? '#f0f5ff' : '#fff',
                    transition: 'border-color 0.2s ease',
                  }}
                >
                  <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{job.titulo}</h3>
                      <p style={{ margin: 0, color: '#555' }}>{job.company_nombre}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        Publicado: {formatDate(job.fecha_publicacion ?? job.fecha_registro)}
                      </span>
                      <button type="button" onClick={() => handleSelectJob(isSelected ? null : job)}>
                        {isSelected ? 'Ocultar detalles' : 'Ver detalles'}
                      </button>
                    </div>
                  </header>
                  <p style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>{excerpt(job.descripcion)}</p>
                  <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', margin: 0, fontSize: 14 }}>
                    <div>
                      <dt style={{ fontWeight: 600 }}>Tipo</dt>
                      <dd style={{ margin: 0 }}>{EMPLOYMENT_LABELS[job.tipo_empleo]}</dd>
                    </div>
                    <div>
                      <dt style={{ fontWeight: 600 }}>Modalidad</dt>
                      <dd style={{ margin: 0 }}>{job.modalidad_trabajo ? MODALITY_LABELS[job.modalidad_trabajo] : 'No especificada'}</dd>
                    </div>
                    <div>
                      <dt style={{ fontWeight: 600 }}>Ubicación</dt>
                      <dd style={{ margin: 0 }}>{job.ubicacion ?? 'Remoto / Mixta'}</dd>
                    </div>
                    <div>
                      <dt style={{ fontWeight: 600 }}>Salario</dt>
                      <dd style={{ margin: 0 }}>{formatSalary(job.rango_salarial_min, job.rango_salarial_max, job.moneda)}</dd>
                    </div>
                  </dl>
                  {isSelected && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #d1d5db' }}>
                      <h4>Descripción completa</h4>
                      <p style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>{job.descripcion.trim()}</p>
                      <p style={{ marginTop: '1rem', fontSize: 14, color: '#374151' }}>
                        También puedes contactar al equipo de <strong>{job.company_nombre}</strong> de manera directa y
                        mencionar la vacante “{job.titulo}”.
                      </p>
                      <div style={{ marginTop: '1.5rem' }}>
                        <h4>Enviar postulación en línea</h4>
                        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 520 }}>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            Nombre completo*
                            <input
                              type="text"
                              value={form.nombre_completo}
                              onChange={handleFormChange('nombre_completo')}
                              required
                              disabled={submitting}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            Correo electrónico*
                            <input
                              type="email"
                              value={form.email}
                              onChange={handleFormChange('email')}
                              required
                              disabled={submitting}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            Teléfono
                            <input
                              type="tel"
                              value={form.telefono}
                              onChange={handleFormChange('telefono')}
                              disabled={submitting}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            Ciudad
                            <input
                              type="text"
                              value={form.ciudad}
                              onChange={handleFormChange('ciudad')}
                              disabled={submitting}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            País
                            <input
                              type="text"
                              value={form.pais}
                              onChange={handleFormChange('pais')}
                              disabled={submitting}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            URL de CV
                            <input
                              type="url"
                              placeholder="https://..."
                              value={form.resumen_url}
                              onChange={handleFormChange('resumen_url')}
                              disabled={submitting}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            Perfil de LinkedIn
                            <input
                              type="url"
                              placeholder="https://linkedin.com/in/..."
                              value={form.linkedin_url}
                              onChange={handleFormChange('linkedin_url')}
                              disabled={submitting}
                            />
                          </label>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="checkbox"
                              checked={form.acepta_politica}
                              onChange={handleFormChange('acepta_politica')}
                              disabled={submitting}
                              required
                            />
                            <span style={{ fontSize: 13 }}>
                              Acepto que mis datos sean tratados para procesos de selección.
                            </span>
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            Expectativa salarial
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                type="text"
                                placeholder="Monto"
                                value={form.salario_expectativa}
                                onChange={handleFormChange('salario_expectativa')}
                                style={{ flex: 1 }}
                                disabled={submitting}
                              />
                              <input
                                type="text"
                                placeholder="Moneda"
                                value={form.moneda}
                                onChange={handleFormChange('moneda')}
                                style={{ width: 80 }}
                                maxLength={3}
                                disabled={submitting}
                              />
                            </div>
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            Mensaje para el equipo de selección
                            <textarea
                              rows={5}
                              value={form.mensaje}
                              onChange={handleFormChange('mensaje')}
                              placeholder="Cuéntanos por qué te interesa la vacante"
                              disabled={submitting}
                            />
                          </label>
                          {formError && <p style={{ color: 'crimson', fontSize: 14 }}>{formError}</p>}
                          {formSuccess && (
                            <p style={{ color: '#166534', fontSize: 14 }}>
                              {formSuccess === 'received'
                                ? 'Tu postulación fue recibida. El equipo de la empresa revisará tu perfil y se pondrá en contacto si avanzas al siguiente paso.'
                                : 'Ya registramos tu postulación previamente para esta vacante. Si necesitas actualizar tus datos, contacta al equipo de recursos humanos.'}
                            </p>
                          )}
                          {captchaEnabled && !captchaLoadError && !captchaReady && (
                            <p style={{ fontSize: 12, color: '#6b7280' }}>Inicializando captcha…</p>
                          )}
                          <button type="submit" disabled={submitDisabled}>
                            {submitting ? 'Enviando...' : 'Enviar postulación'}
                          </button>
                          {captchaEnabled && captchaLoadError && (
                            <p style={{ fontSize: 12, color: 'crimson', marginTop: 4 }}>{captchaLoadError}</p>
                          )}
                        </form>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: '1.5rem' }}>
          <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1 || jobsLoading}>
            Anterior
          </button>
          <span>
            Página {page} de {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
            disabled={page >= pages || jobsLoading}
          >
            Siguiente
          </button>
        </div>
      </section>
    </main>
  );
}
