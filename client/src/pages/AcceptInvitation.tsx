import { FormEvent, useEffect, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { acceptInvitation, getInvitationDetails, type InvitationDetails } from '../api';

const MIN_PASSWORD_LENGTH = 8;

type UiState = 'loading' | 'ready' | 'accepted' | 'error';

type FormState = {
  password: string;
  confirmPassword: string;
  nombre: string;
};

const initialForm: FormState = {
  password: '',
  confirmPassword: '',
  nombre: '',
};

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<UiState>('loading');
  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token de invitacion no valido.');
      setStatus('error');
      return;
    }
    const load = async () => {
      setStatus('loading');
      setError(null);
      try {
        const info = await getInvitationDetails(token);
        setDetails(info);
        setStatus('ready');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo verificar la invitacion.';
        setError(message);
        setStatus('error');
      }
    };
    void load();
  }, [token]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || submitting) return;

    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contrase?a debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Las contrase?as no coinciden.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await acceptInvitation(token, {
        password: form.password,
        nombre: form.nombre.trim() ? form.nombre.trim() : undefined,
      });
      setStatus('accepted');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo aceptar la invitacion.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1rem' }}>
      {status === 'loading' && <p>Validando invitacion...</p>}

      {status === 'error' && (
        <div>
          <h1>Invitacion no disponible</h1>
          <p style={{ color: 'crimson' }}>{error ?? 'No se pudo validar la invitacion.'}</p>
          <p>
            Si crees que es un error, solicita un nuevo enlace o contacta al administrador de tu empresa.
          </p>
          <Link to="/login">Volver al inicio de sesion</Link>
        </div>
      )}

      {status === 'ready' && details && (
        <div>
          <h1>Activa tu acceso</h1>
          <p>
            Invitacion para <strong>{details.email}</strong>.
            {details.nombre ? ` (${details.nombre})` : ''}
          </p>
          <p>
            {details.company_id
              ? `Esta invitacion pertenece a la empresa con ID ${details.company_id}.`
              : 'Esta invitacion aun no esta asociada a una empresa especifica.'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Nombre completo
              <input
                type="text"
                name="nombre"
                value={form.nombre}
                onChange={handleInputChange}
                placeholder="Actualiza tu nombre (opcional)"
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Contrase?a nueva
              <input
                type="password"
                name="password"
                value={form.password}
                minLength={MIN_PASSWORD_LENGTH}
                onChange={handleInputChange}
                required
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Repite la contrase?a
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                minLength={MIN_PASSWORD_LENGTH}
                onChange={handleInputChange}
                required
              />
            </label>

            {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}

            <button type="submit" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Activar acceso'}
            </button>
          </form>
        </div>
      )}

      {status === 'accepted' && (
        <div>
          <h1>?Listo!</h1>
          <p>Tu cuenta quedo activada. Ya puedes iniciar sesion con tu correo y la contrase?a definida.</p>
          <Link to="/login">Ir al inicio de sesion</Link>
        </div>
      )}
    </div>
  );
}
