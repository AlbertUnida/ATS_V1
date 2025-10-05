import { FormEvent, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  getInvitationDetails,
  inviteUser,
  listUsers,
  listCompanies,
  listInvitationHistory,
  updateUser,
  type InvitationDetails,
  type PlatformUser,
  type UserRole,
  type CompanySummary,
  type EmailDeliveryResult,
  type InvitationEvent,
} from '../api';
import { useAuth } from '../context/AuthContext';

const ROLE_OPTIONS: UserRole[] = ['admin', 'hr_admin', 'recruiter', 'hiring_manager', 'interviewer'];
const DEFAULT_EXPIRATION_HOURS = 72;
const PAGE_SIZE = 8;
const HISTORY_PAGE_SIZE = 10;

type RoleFilter = 'todos' | UserRole;
type StatusFilter = 'todos' | 'pendiente' | 'aceptado';
type ActiveFilter = 'todos' | 'activos' | 'inactivos';
type DeliveryFilter = 'todos' | 'enviado' | 'error' | 'pendiente';
type ReusedFilter = 'todos' | 'si' | 'no';

function formatDate(value: string | null, formatter: Intl.DateTimeFormat) {
  if (!value) return '-';
  return formatter.format(new Date(value));
}

function resolveStatus(user: PlatformUser, now = Date.now()): 'Activo' | 'Pendiente' | 'Expirada' {
  if (user.invitacion_aceptada) return 'Activo';
  if (user.invitation_expires_at) {
    const expiresAt = new Date(user.invitation_expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < now) {
      return 'Expirada';
    }
  }
  return 'Pendiente';
}

type LastInvitation = {
  email: string;
  token: string;
  expires_at: string;
  accept_url?: string;
  reused_existing: boolean;
  email_delivery?: EmailDeliveryResult;
  company?: { company_id: string; nombre: string } | null;
};

type InvitationInfo = InvitationDetails & { token: string };

type FormState = {
  email: string;
  nombre: string;
  rol: UserRole;
  expiresInHours: string;
};

const initialForm: FormState = {
  email: '',
  nombre: '',
  rol: 'recruiter',
  expiresInHours: String(DEFAULT_EXPIRATION_HOURS),
};

