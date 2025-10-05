import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createJob,
  listDepartments,
  type Department,
  type EmploymentType,
  type JobStatus,
  type WorkModality,
} from '../api';

type Props = {
  onCreated: () => void;
  departmentsVersion: number;
};

type FormState = {
  titulo: string;
  descripcion: string;
  departamento: string;
  departamento_id: string;
  estado: JobStatus;
  tipo_empleo: EmploymentType;
  modalidad_trabajo: WorkModality | '';
  ubicacion: string;
  rango_salarial_min: string;
  rango_salarial_max: string;
  moneda: string;
  notas_internas: string;
};

const initialState: FormState = {
  titulo: '',
  descripcion: '',
  departamento: '',
  departamento_id: '',
  estado: 'abierto',
  tipo_empleo: 'tiempo_completo',
  modalidad_trabajo: '',
  ubicacion: '',
  rango_salarial_min: '',
  rango_salarial_max: '',
  moneda: '',
  notas_internas: '',
};

const modalityOptions: Array<{ label: string; value: WorkModality }> = [
  { label: 'Presencial', value: 'presencial' },
  { label: 'Remoto', value: 'remoto' },
  { label: 'Híbrido', value: 'hibrido' },
];

export default function JobForm({ onCreated, departmentsVersion }: Props) {
  const [form, setForm] = useState<FormState>(initialState);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [deptError, setDeptError] = useState<string | null>(null);

  const fetchDepartments = useCallback(async () => {
    setDepartmentsLoading(true);
    setDeptError(null);
    try {
      const items = await listDepartments();
      setDepartments(items);
      setForm((prev) => {
        if (items.length === 0) {
          return { ...prev, departamento_id: '', departamento: prev.departamento };
        }
        if (prev.departamento_id && items.some((item) => item.department_id === prev.departamento_id)) {
          return prev;
        }
        const first = items[0];
        return { ...prev, departamento_id: first.department_id, departamento: first.nombre };
      });
    } catch (error) {
      console.error('Error loading departments', error);
      setDeptError('No se pudo cargar la lista de departamentos');
    } finally {
      setDepartmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDepartments();
  }, [fetchDepartments, departmentsVersion]);

  const selectedDepartmentName = useMemo(() => {
    if (!form.departamento_id) return '';
    const match = departments.find((item) => item.department_id === form.departamento_id);
    return match?.nombre ?? '';
  }, [departments, form.departamento_id]);

  const onChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSelectDepartment = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      departamento_id: value,
      departamento: value
        ? departments.find((d) => d.department_id === value)?.nombre ?? prev.departamento
        : prev.departamento,
    }));
  };

  const parseNumber = (input: string) => {
    if (!input.trim()) return undefined;
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const payload: Parameters<typeof createJob>[0] = {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        estado: form.estado,
        tipo_empleo: form.tipo_empleo,
      };

      if (form.departamento.trim()) payload.departamento = form.departamento.trim();
      if (form.departamento_id) payload.departamento_id = form.departamento_id;
      if (form.modalidad_trabajo) payload.modalidad_trabajo = form.modalidad_trabajo;
      if (form.ubicacion.trim()) payload.ubicacion = form.ubicacion.trim();

      const min = parseNumber(form.rango_salarial_min);
      const max = parseNumber(form.rango_salarial_max);
      if (min !== undefined) payload.rango_salarial_min = min;
      if (max !== undefined) payload.rango_salarial_max = max;
      if (form.moneda.trim()) payload.moneda = form.moneda.trim().toUpperCase();
      if (form.notas_internas.trim()) payload.notas_internas = form.notas_internas.trim();

      await createJob(payload);
      setMessage('Oferta creada con éxito');
      setForm({ ...initialState });
      onCreated();
    } catch (error) {
      console.error('Error creating job', error);
      setMessage('No se pudo crear la oferta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
      <h2>Crear oferta</h2>
      <input name="titulo" placeholder="Título" value={form.titulo} onChange={onChange} required />
      <textarea
        name="descripcion"
        placeholder="Descripción"
        value={form.descripcion}
        onChange={onChange}
        required
        rows={4}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 220px' }}>
          Departamento existente
          <select
            name="departamento_id"
            value={form.departamento_id}
            onChange={onSelectDepartment}
            disabled={departmentsLoading || !!deptError}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          >
            <option value="">(sin seleccionar)</option>
            {departments.map((dept) => (
              <option key={dept.department_id} value={dept.department_id}>
                {dept.nombre}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: '1 1 220px' }}>
          Departamento (texto libre)
          <input
            name="departamento"
            placeholder="Ej. Ingeniería"
            value={form.departamento}
            onChange={onChange}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          />
        </label>
      </div>
      {departmentsLoading && <small style={{ color: '#555' }}>Cargando departamentos...</small>}
      {!departmentsLoading && departments.length === 0 && (
        <small style={{ color: 'crimson' }}>Crea un departamento para asociarlo a la oferta.</small>
      )}
      {selectedDepartmentName && departments.length > 0 && (
        <small style={{ color: '#555' }}>
          Seleccionado: {selectedDepartmentName}. Puedes sobrescribir el nombre visible en el campo libre.
        </small>
      )}
      {deptError && <small style={{ color: 'crimson' }}>{deptError}</small>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>
          Estado
          <select name="estado" value={form.estado} onChange={onChange} style={{ display: 'block', marginTop: 4 }}>
            <option value="abierto">abierto</option>
            <option value="pausado">pausado</option>
            <option value="cerrado">cerrado</option>
          </select>
        </label>

        <label>
          Tipo empleo
          <select name="tipo_empleo" value={form.tipo_empleo} onChange={onChange} style={{ display: 'block', marginTop: 4 }}>
            <option value="tiempo_completo">tiempo_completo</option>
            <option value="medio_tiempo">medio_tiempo</option>
            <option value="contrato">contrato</option>
            <option value="practicas">practicas</option>
            <option value="temporal">temporal</option>
          </select>
        </label>

        <label>
          Modalidad
          <select
            name="modalidad_trabajo"
            value={form.modalidad_trabajo}
            onChange={onChange}
            style={{ display: 'block', marginTop: 4 }}
          >
            <option value="">(sin especificar)</option>
            {modalityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        name="ubicacion"
        placeholder="Ubicación (ciudad, país)"
        value={form.ubicacion}
        onChange={onChange}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>
          Salario mínimo
          <input
            name="rango_salarial_min"
            type="number"
            min={0}
            value={form.rango_salarial_min}
            onChange={onChange}
            style={{ display: 'block', marginTop: 4 }}
          />
        </label>
        <label>
          Salario máximo
          <input
            name="rango_salarial_max"
            type="number"
            min={0}
            value={form.rango_salarial_max}
            onChange={onChange}
            style={{ display: 'block', marginTop: 4 }}
          />
        </label>
        <label>
          Moneda (ISO)
          <input
            name="moneda"
            maxLength={3}
            placeholder="Ej. PEN"
            value={form.moneda}
            onChange={onChange}
            style={{ textTransform: 'uppercase', display: 'block', marginTop: 4 }}
          />
        </label>
      </div>

      <textarea
        name="notas_internas"
        placeholder="Notas internas"
        value={form.notas_internas}
        onChange={onChange}
        rows={3}
      />

      <button disabled={loading || departments.length === 0}>
        {loading ? 'Guardando...' : 'Crear oferta'}
      </button>
      {message && <small>{message}</small>}
    </form>
  );
}

