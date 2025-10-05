import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  applicationStatuses,
  listApplications,
  updateApplicationStatus,
  type ApplicationRow,
  type ApplicationStatus,
} from '../api';

type UiState = 'idle' | 'loading' | 'error';

const ALL = '(todos)' as const;
type FilterState = typeof ALL | ApplicationStatus;

function formatSalary(row: ApplicationRow) {
  if (!row.salario_expectativa) return '-';
  return `${row.salario_expectativa} ${row.moneda ?? ''}`.trim();
}

export default function JobApplications() {
  const { jobId } = useParams();
  const [ui, setUi] = useState<UiState>('loading');
  const [items, setItems] = useState<ApplicationRow[]>([]);
  const [filter, setFilter] = useState<FilterState>(ALL);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!jobId) return;
    setUi('loading');
    try {
      const rows = await listApplications(jobId);
      setItems(rows);
      setUi('idle');
    } catch (error) {
      console.error('Error loading applications', error);
      setUi('error');
    }
  }, [jobId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (filter === ALL) return items;
    return items.filter((row) => row.estado === filter);
  }, [items, filter]);

  const onChangeState = async (id: string, nextState: ApplicationStatus) => {
    if (!jobId) return;
    const previousItems = items;
    setSavingId(id);
    setItems((current) =>
      current.map((row) =>
        row.application_id === id
          ? { ...row, estado: nextState, updated_at: new Date().toISOString() }
          : row,
      ),
    );
    try {
      await updateApplicationStatus(id, nextState);
    } catch (error) {
      console.error('Error updating application status', error);
      setItems(previousItems);
      alert('No se pudo actualizar el estado. Revisa la consola para mas detalles.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem' }}>
      <Link to=".." relative="path">{'<- Volver'}</Link>
      <h1 style={{ marginTop: 24 }}>Postulaciones</h1>

      <div style={{ margin: '1rem 0' }}>
        <label>
          Filtrar por estado:&nbsp;
          <select value={filter} onChange={(event) => setFilter(event.target.value as FilterState)}>
            <option value={ALL}>(todos)</option>
            {applicationStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button
          style={{ marginLeft: 12 }}
          onClick={fetchData}
          disabled={ui === 'loading'}
          title="Refrescar"
        >
          Actualizar
        </button>
      </div>

      {ui === 'loading' && <p>Cargando...</p>}
      {ui === 'error' && <p style={{ color: 'crimson' }}>Error cargando postulaciones.</p>}
      {ui === 'idle' && filtered.length === 0 && <p>No hay postulaciones.</p>}

      {ui === 'idle' && filtered.length > 0 && (
        <table
          border={1}
          cellPadding={6}
          style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 1100 }}
        >
          <thead>
            <tr>
              <th>Estado</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Telefono</th>
              <th>Ciudad</th>
              <th>Fuente</th>
              <th>Salario esperado</th>
              <th>CV</th>
              <th>LinkedIn</th>
              <th>Aplicado</th>
              <th>Cambiar estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.application_id}>
                <td>{row.estado}</td>
                <td>{row.nombre_completo}</td>
                <td>{row.email}</td>
                <td>{row.telefono ?? '-'}</td>
                <td>
                  {row.ciudad || row.pais ? [row.ciudad, row.pais].filter(Boolean).join(', ') : '-'}
                </td>
                <td>
                  {row.source ? (
                    <span title={row.source_details ?? undefined}>{row.source}</span>
                  ) : (
                    row.fuente ?? '-'
                  )}
                </td>
                <td>{formatSalary(row)}</td>
                <td>
                  {row.resumen_url ? (
                    <a href={row.resumen_url} target="_blank" rel="noreferrer">
                      Ver CV
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  {row.linkedin_url ? (
                    <a href={row.linkedin_url} target="_blank" rel="noreferrer">
                      Perfil
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
                <td>{new Date(row.applied_at).toLocaleString()}</td>
                <td>
                  <select
                    value={row.estado}
                    onChange={(event) => onChangeState(row.application_id, event.target.value as ApplicationStatus)}
                    disabled={savingId === row.application_id}
                  >
                    {applicationStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  {savingId === row.application_id && (
                    <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>guardando...</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
