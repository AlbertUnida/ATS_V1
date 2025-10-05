import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listJobs, type Job } from '../api';

type Props = {
  reloadKey: number;
};

function formatSalary(job: Job) {
  const hasMin = job.rango_salarial_min !== null;
  const hasMax = job.rango_salarial_max !== null;
  if (!hasMin && !hasMax) return '-';
  if (hasMin && hasMax) {
    return `${job.rango_salarial_min} - ${job.rango_salarial_max} ${job.moneda ?? ''}`.trim();
  }
  if (hasMin) return `Desde ${job.rango_salarial_min} ${job.moneda ?? ''}`.trim();
  return `Hasta ${job.rango_salarial_max} ${job.moneda ?? ''}`.trim();
}

export default function JobList({ reloadKey }: Props) {
  const [items, setItems] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await listJobs({ limit: 20, page: 1 });
      setItems(items);
    } catch (err) {
      console.error('Error loading jobs', err);
      setError('No se pudieron cargar las ofertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData, reloadKey]);

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Ofertas</h2>
      {loading && <p>Cargando...</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!loading && !error && items.length === 0 && <p>No hay ofertas aun.</p>}
      {items.length > 0 && (
        <table
          border={1}
          cellPadding={6}
          style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 1100 }}
        >
          <thead>
            <tr>
              <th>Titulo</th>
              <th>Departamento</th>
              <th>Modalidad</th>
              <th>Ubicacion</th>
              <th>Salario</th>
              <th>Estado</th>
              <th>Tipo</th>
              <th>Registrado</th>
              <th>Postulaciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.job_id}>
                <td>{job.titulo}</td>
                <td>{job.departamento ?? '-'}</td>
                <td>{job.modalidad_trabajo ?? '-'}</td>
                <td>{job.ubicacion ?? '-'}</td>
                <td>{formatSalary(job)}</td>
                <td>{job.estado}</td>
                <td>{job.tipo_empleo}</td>
                <td>{new Date(job.fecha_registro).toLocaleString()}</td>
                <td>
                  <Link to={`/jobs/${job.job_id}/apps`}>Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