export default function UserInvitationManager() {
  const { user } = useAuth();
  const canInvite = Boolean(user?.is_super_admin || user?.rol === 'admin' || user?.rol === 'hr_admin');

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [lastInvitation, setLastInvitation] = useState<LastInvitation | null>(null);
  const [invitationPreview, setInvitationPreview] = useState<InvitationInfo | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [linkFeedback, setLinkFeedback] = useState<string | null>(null);
  const [emailDeliveryMessage, setEmailDeliveryMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companySearchInput, setCompanySearchInput] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [companiesVersion, setCompaniesVersion] = useState(0);

  const [historyUser, setHistoryUser] = useState<PlatformUser | null>(null);
  const [historyItems, setHistoryItems] = useState<InvitationEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyDeliveryFilter, setHistoryDeliveryFilter] = useState<DeliveryFilter>('todos');
  const [historyReusedFilter, setHistoryReusedFilter] = useState<ReusedFilter>('todos');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [resendLoadingId, setResendLoadingId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("todos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("todos");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    [],
  );

  useEffect(() => {
    if (!user?.is_super_admin) {
      setCompanySearchInput('');
      setCompanyQuery('');
      if (user?.company_id) {
        setSelectedCompanyId(user.company_id);
      }
      return;
    }

    const handler = window.setTimeout(() => {
      setCompanyQuery(companySearchInput.trim());
    }, 350);

    return () => window.clearTimeout(handler);
  }, [companySearchInput, user?.is_super_admin, user?.company_id]);

  const loadCompanies = useCallback(async () => {
    if (!user?.is_super_admin) return;
    setCompaniesLoading(true);
    setCompaniesError(null);
    try {
      const items = await listCompanies({ includeInactive: false, limit: 50, search: companyQuery || undefined });
      setCompanies(items);
      if (items.length > 0) {
        const alreadySelected = items.some((item) => item.company_id === selectedCompanyId);
        if (!alreadySelected) {
          setSelectedCompanyId(items[0].company_id);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar las empresas.';
      setCompaniesError(message);
    } finally {
      setCompaniesLoading(false);
    }
  }, [companyQuery, selectedCompanyId, user?.is_super_admin]);

  useEffect(() => {
    if (user?.is_super_admin) {
      void loadCompanies();
    }
  }, [user?.is_super_admin, loadCompanies, companiesVersion]);

  const loadUsers = useCallback(async () => {
    if (!canInvite) return;
    if (user?.is_super_admin && !selectedCompanyId) {
      setUsers([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params: { includeInvitations?: boolean; companyId?: string } = {};
      if (user?.is_super_admin) {
        params.companyId = selectedCompanyId;
      }
      const items = await listUsers(params);
      setUsers(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron obtener los usuarios';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [canInvite, selectedCompanyId, user?.is_super_admin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers, refreshKey]);

  useEffect(() => {
    if (!historyUser) {
      setHistoryItems([]);
      setHistoryPages(1);
      setHistoryTotal(0);
      setHistoryPage(1);
      return;
    }

    let cancelled = false;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);

      const deliveryParam = historyDeliveryFilter === 'todos' ? undefined : historyDeliveryFilter;
      const reusedParam = historyReusedFilter === 'todos' ? undefined : historyReusedFilter === 'si';

      try {
        const response = await listInvitationHistory(historyUser.user_id, {
          page: historyPage,
          limit: HISTORY_PAGE_SIZE,
          delivery: deliveryParam,
          reused: reusedParam,
        });
        if (cancelled) return;

        if (historyPage > response.pages && response.pages >= 1) {
          setHistoryPage(response.pages);
          return;
        }

        setHistoryItems(response.items);
        setHistoryPages(response.pages);
        setHistoryTotal(response.total);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'No se pudo cargar el historial';
        setHistoryError(message);
        setHistoryItems([]);
        setHistoryPages(1);
        setHistoryTotal(0);
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    void fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [historyUser?.user_id, historyPage, historyDeliveryFilter, historyReusedFilter, historyRefreshKey]);

  useEffect(() => {
    if (!lastInvitation) {
      setInvitationPreview(null);
      return;
    }
    const loadPreview = async () => {
      try {
        const details = await getInvitationDetails(lastInvitation.token);
        setInvitationPreview({ ...details, token: lastInvitation.token });
      } catch (err) {
        console.warn('No se pudo refrescar la invitacion recien creada', err);
      }
    };
    void loadPreview();
  }, [lastInvitation]);

  const handleInputChange = (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedEmail = form.email.trim().toLowerCase();
    const trimmedName = form.nombre.trim();

    if (!trimmedEmail) {
      setError('Debes ingresar un correo electronico.');
      return;
    }

    if (!trimmedName) {
      setError('Debes ingresar el nombre de la persona.');
      return;
    }

    const payload: {
      email: string;
      nombre: string;
      rol: UserRole;
      company_id?: string;
      expires_in_hours?: number;
    } = {
      email: trimmedEmail,
      nombre: trimmedName,
      rol: form.rol,
    };

    if (user?.is_super_admin) {
      const selected = selectedCompanyId === 'todas' ? null : selectedCompanyId;
      if (!selected) {
        setError('Selecciona la empresa destino antes de enviar la invitacion.');
        return;
      }
      payload.company_id = selected;
    }

    if (form.expiresInHours.trim()) {
      const parsed = Number(form.expiresInHours.trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Las horas de expiracion deben ser un numero positivo.');
        return;
      }
      payload.expires_in_hours = parsed;
    }

    setSubmitting(true);
    setError(null);
    setCopyFeedback(null);
    setLinkFeedback(null);
    setEmailDeliveryMessage(null);
    setStatusMessage(null);
    try {
      const response = await inviteUser(payload);
      setLastInvitation({
        email: response.user.email,
        token: response.invitation.token,
        expires_at: response.invitation.expires_at,
        accept_url: response.invitation.accept_url,
        reused_existing: response.reused_existing,
        email_delivery: response.email_delivery,
        company: response.company ?? null,
      });
      if (response.email_delivery) {
        setEmailDeliveryMessage(
          response.email_delivery.success
            ? 'Se envi? el correo de invitaci?n correctamente.'
            : `No se pudo enviar el correo autom?ticamente: ${response.email_delivery.message}`,
        );
      }
      setForm((prev) => ({ ...prev, email: '', nombre: '' }));
      setRefreshKey((prev) => prev + 1);
      setStatusMessage('Invitaci?n generada correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar la invitacion.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (record: PlatformUser) => {
    setResendLoadingId(record.user_id);
    setStatusMessage(null);
    setEmailDeliveryMessage(null);
    try {
      const response = await inviteUser({
        email: record.email,
        nombre: record.nombre,
        rol: record.rol,
        company_id: record.company_id ?? undefined,
        expires_in_hours: Number(form.expiresInHours.trim()) || DEFAULT_EXPIRATION_HOURS,
      });
      setLastInvitation({
        email: response.user.email,
        token: response.invitation.token,
        expires_at: response.invitation.expires_at,
        accept_url: response.invitation.accept_url,
        reused_existing: response.reused_existing,
        email_delivery: response.email_delivery,
        company: response.company ?? null,
      });
      if (response.email_delivery) {
        setEmailDeliveryMessage(
          response.email_delivery.success
            ? 'Se envi? el correo de invitaci?n correctamente.'
            : `No se pudo enviar el correo autom?ticamente: ${response.email_delivery.message}`,
        );
      }
      setRefreshKey((prev) => prev + 1);
      setStatusMessage('Invitaci?n reenviada.');
      if (historyUser && historyUser.user_id === record.user_id) {
        setHistoryUser(response.user);
        setHistoryRefreshKey((prev) => prev + 1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo reenviar la invitacion.';
      setError(message);
    } finally {
      setResendLoadingId(null);
    }
  };

  const acceptLink = useMemo(() => {
    if (!lastInvitation) return null;
    if (lastInvitation.accept_url) return lastInvitation.accept_url;
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/invitations/${lastInvitation.token}`;
    }
    return null;
  }, [lastInvitation]);

  const handleCopyToken = async () => {
    if (!lastInvitation) return;
    try {
      await navigator.clipboard.writeText(lastInvitation.token);
      setCopyFeedback('Token copiado al portapapeles.');
    } catch (err) {
      console.warn('No se pudo copiar el token', err);
      setCopyFeedback('Copia manualmente el token mostrado mas abajo.');
    }
  };

  const handleCopyLink = async () => {
    if (!acceptLink) return;
    try {
      await navigator.clipboard.writeText(acceptLink);
      setLinkFeedback('Enlace copiado.');
    } catch (err) {
      console.warn('No se pudo copiar el enlace', err);
      setLinkFeedback('No se pudo copiar autom?ticamente, copia el texto manualmente.');
    }
  };

  const handleCompanyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedCompanyId(event.target.value);
    setRefreshKey((prev) => prev + 1);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((item) => {
      if (roleFilter !== 'todos' && item.rol !== roleFilter) return false;
      if (activeFilter === 'activos' && !item.activo) return false;
      if (activeFilter === 'inactivos' && item.activo) return false;
      if (statusFilter === 'pendiente' && item.invitacion_aceptada) return false;
      if (statusFilter === 'aceptado' && !item.invitacion_aceptada) return false;
      if (!term) return true;
      const nombre = item.nombre?.toLowerCase() ?? '';
      return item.email.toLowerCase().includes(term) || nombre.includes(term);
    });
  }, [users, roleFilter, activeFilter, statusFilter, searchTerm]);

  const now = Date.now();

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
    setPages(totalPages);
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [filteredUsers.length, page]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, statusFilter, activeFilter, searchTerm, selectedCompanyId]);

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, page]);

  const pendingCountFiltered = useMemo(() => filteredUsers.filter((item) => !item.invitacion_aceptada).length, [filteredUsers]);
  const pendingCountPage = useMemo(() => paginatedUsers.filter((item) => !item.invitacion_aceptada).length, [paginatedUsers]);


  const handleShowHistory = (record: PlatformUser) => {
    setHistoryUser(record);
    setHistoryPage(1);
    setHistoryPages(1);
    setHistoryTotal(0);
    setHistoryDeliveryFilter('todos');
    setHistoryReusedFilter('todos');
    setHistoryRefreshKey((prev) => prev + 1);
  };

  const handleRoleChange = async (record: PlatformUser, newRole: UserRole) => {
    if (record.rol === newRole) return;
    setUpdatingUserId(record.user_id);
    setStatusMessage(null);
    try {
      const response = await updateUser(record.user_id, { rol: newRole });
      setUsers((prev) => prev.map((item) => (item.user_id === record.user_id ? response.user : item)));
      if (historyUser && historyUser.user_id === record.user_id) {
        setHistoryUser(response.user);
        setHistoryRefreshKey((prev) => prev + 1);
      }
      setStatusMessage('Rol actualizado correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el usuario.';
      setError(message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleActiveChange = async (record: PlatformUser, isActive: boolean) => {
    if (record.activo === isActive) return;
    setUpdatingUserId(record.user_id);
    setStatusMessage(null);
    try {
      const response = await updateUser(record.user_id, { activo: isActive });
      setUsers((prev) => prev.map((item) => (item.user_id === record.user_id ? response.user : item)));
      if (historyUser && historyUser.user_id === record.user_id) {
        setHistoryUser(response.user);
        setHistoryRefreshKey((prev) => prev + 1);
      }
      setStatusMessage(isActive ? 'Usuario activado.' : 'Usuario desactivado.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado del usuario.';
      setError(message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (!canInvite) {
    return null;
  }

  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2>Invitaciones de usuarios</h2>
      <p style={{ maxWidth: 640 }}>
        Solo los usuarios con rol <strong>admin</strong> o <strong>hr_admin</strong> (y los super admin de plataforma)
        pueden invitar nuevos miembros. Completa el formulario para enviar o regenerar una invitacion.
      </p>

      {user?.is_super_admin && (
        <div style={{ marginBottom: '1.25rem', display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Buscar empresa
            <input
              type="text"
              placeholder="Nombre o slug"
              value={companySearchInput}
              onChange={(event) => setCompanySearchInput(event.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Empresa a gestionar
            <select
              value={selectedCompanyId}
              onChange={handleCompanyChange}
              disabled={companiesLoading || companies.length === 0}
            >
              <option value="">
                {companiesLoading ? 'Cargando...' : 'Selecciona una empresa'}
              </option>
              {companies.map((company) => (
                <option key={company.company_id} value={company.company_id}>
                  {company.nombre} ({company.slug})
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="button" onClick={() => setCompaniesVersion((prev) => prev + 1)} disabled={companiesLoading}>
              {companiesLoading ? 'Actualizando...' : 'Refrescar listado'}
            </button>
            {companiesError && <span style={{ color: 'crimson', fontSize: 12 }}>{companiesError}</span>}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 520, marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Correo electronico
          <input
            type="email"
            value={form.email}
            onChange={handleInputChange('email')}
            required
            placeholder="persona@empresa.com"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Nombre completo
          <input
            type="text"
            value={form.nombre}
            onChange={handleInputChange('nombre')}
            required
            placeholder="Nombre y Apellido"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Rol
          <select value={form.rol} onChange={handleInputChange('rol')}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Expira en (horas)
          <input
            type="number"
            min={1}
            value={form.expiresInHours}
            onChange={handleInputChange('expiresInHours')}
          />
        </label>

        <button type="submit" disabled={submitting || (user?.is_super_admin && !selectedCompanyId)}>
          {submitting ? 'Enviando...' : 'Enviar invitacion'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson', marginBottom: '1rem' }}>{error}</p>}
      {statusMessage && <p style={{ color: '#2f855a', marginBottom: '1rem' }}>{statusMessage}</p>}

      {lastInvitation && (
        <div style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 8, maxWidth: 560, marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Invitacion generada</h3>
          <p>
            Se genero una invitacion para <strong>{lastInvitation.email}</strong>.{' '}
            {lastInvitation.reused_existing ? 'Se reutilizo una invitacion pendiente.' : 'Se creo un token nuevo.'}
          </p>
          {lastInvitation.company && <p style={{ marginTop: 0 }}>Empresa: {lastInvitation.company.nombre}</p>}
          <p>
            Token: <code style={{ wordBreak: 'break-all' }}>{lastInvitation.token}</code>
          </p>
          <p>Expira: {formatDate(lastInvitation.expires_at, dateFormatter)}</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={handleCopyToken}>
              Copiar token
            </button>
            {copyFeedback && <span style={{ fontSize: 12 }}>{copyFeedback}</span>}
          </div>
          {acceptLink && (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ marginBottom: 4 }}>Enlace para activar:</p>
              <code style={{ wordBreak: 'break-all', display: 'block' }}>{acceptLink}</code>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <button type="button" onClick={handleCopyLink}>
                  Copiar enlace
                </button>
                {linkFeedback && <span style={{ fontSize: 12 }}>{linkFeedback}</span>}
              </div>
            </div>
          )}
          {emailDeliveryMessage && <p style={{ fontSize: 12, marginTop: 8 }}>{emailDeliveryMessage}</p>}
          {invitationPreview && (
            <p style={{ fontSize: 12, marginTop: '0.75rem', color: '#555' }}>
              Confirmacion: {invitationPreview.email} ? empresa {invitationPreview.company_id ?? 'sin definir'}.
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Buscar
          <input type="text" value={searchTerm} onChange={handleSearchChange} placeholder="nombre o correo" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Rol
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
            <option value="todos">(todos)</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Estado invitaci?n
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="todos">(todos)</option>
            <option value="pendiente">Pendientes</option>
            <option value="aceptado">Aceptados</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Activos
          <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}>
            <option value="todos">(todos)</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </label>
        <span>Total filtrados: {filteredUsers.length}</span>
        <span>Pendientes filtrados: {pendingCountFiltered}</span>
        <button type="button" onClick={() => setRefreshKey((prev) => prev + 1)} disabled={loading}>
          {loading ? 'Actualizando...' : 'Recargar'}
        </button>
      </div>

      {loading ? (
        <p>Cargando usuarios...</p>
      ) : filteredUsers.length === 0 ? (
        <p>No hay usuarios que coincidan con el filtro seleccionado.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 840 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Correo</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Nombre</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Rol</th>
                <th style={{ textAlign: 'center', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Activo</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Estado</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Enviada</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Expira</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((item) => {
                const status = resolveStatus(item, now);
                const disableEdits = updatingUserId === item.user_id || item.is_super_admin;
                const disableResend = item.invitacion_aceptada || resendLoadingId === item.user_id;
                return (
                  <tr key={item.user_id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>{item.email}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>{item.nombre}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>
                      <select
                        value={item.rol}
                        onChange={(event) => handleRoleChange(item, event.target.value as UserRole)}
                        disabled={disableEdits}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={item.activo}
                        onChange={(event) => handleActiveChange(item, event.target.checked)}
                        disabled={disableEdits}
                      />
                    </td>
                    <td
                      style={{
                        borderBottom: '1px solid #eee',
                        padding: '0.5rem',
                        color: status === 'Activo' ? 'green' : status === 'Expirada' ? 'crimson' : '#bb7a00',
                      }}
                    >
                      {status}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>
                      {formatDate(item.invitation_sent_at, dateFormatter)}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>
                      {formatDate(item.invitation_expires_at, dateFormatter)}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => handleResend(item)} disabled={disableResend}>
                        {resendLoadingId === item.user_id ? 'Enviando...' : 'Reenviar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShowHistory(item)}
                      >
                        Ver historial
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: '1rem' }}>
        <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
          Anterior
        </button>
        <span>
          P?gina {page} de {pages} ? Pendientes en p?gina: {pendingCountPage}
        </span>
        <button type="button" onClick={() => setPage((prev) => Math.min(pages, prev + 1))} disabled={page >= pages}>
          Siguiente
        </button>
      </div>

      {historyUser && (
        <div style={{ marginTop: '1.5rem', border: '1px solid #ddd', borderRadius: 8, padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Historial de invitaciones ? {historyUser.email}</h3>
            <button
              type="button"
              onClick={() => {
                setHistoryUser(null);
                setHistoryItems([]);
                setHistoryPages(1);
                setHistoryPage(1);
                setHistoryTotal(0);
              }}
            >
              Cerrar
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: '0.75rem' }}>
            <label>
              Entrega
              <select
                value={historyDeliveryFilter}
                onChange={(event) => {
                  setHistoryDeliveryFilter(event.target.value as DeliveryFilter);
                  setHistoryPage(1);
                }}
              >
                <option value="todos">(todas)</option>
                <option value="enviado">Enviadas</option>
                <option value="error">Errores</option>
                <option value="pendiente">Sin enviar</option>
              </select>
            </label>
            <label>
              Reutilizadas
              <select
                value={historyReusedFilter}
                onChange={(event) => {
                  setHistoryReusedFilter(event.target.value as ReusedFilter);
                  setHistoryPage(1);
                }}
              >
                <option value="todos">(todas)</option>
                <option value="si">Reutilizadas</option>
                <option value="no">Nuevas</option>
              </select>
            </label>
          </div>
          {historyLoading ? (
            <p>Cargando historial...</p>
          ) : historyError ? (
            <p style={{ color: 'crimson' }}>{historyError}</p>
          ) : historyItems.length === 0 ? (
            <p>No hay eventos registrados.</p>
          ) : (
            <>
              <p style={{ marginTop: '0.75rem' }}>Total de eventos: {historyTotal}</p>
              <table style={{ marginTop: '0.75rem', borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Enviado</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Expira</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Reutilizado</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Estado correo</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Generado por</th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((event) => (
                    <tr key={event.event_id}>
                      <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>{formatDate(event.sent_at, dateFormatter)}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>{formatDate(event.expires_at, dateFormatter)}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>{event.reused_existing ? 'S?' : 'No'}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>
                        {event.email_delivery_attempted
                          ? event.email_delivery_success
                            ? 'Enviado'
                            : `Error: ${event.email_delivery_message ?? 'desconocido'}`
                          : 'No intentado'}
                      </td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>{event.created_by_nombre ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: '1rem' }}>
                <button type="button" onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))} disabled={historyPage <= 1}>
                  Anterior
                </button>
                <span>
                  P?gina {historyPage} de {historyPages}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryPage((prev) => Math.min(historyPages, prev + 1))}
                  disabled={historyPage >= historyPages}
                >
                  Siguiente
                </button>
              </div>
            </>
          )}
        </div>
      )}

    </section>
  );
}




