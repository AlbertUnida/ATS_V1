import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPublicApplicationsReport,
  fetchPublicApplicationsConversion,
  fetchPublicApplicationsResponseTime,
  fetchPublicApplicationsSources,
  fetchInvitationReport,
  fetchDemoStatus,
  type PublicApplicationsReport,
  type PublicApplicationsConversion,
  type PublicApplicationsResponseTime,
  type PublicApplicationsSources,
  type InvitationReport,
  type DemoStatus,
} from '../api';

type DateFilters = {
  start: string;
  end: string;
};

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toNumber(value?: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(part: number, total: number): string {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function sliceForPreview<T>(items: T[], limit = 10): T[] {
  if (items.length <= limit) return items;
  return items.slice(0, limit);
}

export default function PublicApplicationsReport() {
  const today = useMemo(() => new Date(), []);
  const defaultEnd = useMemo(() => formatDateInput(today), [today]);
  const defaultStart = useMemo(() => {
    const past = new Date(today);
    past.setDate(past.getDate() - 29);
    return formatDateInput(past);
  }, [today]);

  const [filters, setFilters] = useState<DateFilters>({ start: defaultStart, end: defaultEnd });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [publicReport, setPublicReport] = useState<PublicApplicationsReport | null>(null);
  const [conversion, setConversion] = useState<PublicApplicationsConversion | null>(null);
  const [responseTime, setResponseTime] = useState<PublicApplicationsResponseTime | null>(null);
  const [sources, setSources] = useState<PublicApplicationsSources | null>(null);
  const [invitationReport, setInvitationReport] = useState<InvitationReport | null>(null);
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);
  const decimalFormatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }), []);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }), []);

  const loadData = useCallback(async () => {
    if (filters.start && filters.end && filters.start > filters.end) {
      setError('El rango de fechas no es valido.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(filters.start ? { start: filters.start } : {}),
        ...(filters.end ? { end: filters.end } : {}),
      };

      const [reportData, conversionData, responseData, sourcesData, invitationData, demoData] = await Promise.all([
        fetchPublicApplicationsReport(params),
        fetchPublicApplicationsConversion(params),
        fetchPublicApplicationsResponseTime(params),
        fetchPublicApplicationsSources(params),
        fetchInvitationReport(params),
        fetchDemoStatus(),
      ]);

      setPublicReport(reportData);
      setConversion(conversionData);
      setResponseTime(responseData);
      setSources(sourcesData);
      setInvitationReport(invitationData);
      setDemoStatus(demoData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos obtener las metricas.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadData();
  };

  const handleExportCsv = () => {
    if (!publicReport && !conversionSummary && !responseTime && !sources && !invitationReport) {
      return;
    }
    const rows: string[][] = [];
    const pushRow = (section: string, metric: string, value: string | number | null | undefined) => {
      rows.push([section, metric, value !== null && value !== undefined ? String(value) : '']);
    };
    pushRow('Resumen', 'Total logs', totalPublicLogs);
    publicReport?.totals.forEach((item) => {
      pushRow('Resumen', `Status ${item.status}`, item.total);
    });
    if (conversionSummary) {
      pushRow('Conversion', 'Logs', conversionSummary.total_logs);
      pushRow('Conversion', 'Matching', conversionSummary.matched);
      pushRow('Conversion', 'Entrevistas', conversionSummary.interviews);
      pushRow('Conversion', 'Ofertas', conversionSummary.offers);
      pushRow('Conversion', 'Contratados', conversionSummary.hires);
    }
    conversion?.status.forEach((item) => {
      pushRow('Conversion estados', item.status ?? 'sin_match', item.total);
    });
    if (responseTime) {
      pushRow('Tiempo respuesta', 'Muestras', responseTime.samples);
      pushRow('Tiempo respuesta', 'Promedio horas', responseTime.avg_hours ?? '');
      pushRow('Tiempo respuesta', 'Mediana horas', responseTime.median_hours ?? '');
      pushRow('Tiempo respuesta', 'Percentil 90 horas', responseTime.p90_hours ?? '');
    }
    channelTotals.forEach((item) => {
      pushRow('Canal', `${item.channel} logs`, item.total_logs);
      pushRow('Canal', `${item.channel} matching`, item.matched);
      pushRow('Canal', `${item.channel} entrevistas`, item.interviews);
      pushRow('Canal', `${item.channel} ofertas`, item.offers);
      pushRow('Canal', `${item.channel} contrataciones`, item.hires);
    });
    platformTotals.forEach((item) => {
      pushRow('Plataforma', item.platform, item.total);
    });
    if (invitationReport?.acceptance) {
      pushRow('Invitaciones', 'Usuarios invitados', invitationReport.acceptance.invited_users);
      pushRow('Invitaciones', 'Usuarios activos', invitationReport.acceptance.accepted_users);
      pushRow('Invitaciones', 'Horas promedio aceptacion', invitationReport.acceptance.avg_hours_to_accept ?? '');
    }
    if (rows.length === 0) {
      return;
    }
    const csvLines = [['Seccion', 'Metrica', 'Valor'], ...rows].map((line) => line.map((value) => `"${String(value).replace(/"/g, '"')}"`).join(','));
    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `talentflow-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const handleReset = () => {
    setFilters({ start: defaultStart, end: defaultEnd });
  };

  const totalPublicLogs = useMemo(() => {
    if (!publicReport) return 0;
    return publicReport.totals.reduce((sum, item) => sum + toNumber(item.total), 0);
  }, [publicReport]);

  const conversionSummary = conversion?.summary;
  const matched = conversionSummary ? toNumber(conversionSummary.matched) : 0;
  const interviews = conversionSummary ? toNumber(conversionSummary.interviews) : 0;
  const offers = conversionSummary ? toNumber(conversionSummary.offers) : 0;
  const hires = conversionSummary ? toNumber(conversionSummary.hires) : 0;
  const totalLogs = conversionSummary ? toNumber(conversionSummary.total_logs) : 0;

  const channelTotals = sources?.channels.totals ?? [];
  const platformTotals = sources?.platforms.totals ?? [];
  const demoSeededAt = demoStatus?.executed_at ? new Date(demoStatus.executed_at) : null;

  return (
    <section style={{ marginBottom: '2rem', border: '1px solid #ddd', borderRadius: 12, padding: '1.5rem', backgroundColor: '#fafafa' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Radar de metricas del portal publico</h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 14 }}>
              Desde
              <input
                type="date"
                value={filters.start}
                onChange={(event) => setFilters((prev) => ({ ...prev, start: event.target.value }))}
                style={{ marginLeft: 8 }}
              />
            </label>
            <label style={{ fontSize: 14 }}>
              Hasta
              <input
                type="date"
                value={filters.end}
                onChange={(event) => setFilters((prev) => ({ ...prev, end: event.target.value }))}
                style={{ marginLeft: 8 }}
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Actualizando...' : 'Aplicar'}
            </button>
            <button type="button" onClick={handleReset} disabled={loading}>
              Reiniciar
            </button>
            </form>
            <button type="button" onClick={handleExportCsv} disabled={loading}>
              Descargar CSV
            </button>
          </div>
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          Observa la conversion del portal hacia el pipeline interno, los tiempos de reaccion, los canales con mejor rendimiento y la efectividad de invitaciones.
        </p>
      </header>
      {demoSeededAt && (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            border: '1px solid #e0f2ff',
            backgroundColor: '#f2f9ff',
            color: '#0b5394',
            fontSize: 14,
          }}
        >
          Dataset demo cargado el {dateFormatter.format(demoSeededAt)}. Ejecuta <code>npm run demo:preview</code> para refrescarlo.
        </div>
      )}


      {error && (
        <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid #f5c2c7', backgroundColor: '#f8d7da', borderRadius: 8, color: '#842029' }}>
          {error}
        </div>
      )}

      {loading && !publicReport ? <p>Cargando metricas...</p> : null}

      {!loading && publicReport && (
        <div style={{ display: 'grid', gap: 16 }}>
          <section style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Resumen del portal publico</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ minWidth: 180 }}>
                <p style={{ margin: 0, color: '#777', fontSize: 13 }}>Total registros</p>
                <strong style={{ fontSize: 20 }}>{numberFormatter.format(totalPublicLogs)}</strong>
              </div>
              {publicReport.totals.map((item) => (
                <div key={item.status} style={{ minWidth: 140 }}>
                  <p style={{ margin: 0, color: '#777', fontSize: 13 }}>{item.status}</p>
                  <strong style={{ fontSize: 18 }}>{numberFormatter.format(toNumber(item.total))}</strong>
                </div>
              ))}
            </div>
            {publicReport.items.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ margin: 0, color: '#777', fontSize: 13 }}>Ultimos eventos (max. 12)</p>
                <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Dia</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Estado</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sliceForPreview(publicReport.items, 12).map((item, index) => (
                      <tr key={`${item.day}-${item.status}-${index}`}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>{dateFormatter.format(new Date(item.day))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>{item.status}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(item.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Conversion a pipeline interno</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <MetricCard title="Logs" value={numberFormatter.format(totalLogs)} subtitle="Ingresos desde portal" />
              <MetricCard title="Con matching" value={numberFormatter.format(matched)} subtitle={percentage(matched, totalLogs)} />
              <MetricCard title="Entrevistas" value={numberFormatter.format(interviews)} subtitle={percentage(interviews, totalLogs)} />
              <MetricCard title="Ofertas" value={numberFormatter.format(offers)} subtitle={percentage(offers, totalLogs)} />
              <MetricCard title="Contrataciones" value={numberFormatter.format(hires)} subtitle={percentage(hires, totalLogs)} />
            </div>
            {conversion?.status.length ? (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ margin: 0, color: '#777', fontSize: 13 }}>Estado final de aplicaciones (muestra actual)</p>
                <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Estado</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Total</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Participacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversion.status.map((item) => {
                      const value = toNumber(item.total);
                      return (
                        <tr key={item.status ?? 'sin_match'}>
                          <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>{item.status ?? 'Sin matching'}</td>
                          <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(value)}</td>
                          <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{percentage(value, totalLogs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Tiempo de primera accion</h3>
            {responseTime ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <MetricCard title="Muestras" value={numberFormatter.format(toNumber(responseTime.samples))} subtitle="Postulaciones con movimiento" />
                <MetricCard title="Promedio" value={`${decimalFormatter.format(toNumber(responseTime.avg_hours))} h`} subtitle="Horas hasta primer cambio" />
                <MetricCard title="Mediana" value={`${decimalFormatter.format(toNumber(responseTime.median_hours))} h`} subtitle="P50" />
                <MetricCard title="Percentil 90" value={`${decimalFormatter.format(toNumber(responseTime.p90_hours))} h`} subtitle="Casos mas lentos" />
              </div>
            ) : (
              <p style={{ margin: 0 }}>Sin datos suficientes para calcular tiempos.</p>
            )}
          </section>

          <section style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Origen de trafico y canales</h3>
            {channelTotals.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Canal</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Logs</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Matching</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Entrevistas</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Ofertas</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Contrataciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelTotals.map((channel) => (
                      <tr key={channel.channel}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>{channel.channel}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(channel.total_logs))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(channel.matched))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(channel.interviews))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(channel.offers))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(channel.hires))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ margin: 0 }}>Aun no hay datos de canales.</p>
            )}

            {sources?.channels.breakdown.length ? (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ margin: 0, color: '#777', fontSize: 13 }}>Actividad diaria por canal (max. 12 filas)</p>
                <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Dia</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Canal</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Logs</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Matching</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Entrevistas</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Contrataciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sliceForPreview(sources.channels.breakdown, 12).map((row, index) => (
                      <tr key={`${row.day}-${row.channel}-${index}`}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>{dateFormatter.format(new Date(row.day))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>{row.channel}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(row.total_logs))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(row.matched))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(row.interviews))}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(row.hires))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {platformTotals.length ? (
              <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {platformTotals.map((item) => (
                  <MetricCard key={item.platform} title={`Plataforma ${item.platform}`} value={numberFormatter.format(toNumber(item.total))} subtitle="Logs" />
                ))}
              </div>
            ) : null}
          </section>

          <section style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Invitaciones internas</h3>
            {invitationReport ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  <MetricCard
                    title="Usuarios invitados"
                    value={numberFormatter.format(toNumber(invitationReport.acceptance?.invited_users ?? null))}
                    subtitle="En el rango seleccionado"
                  />
                  <MetricCard
                    title="Usuarios activos"
                    value={numberFormatter.format(toNumber(invitationReport.acceptance?.accepted_users ?? null))}
                    subtitle={percentage(
                      toNumber(invitationReport.acceptance?.accepted_users ?? null),
                      toNumber(invitationReport.acceptance?.invited_users ?? null),
                    )}
                  />
                  <MetricCard
                    title="Horas para activar"
                    value={decimalFormatter.format(toNumber(invitationReport.acceptance?.avg_hours_to_accept ?? null))}
                    subtitle="Promedio"
                  />
                </div>

                {invitationReport.events.length ? (
                  <div style={{ marginTop: '1rem' }}>
                    <p style={{ margin: 0, color: '#777', fontSize: 13 }}>Evolucion de envios (max. 10)</p>
                    <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Dia</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Enviadas</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Reutilizadas</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Entregadas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sliceForPreview(invitationReport.events, 10).map((item, index) => (
                          <tr key={`${item.day}-${index}`}>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>{dateFormatter.format(new Date(item.day))}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(item.sent))}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(item.reused))}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(item.delivered))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {invitationReport.acceptedTimeline.length ? (
                  <div style={{ marginTop: '1rem' }}>
                    <p style={{ margin: 0, color: '#777', fontSize: 13 }}>Activaciones por dia (max. 10)</p>
                    <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Dia</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '0.5rem' }}>Activaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sliceForPreview(invitationReport.acceptedTimeline, 10).map((item, index) => (
                          <tr key={`${item.day}-${index}`}>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>{dateFormatter.format(new Date(item.day))}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{numberFormatter.format(toNumber(item.accepted))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <p style={{ margin: 0 }}>Sin actividad registrada en el rango seleccionado.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

type MetricCardProps = {
  title: string;
  value: string;
  subtitle?: string;
};

function MetricCard({ title, value, subtitle }: MetricCardProps) {
  return (
    <div style={{ flex: '1 1 160px', minWidth: 160, border: '1px solid #ececec', borderRadius: 10, padding: '0.75rem 1rem', backgroundColor: '#fff' }}>
      <p style={{ margin: 0, color: '#777', fontSize: 13 }}>{title}</p>
      <strong style={{ display: 'block', fontSize: 20, margin: '0.25rem 0' }}>{value}</strong>
      {subtitle ? <span style={{ color: '#999', fontSize: 12 }}>{subtitle}</span> : null}
    </div>
  );
}
