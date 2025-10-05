import { FormEvent, useEffect, useState } from 'react';
import {
  createDepartment,
  listDepartments,
  updateDepartment,
  deleteDepartment,
  type Department,
} from '../api';

type Props = {
  onCreated: () => void;
};

type EditState = {
  id: string;
  nombre: string;
  descripcion: string;
};

export default function DepartmentManager({ onCreated }: Props) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [rowLoading, setRowLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '' });
  const [editing, setEditing] = useState<EditState | null>(null);

  const fetchDepartments = async () => {
    setListLoading(true);
    setError(null);
    try {
      const items = await listDepartments();
      setDepartments(items);
    } catch (err) {
      console.error('Error loading departments', err);
      setError('No se pudo cargar la lista de departamentos');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void fetchDepartments();
  }, []);

  const submitNew = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.nombre.trim()) return;
    setCreateLoading(true);
    setError(null);
    try {
      await createDepartment({ nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || undefined });
      setForm({ nombre: '', descripcion: '' });
      await fetchDepartments();
      onCreated();
    } catch (err) {
      console.error('Error creating department', err);
      setError('No se pudo crear el departamento');
    } finally {
      setCreateLoading(false);
    }
  };

  const startEdit = (dept: Department) => {
    setEditing({ id: dept.department_id, nombre: dept.nombre, descripcion: dept.descripcion ?? '' });
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setRowLoading(null);
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setRowLoading(editing.id);
    setError(null);
    try {
      await updateDepartment(editing.id, {
        nombre: editing.nombre.trim(),
        descripcion: editing.descripcion.trim() || undefined,
      });
      await fetchDepartments();
      onCreated();
      setEditing(null);
    } catch (err) {
      console.error('Error updating department', err);
      setError('No se pudo actualizar el departamento');
    } finally {
      setRowLoading(null);
    }
  };

  const removeDepartment = async (id: string) => {
    if (!window.confirm('¿Eliminar este departamento?')) return;
    setRowLoading(id);
    setError(null);
    try {
      await deleteDepartment(id);
      await fetchDepartments();
      onCreated();
      if (editing?.id === id) {
        setEditing(null);
      }
    } catch (err: any) {
      console.error('Error deleting department', err);
      setError('No se pudo eliminar el departamento');
    } finally {
      setRowLoading(null);
    }
  };

  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2>Departamentos</h2>
      <form onSubmit={submitNew} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          style={{ flex: '1 1 220px' }}
          placeholder="Nombre"
          value={form.nombre}
          onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
          required
        />
        <input
          style={{ flex: '2 1 320px' }}
          placeholder="Descripción (opcional)"
          value={form.descripcion}
          onChange={(event) => setForm((prev) => ({ ...prev, descripcion: event.target.value }))}
        />
        <button type="submit" disabled={createLoading}>
          {createLoading ? 'Agregando...' : 'Agregar'}
        </button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {listLoading && <p>Cargando departamentos...</p>}
      {!listLoading && departments.length === 0 && <p>No hay departamentos aún.</p>}
      {departments.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {departments.map((dept) => {
            const isEditing = editing?.id === dept.department_id;
            return (
              <li
                key={dept.department_id}
                style={{
                  border: '1px solid #eee',
                  padding: '10px 12px',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {isEditing ? (
                  <form onSubmit={submitEdit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={editing.nombre}
                      onChange={(event) => setEditing((prev) => prev && { ...prev, nombre: event.target.value })}
                      required
                    />
                    <input
                      value={editing.descripcion}
                      onChange={(event) => setEditing((prev) => prev && { ...prev, descripcion: event.target.value })}
                      placeholder="Descripción"
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" disabled={rowLoading === dept.department_id}>
                        {rowLoading === dept.department_id ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button type="button" onClick={cancelEdit} disabled={rowLoading === dept.department_id}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{dept.nombre}</strong>
                      {dept.descripcion && <span style={{ marginLeft: 8, color: '#666' }}>{dept.descripcion}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => startEdit(dept)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDepartment(dept.department_id)}
                        disabled={rowLoading === dept.department_id}
                      >
                        {rowLoading === dept.department_id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
