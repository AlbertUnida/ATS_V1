import { FormEvent, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  createEmployee,
  listEmployees,
  listDepartments,
  listCompanies,
  getEmployee,
  listEmployeeNotes,
  createEmployeeNote,
  updateEmployeeNote,
  deleteEmployeeNote,
  listEmployeeAttachments,
  createEmployeeAttachment,
  deleteEmployeeAttachment,
  addEmployeeHistory,
  type CompanySummary,
  type Department,
  type EmployeeDetail,
  type EmployeeStatus,
  type EmployeeSummary,
  type EmploymentType,
  type CreateEmployeePayload,
  type EmployeeNote,
  type EmployeeAttachment,
} from '../api';
import { useAuth } from '../context/AuthContext';

type StatusFilter = 'todos' | EmployeeStatus;

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  tiempo_completo: 'Tiempo completo',
  medio_tiempo: 'Medio tiempo',
  contrato: 'Contrato',
  practicas: 'Prácticas',
  temporal: 'Temporal',
};

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  activo: 'Activo',
  suspendido: 'Suspendido',
  baja: 'Baja',
};

const initialForm: CreateEmployeePayload = {
  first_name: '',
  last_name: '',
  hire_date: '',
  employment_type: 'tiempo_completo',
  status: 'activo',
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
}

