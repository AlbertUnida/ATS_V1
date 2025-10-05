import { FormEvent, useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, loading, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Login error', err);
      setError('Credenciales inválidas');
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '4rem auto', padding: '2rem', border: '1px solid #ddd', borderRadius: 8 }}>
      <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Iniciar sesión</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p style={{ color: 'crimson', fontSize: 14 }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
      <div style={{ marginTop: '1rem', fontSize: 12, color: '#666' }}>
        <p>Usuarios demo: superadmin@talentflow.app / ana.gonzalez@pyme-demo.com</p>
        <p>Clave: TalentFlow2025!</p>
      </div>
      <div style={{ marginTop: '1rem', fontSize: 12 }}>
        <p>
          ¿Buscas oportunidades laborales?{' '}
          <Link to="/portal/vacantes">Explora las vacantes públicas</Link>.
        </p>
      </div>
    </div>
  );
}