export default function EmployeeDirectory() {
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.is_super_admin);

  const [companyOptions, setCompanyOptions] = useState<CompanySummary[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(user?.company_id ?? '');

  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const [departments, setDepartments] = useState<Department[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateEmployeePayload>(initialForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'notes' | 'documents'>('overview');

  const [notes, setNotes] = useState<EmployeeNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [editingNoteCategory, setEditingNoteCategory] = useState('');
  const [noteFormError, setNoteFormError] = useState<string | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);

  const [attachments, setAttachments] = useState<EmployeeAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentForm, setAttachmentForm] = useState({ filename: '', storage_path: '', mime_type: '', size_bytes: '' });
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentSaving, setAttachmentSaving] = useState(false);

  const [historyForm, setHistoryForm] = useState({
    started_at: '',
    ended_at: '',
    job_title: '',
    department_id: '',
    manager_id: '',
    employment_type: '' as '' | EmploymentType,
    salary_amount: '',
    salary_currency: '',
    salary_period: '',
    note: '',
  });
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canManage = canCreateEmployee(user);

  const refreshNotes = useCallback(async (employeeId: string) => {
    setNotesLoading(true);
    setNotesError(null);
    try {
      const data = await listEmployeeNotes(employeeId);
      setNotes(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar las notas.';
      setNotesError(message);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  const refreshAttachments = useCallback(async (employeeId: string) => {
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      const data = await listEmployeeAttachments(employeeId);
      setAttachments(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar los adjuntos.';
      setAttachmentsError(message);
      setAttachments([]);
    } finally {
      setAttachmentsLoading(false);
    }
  }, []);

  const handleSubmitNote = useCallback(async () => {
    if (!selectedId) return;
    const content = editingNoteId ? editingNoteContent : newNoteContent;
    const category = editingNoteId ? editingNoteCategory : newNoteCategory;
    if (!content.trim()) {
      setNoteFormError('El contenido no puede estar vacío.');
      return;
    }
    setNotesSaving(true);
    setNoteFormError(null);
    try {
      if (editingNoteId) {
        await updateEmployeeNote(selectedId, editingNoteId, {
          contenido: content.trim(),
          categoria: category.trim() || undefined,
        });
        setEditingNoteId(null);
        setEditingNoteContent('');
        setEditingNoteCategory('');
      } else {
        await createEmployeeNote(selectedId, {
          contenido: content.trim(),
          categoria: category.trim() || undefined,
        });
        setNewNoteContent('');
        setNewNoteCategory('');
      }
      await refreshNotes(selectedId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar la nota.';
      setNoteFormError(message);
    } finally {
      setNotesSaving(false);
    }
  }, [editingNoteCategory, editingNoteContent, editingNoteId, newNoteCategory, newNoteContent, refreshNotes, selectedId]);

  const handleEditNote = (note: EmployeeNote) => {
    setEditingNoteId(note.note_id);
    setEditingNoteContent(note.contenido);
    setEditingNoteCategory(note.categoria ?? '');
    setNoteFormError(null);
    setNewNoteContent('');
    setNewNoteCategory('');
    setActiveTab('notes');
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteContent('');
    setEditingNoteCategory('');
    setNoteFormError(null);
  };

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!selectedId) return;
      try {
        await deleteEmployeeNote(selectedId, noteId);
        await refreshNotes(selectedId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo eliminar la nota.';
        setNotesError(message);
      }
    },
    [refreshNotes, selectedId],
  );

  const handleSubmitAttachment = useCallback(async () => {
    if (!selectedId) return;
    if (!attachmentForm.filename.trim() || !attachmentForm.storage_path.trim()) {
      setAttachmentError('Archivo y ruta son obligatorios.');
      return;
    }
    setAttachmentSaving(true);
    setAttachmentError(null);
    try {
      await createEmployeeAttachment(selectedId, {
        filename: attachmentForm.filename.trim(),
        storage_path: attachmentForm.storage_path.trim(),
        mime_type: attachmentForm.mime_type.trim() || undefined,
        size_bytes: attachmentForm.size_bytes ? Number(attachmentForm.size_bytes) : undefined,
      });
      setAttachmentForm({ filename: '', storage_path: '', mime_type: '', size_bytes: '' });
      await refreshAttachments(selectedId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el adjunto.';
      setAttachmentError(message);
    } finally {
      setAttachmentSaving(false);
    }
  }, [attachmentForm, refreshAttachments, selectedId]);

  const handleDeleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!selectedId) return;
      try {
        await deleteEmployeeAttachment(selectedId, attachmentId);
        await refreshAttachments(selectedId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo eliminar el adjunto.';
        setAttachmentsError(message);
      }
    },
    [refreshAttachments, selectedId],
  );

  const handleSubmitHistory = useCallback(async () => {
    if (!selectedId) return;
    if (!historyForm.started_at) {
      setHistoryError('Debes indicar la fecha de inicio.');
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      await addEmployeeHistory(selectedId, {
        started_at: historyForm.started_at,
        ended_at: historyForm.ended_at || undefined,
        job_title: historyForm.job_title.trim() || undefined,
        department_id: historyForm.department_id || undefined,
        manager_id: historyForm.manager_id || undefined,
        employment_type: (historyForm.employment_type || undefined) as EmploymentType | undefined,
        salary_amount: historyForm.salary_amount ? Number(historyForm.salary_amount) : undefined,
        salary_currency: historyForm.salary_currency.trim() || undefined,
        salary_period: historyForm.salary_period.trim() || undefined,
        note: historyForm.note.trim() || undefined,
      });
      setHistoryForm((prev) => ({
        ...prev,
        note: '',
        job_title: '',
        salary_amount: '',
        salary_currency: '',
        salary_period: '',
      }));
      await refreshNotes(selectedId);
      await refreshAttachments(selectedId);
      const detail = await getEmployee(selectedId);
      setSelectedEmployee(detail);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el movimiento.';
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyForm, refreshAttachments, refreshNotes, selectedId]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const loadCompanies = async () => {
      try {
        const result = await listCompanies({ limit: 100, includeInactive: false });
        setCompanyOptions(result);
        if (!selectedCompanyId && result.length > 0) {
          setSelectedCompanyId(result[0].company_id);
        }
      } catch (err) {
        console.error('Error loading companies', err);
      }
    };
    void loadCompanies();
  }, [isSuperAdmin, selectedCompanyId]);

  useEffect(() => {
    const loadDepartments = async () => {
      const companyId = isSuperAdmin ? selectedCompanyId : user?.company_id ?? '';
      if (!companyId) {
        setDepartments([]);
        return;
      }
      try {
        const items = await listDepartments({ companyId });
        setDepartments(items);
      } catch (err) {
        console.error('Error loading departments', err);
      }
    };
    void loadDepartments();
  }, [isSuperAdmin, selectedCompanyId, user?.company_id]);

  useEffect(() => {
    const loadEmployees = async () => {
      const companyId = isSuperAdmin ? selectedCompanyId : user?.company_id ?? '';
      if (!companyId) {
        setEmployees([]);
        setPages(1);
        setTotal(0);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await listEmployees({
          page,
          limit: 25,
          search: search.trim() || undefined,
          status: statusFilter,
          department_id: departmentFilter || undefined,
          company_id: companyId,
        });
        setEmployees(response.items);
        setPages(response.pages);
        setTotal(response.total);
        if (page > response.pages) {
          setPage(response.pages);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudieron cargar los empleados.';
        setError(message);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };
    void loadEmployees();
  }, [isSuperAdmin, selectedCompanyId, user?.company_id, page, search, statusFilter, departmentFilter]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedEmployee(null);
      setDetailError(null);
      setNotes([]);
      setAttachments([]);
      return;
    }
    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const data = await getEmployee(selectedId);
        setSelectedEmployee(data);
        setHistoryForm((prev) => ({
          ...prev,
          started_at: data.employee.hire_date ?? new Date().toISOString().slice(0, 10),
          department_id: data.employee.department_id ?? '',
          manager_id: data.employee.manager_id ?? '',
          employment_type: (data.employee.employment_type as EmploymentType | null) ?? '',
        }));
        await refreshNotes(selectedId);
        await refreshAttachments(selectedId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo cargar el detalle.';
        setDetailError(message);
      } finally {
        setDetailLoading(false);
      }
    };
    void loadDetail();
  }, [refreshAttachments, refreshNotes, selectedId]);

  const handleOpenCreate = () => {
    setCreateForm({
      ...initialForm,
      hire_date: new Date().toISOString().slice(0, 10),
    });
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const companyId = isSuperAdmin ? selectedCompanyId : user?.company_id ?? '';
    if (!companyId) {
      setCreateError('Selecciona una empresa.');
      return;
    }
    if (!createForm.first_name.trim() || !createForm.last_name.trim()) {
      setCreateError('Nombre y apellido son obligatorios.');
      return;
    }
    if (!createForm.hire_date) {
      setCreateError('Debes indicar la fecha de ingreso.');
      return;
    }

    const payload: CreateEmployeePayload = {
      ...createForm,
      company_id: companyId,
    };

    if (createForm.salary_amount !== undefined && createForm.salary_amount !== null) {
      payload.salary_amount = Number(createForm.salary_amount);
      if (Number.isNaN(payload.salary_amount)) {
        setCreateError('El salario debe ser un número.');
        return;
      }
    }

    setCreateLoading(true);
    setCreateError(null);
    try {
      await createEmployee(payload);
      setCreateOpen(false);
      setCreateLoading(false);
      setPage(1);
      setSearch('');
      setStatusFilter('todos');
      // Trigger reload
      const response = await listEmployees({
        page: 1,
        limit: 25,
        company_id: companyId,
      });
      setEmployees(response.items);
      setPages(response.pages);
      setTotal(response.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el empleado.';
      setCreateError(message);
      setCreateLoading(false);
    }
  };

  const activeCompanyName = useMemo(() => {
    if (!isSuperAdmin) return null;
    const option = companyOptions.find((item) => item.company_id === selectedCompanyId);
    return option?.nombre ?? null;
  }, [companyOptions, isSuperAdmin, selectedCompanyId]);

  return (
    <section style={{ marginBottom: '2rem' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Directorio de empleados</h2>
        {isSuperAdmin && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Empresa
              <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
                <option value="">Selecciona una empresa</option>
                {companyOptions.map((company) => (
                  <option key={company.company_id} value={company.company_id}>
                    {company.nombre}
                  </option>
                ))}
              </select>
            </label>
            {activeCompanyName && <span style={{ fontSize: 12, color: '#555' }}>Gestionando: {activeCompanyName}</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Buscar
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Nombre, correo o legajo"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Estado
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="todos">(todos)</option>
              <option value="activo">Activos</option>
              <option value="suspendido">Suspendidos</option>
              <option value="baja">Dados de baja</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Departamento
            <select
              value={departmentFilter}
              onChange={(event) => {
                setDepartmentFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">(todos)</option>
              {departments.map((dept) => (
                <option key={dept.department_id} value={dept.department_id}>
                  {dept.nombre}
                </option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: 12, color: '#555' }}>Total: {total}</span>
          {canManage && (
            <button type="button" onClick={handleOpenCreate} disabled={isSuperAdmin && !selectedCompanyId}>
              Agregar empleado
            </button>
          )}
        </div>
      </header>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {loading ? (
        <p>Cargando empleados...</p>
      ) : employees.length === 0 ? (
        <p>No hay registros con los filtros actuales.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Nombre</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Cargo</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Departamento</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Ingreso</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((item) => {
                  const name = item.display_name || `${item.first_name} ${item.last_name}`.trim();
                  return (
                    <tr
                      key={item.employee_id}
                      onClick={() => setSelectedId(item.employee_id)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selectedId === item.employee_id ? '#f0f4ff' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid #f2f2f2' }}>{name || 'Sin nombre'}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid #f2f2f2' }}>{item.job_title ?? '—'}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid #f2f2f2' }}>{item.department_name ?? '—'}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid #f2f2f2' }}>{formatDate(item.hire_date)}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid #f2f2f2' }}>{STATUS_LABELS[item.status]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: '1rem', display: 'flex', gap: 12, alignItems: 'center' }}>
              <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
                Anterior
              </button>
              <span>
                Página {page} de {pages}
              </span>
              <button type="button" onClick={() => setPage((prev) => Math.min(pages, prev + 1))} disabled={page >= pages}>
                Siguiente
              </button>
            </div>
          </div>
          <aside style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', minHeight: 320 }}>
            {!selectedId ? (
              <p>Selecciona un empleado para ver el detalle.</p>
            ) : detailLoading ? (
              <p>Cargando detalle...</p>
            ) : detailError ? (
              <p style={{ color: 'crimson' }}>{detailError}</p>
            ) : selectedEmployee ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { id: 'overview', label: 'Resumen' },
                    { id: 'history', label: 'Historial' },
                    { id: 'notes', label: 'Notas' },
                    { id: 'documents', label: 'Documentos' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: 6,
                        border: '1px solid #cbd5f5',
                        backgroundColor: activeTab === tab.id ? '#e0e7ff' : '#fff',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'overview' && (
                  <EmployeeOverview detail={selectedEmployee} />
                )}

                {activeTab === 'history' && (
                  <HistorySection
                    detail={selectedEmployee}
                    historyForm={historyForm}
                    setHistoryForm={setHistoryForm}
                    onSubmit={handleSubmitHistory}
                    saving={historyLoading}
                    error={historyError}
                    canManage={canManage}
                    departments={departments}
                  />
                )}

                {activeTab === 'notes' && (
                  <NotesSection
                    notes={notes}
                    loading={notesLoading}
                    error={notesError}
                    formError={noteFormError}
                    newContent={newNoteContent}
                    setNewContent={setNewNoteContent}
                    newCategory={newNoteCategory}
                    setNewCategory={setNewNoteCategory}
                    editingId={editingNoteId}
                    editingContent={editingNoteContent}
                    setEditingContent={setEditingNoteContent}
                    editingCategory={editingNoteCategory}
                    setEditingCategory={setEditingNoteCategory}
                    onEdit={handleEditNote}
                    onCancelEdit={handleCancelEditNote}
                    onDelete={handleDeleteNote}
                    onSubmit={handleSubmitNote}
                    saving={notesSaving}
                    canManage={canManage}
                  />
                )}

                {activeTab === 'documents' && (
                  <AttachmentsSection
                    attachments={attachments}
                    loading={attachmentsLoading}
                    error={attachmentsError}
                    form={attachmentForm}
                    setForm={setAttachmentForm}
                    formError={attachmentError}
                    onSubmit={handleSubmitAttachment}
                    saving={attachmentSaving}
                    onDelete={handleDeleteAttachment}
                    canManage={canManage}
                  />
                )}
              </div>
            ) : (
              <p>Detalle no disponible.</p>
            )}
          </aside>
        </div>
      )}

      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: 12, width: 'min(520px, 90vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>Nuevo empleado</h3>
            <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Nombre*
                  <input
                    type="text"
                    value={createForm.first_name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, first_name: event.target.value }))}
                    required
                  />
                </label>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Apellido*
                  <input
                    type="text"
                    value={createForm.last_name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, last_name: event.target.value }))}
                    required
                  />
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Nombre público
                <input
                  type="text"
                  value={createForm.display_name ?? ''}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, display_name: event.target.value }))}
                  placeholder="Como aparecerá en el directorio"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Correo corporativo
                <input
                  type="email"
                  value={createForm.email_corporate ?? ''}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, email_corporate: event.target.value }))}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Fecha de ingreso*
                <input
                  type="date"
                  value={createForm.hire_date}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, hire_date: event.target.value }))}
                  required
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Cargo / Puesto
                <input
                  type="text"
                  value={createForm.job_title ?? ''}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, job_title: event.target.value }))}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Departamento
                <select
                  value={createForm.department_id ?? ''}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, department_id: event.target.value || undefined }))}
                >
                  <option value="">(sin asignar)</option>
                  {departments.map((dept) => (
                    <option key={dept.department_id} value={dept.department_id}>
                      {dept.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Tipo de empleo
                <select
                  value={createForm.employment_type ?? 'tiempo_completo'}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      employment_type: event.target.value as EmploymentType,
                    }))
                  }
                >
                  {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((value) => (
                    <option key={value} value={value}>
                      {EMPLOYMENT_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Estatus
                  <select
                    value={createForm.status ?? 'activo'}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        status: event.target.value as EmployeeStatus,
                      }))
                    }
                  >
                    {(['activo', 'suspendido', 'baja'] as EmployeeStatus[]).map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Legajo / ID interno
                  <input
                    type="text"
                    value={createForm.employee_number ?? ''}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, employee_number: event.target.value }))}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Salario
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.salary_amount ?? ''}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        salary_amount: event.target.value ? Number(event.target.value) : undefined,
                      }))
                    }
                  />
                </label>
                <label style={{ width: 90, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Moneda
                  <input
                    type="text"
                    maxLength={3}
                    value={createForm.salary_currency ?? ''}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        salary_currency: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Periodicidad
                  <input
                    type="text"
                    value={createForm.salary_period ?? ''}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, salary_period: event.target.value }))}
                    placeholder="Mensual, anual, etc."
                  />
                </label>
              </div>

              {createError && <p style={{ color: 'crimson' }}>{createError}</p>}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setCreateOpen(false)} disabled={createLoading}>
                  Cancelar
                </button>
                <button type="submit" disabled={createLoading}>
                  {createLoading ? 'Guardando...' : 'Crear empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function EmployeeOverview({ detail }: { detail: EmployeeDetail }) {
  const employee = detail.employee;
  const name = employee.display_name || `${employee.first_name} ${employee.last_name}`.trim();

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.25rem 0' }}>{name || 'Sin nombre'}</h3>
        <p style={{ margin: 0, color: '#555' }}>{employee.job_title ?? 'Sin cargo'}</p>
        <p style={{ margin: 0, fontSize: 12 }}>
          Estado: <strong>{STATUS_LABELS[employee.status]}</strong> · Ingreso: {formatDate(employee.hire_date)}
        </p>
      </div>

      <div style={{ fontSize: 13 }}>
        <p style={{ margin: '0.25rem 0' }}>
          Correo corporativo: <strong>{employee.email_corporate ?? '—'}</strong>
        </p>
        <p style={{ margin: '0.25rem 0' }}>Correo personal: {employee.email_personal ?? '—'}</p>
        <p style={{ margin: '0.25rem 0' }}>Teléfono: {employee.phone ?? '—'}</p>
        <p style={{ margin: '0.25rem 0' }}>Departamento: {employee.department_name ?? '—'}</p>
        <p style={{ margin: '0.25rem 0' }}>Manager: {employee.manager_name ?? '—'}</p>
        <p style={{ margin: '0.25rem 0' }}>Ubicación: {employee.location ?? '—'}</p>
      </div>

      <div style={{ fontSize: 13 }}>
        <p style={{ margin: '0.25rem 0' }}>Fecha de baja: {formatDate(employee.end_date)}</p>
        <p style={{ margin: '0.25rem 0' }}>Tipo de empleo: {employee.employment_type ? EMPLOYMENT_LABELS[employee.employment_type] : '—'}</p>
        <p style={{ margin: '0.25rem 0' }}>
          Salario: {employee.salary_amount ? `${employee.salary_amount} ${employee.salary_currency ?? ''} (${employee.salary_period ?? '—'})` : '—'}
        </p>
      </div>
    </div>
  );
}

type HistorySectionProps = {
  detail: EmployeeDetail;
  historyForm: {
    started_at: string;
    ended_at: string;
    job_title: string;
    department_id: string;
    manager_id: string;
    employment_type: '' | EmploymentType;
    salary_amount: string;
    salary_currency: string;
    salary_period: string;
    note: string;
  };
  setHistoryForm: Dispatch<SetStateAction<HistorySectionProps['historyForm']>>;
  onSubmit: () => Promise<void>;
  saving: boolean;
  error: string | null;
  canManage: boolean;
  departments: Department[];
};

function HistorySection({ detail, historyForm, setHistoryForm, onSubmit, saving, error, canManage, departments }: HistorySectionProps) {
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        {detail.history.length === 0 ? (
          <p style={{ fontSize: 13 }}>Sin movimientos registrados.</p>
        ) : (
          <ul style={{ listStyle: 'disc', paddingLeft: '1.25rem', margin: 0, fontSize: 13 }}>
            {detail.history.map((entry) => (
              <li key={entry.history_id} style={{ marginBottom: '0.5rem' }}>
                <div>
                  <strong>{entry.job_title ?? 'Sin título'}</strong>{' '}
                  <span>
                    {formatDate(entry.started_at)}
                    {entry.ended_at ? ` - ${formatDate(entry.ended_at)}` : ''}
                  </span>
                </div>
                <div>Departamento: {entry.department_id ?? '—'}</div>
                {entry.note && <div style={{ color: '#555' }}>{entry.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          style={{ display: 'grid', gap: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}
        >
          <h4 style={{ margin: 0 }}>Registrar movimiento</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Desde*
              <input
                type="date"
                value={historyForm.started_at}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, started_at: event.target.value }))}
                required
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Hasta
              <input
                type="date"
                value={historyForm.ended_at}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, ended_at: event.target.value }))}
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Cargo
            <input
              type="text"
              value={historyForm.job_title}
              onChange={(event) => setHistoryForm((prev) => ({ ...prev, job_title: event.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Departamento
            <select
              value={historyForm.department_id}
              onChange={(event) => setHistoryForm((prev) => ({ ...prev, department_id: event.target.value }))}
            >
              <option value="">(sin cambio)</option>
              {departments.map((dept) => (
                <option key={dept.department_id} value={dept.department_id}>
                  {dept.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Manager (ID)
            <input
              type="text"
              value={historyForm.manager_id}
              onChange={(event) => setHistoryForm((prev) => ({ ...prev, manager_id: event.target.value }))}
              placeholder="UUID del manager"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Tipo de empleo
            <select
              value={historyForm.employment_type}
              onChange={(event) =>
                setHistoryForm((prev) => ({
                  ...prev,
                  employment_type: event.target.value as '' | EmploymentType,
                }))
              }
            >
              <option value="">(sin cambio)</option>
              {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((value) => (
                <option key={value} value={value}>
                  {EMPLOYMENT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Salario
              <input
                type="number"
                step="0.01"
                value={historyForm.salary_amount}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, salary_amount: event.target.value }))}
              />
            </label>
            <label style={{ width: 80, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Moneda
              <input
                type="text"
                maxLength={3}
                value={historyForm.salary_currency}
                onChange={(event) =>
                  setHistoryForm((prev) => ({ ...prev, salary_currency: event.target.value.toUpperCase() }))
                }
              />
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Periodicidad
              <input
                type="text"
                value={historyForm.salary_period}
                onChange={(event) => setHistoryForm((prev) => ({ ...prev, salary_period: event.target.value }))}
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Nota interna
            <textarea
              rows={3}
              value={historyForm.note}
              onChange={(event) => setHistoryForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </label>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Registrar movimiento'}
          </button>
        </form>
      )}
    </div>
  );
}

type NotesSectionProps = {
  notes: EmployeeNote[];
  loading: boolean;
  error: string | null;
  formError: string | null;
  newContent: string;
  setNewContent: (value: string) => void;
  newCategory: string;
  setNewCategory: (value: string) => void;
  editingId: string | null;
  editingContent: string;
  setEditingContent: (value: string) => void;
  editingCategory: string;
  setEditingCategory: (value: string) => void;
  onEdit: (note: EmployeeNote) => void;
  onCancelEdit: () => void;
  onDelete: (noteId: string) => Promise<void>;
  onSubmit: () => Promise<void>;
  saving: boolean;
  canManage: boolean;
};

function NotesSection({
  notes,
  loading,
  error,
  formError,
  newContent,
  setNewContent,
  newCategory,
  setNewCategory,
  editingId,
  editingContent,
  setEditingContent,
  editingCategory,
  setEditingCategory,
  onEdit,
  onCancelEdit,
  onDelete,
  onSubmit,
  saving,
  canManage,
}: NotesSectionProps) {
  const contentValue = editingId ? editingContent : newContent;
  const categoryValue = editingId ? editingCategory : newCategory;

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {loading ? (
        <p>Cargando notas...</p>
      ) : error ? (
        <p style={{ color: 'crimson' }}>{error}</p>
      ) : notes.length === 0 ? (
        <p>No hay notas registradas.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.5rem', margin: 0 }}>
          {notes.map((note) => (
            <li key={note.note_id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#555' }}>
                  {formatDate(note.created_at)} · {note.categoria ?? 'General'}
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => onEdit(note)}>
                      Editar
                    </button>
                    <button type="button" onClick={() => void onDelete(note.note_id)}>
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
              <p style={{ margin: '0.5rem 0 0 0', whiteSpace: 'pre-wrap' }}>{note.contenido}</p>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          style={{ display: 'grid', gap: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}
        >
          <h4 style={{ margin: 0 }}>{editingId ? 'Editar nota' : 'Nueva nota'}</h4>
          <textarea
            rows={4}
            value={contentValue}
            onChange={(event) => (editingId ? setEditingContent(event.target.value) : setNewContent(event.target.value))}
            placeholder="Escribe tu comentario"
          />
          <input
            type="text"
            value={categoryValue}
            onChange={(event) =>
              editingId ? setEditingCategory(event.target.value) : setNewCategory(event.target.value)
            }
            placeholder="Categoría (opcional)"
          />
          {formError && <p style={{ color: 'crimson' }}>{formError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            {editingId && (
              <button type="button" onClick={onCancelEdit} disabled={saving}>
                Cancelar edición
              </button>
            )}
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Actualizar nota' : 'Agregar nota'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

type AttachmentsSectionProps = {
  attachments: EmployeeAttachment[];
  loading: boolean;
  error: string | null;
  form: { filename: string; storage_path: string; mime_type: string; size_bytes: string };
  setForm: (value: { filename: string; storage_path: string; mime_type: string; size_bytes: string }) => void;
  formError: string | null;
  onSubmit: () => Promise<void>;
  saving: boolean;
  onDelete: (attachmentId: string) => Promise<void>;
  canManage: boolean;
};

function AttachmentsSection({
  attachments,
  loading,
  error,
  form,
  setForm,
  formError,
  onSubmit,
  saving,
  onDelete,
  canManage,
}: AttachmentsSectionProps) {
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {loading ? (
        <p>Cargando adjuntos...</p>
      ) : error ? (
        <p style={{ color: 'crimson' }}>{error}</p>
      ) : attachments.length === 0 ? (
        <p>No hay documentos cargados.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
          {attachments.map((file) => (
            <li key={file.attachment_id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{file.filename}</strong>
                  <div style={{ fontSize: 12, color: '#555' }}>{file.mime_type ?? 'Formato no especificado'}</div>
                  <div style={{ fontSize: 12, color: '#555' }}>{file.storage_path}</div>
                </div>
                {canManage && (
                  <button type="button" onClick={() => void onDelete(file.attachment_id)}>
                    Eliminar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          style={{ display: 'grid', gap: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}
        >
          <h4 style={{ margin: 0 }}>Registrar documento</h4>
          <input
            type="text"
            value={form.filename}
            onChange={(event) => setForm({ ...form, filename: event.target.value })}
            placeholder="Nombre archivo"
          />
          <input
            type="text"
            value={form.storage_path}
            onChange={(event) => setForm({ ...form, storage_path: event.target.value })}
            placeholder="Ruta o URL"
          />
          <input
            type="text"
            value={form.mime_type}
            onChange={(event) => setForm({ ...form, mime_type: event.target.value })}
            placeholder="Mime type (opcional)"
          />
          <input
            type="number"
            value={form.size_bytes}
            onChange={(event) => setForm({ ...form, size_bytes: event.target.value })}
            placeholder="Tamaño en bytes (opcional)"
          />
          {formError && <p style={{ color: 'crimson' }}>{formError}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Agregar documento'}
          </button>
        </form>
      )}
    </div>
  );
}

function canCreateEmployee(user: ReturnType<typeof useAuth>['user']) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return user.rol === 'admin' || user.rol === 'hr_admin';
}
