import { useMemo, useState } from 'react';
import { Routes, Route, Navigate, Outlet, useOutletContext } from 'react-router-dom';
import JobList from './components/JobList';
import JobForm from './components/JobForm';
import JobApplications from './components/JobApplications';
import LoginPage from './pages/Login';
import { useAuth } from './context/AuthContext';
import DepartmentManager from './components/DepartmentManager';
import UserInvitationManager from './components/UserInvitationManager';
import AcceptInvitationPage from './pages/AcceptInvitation';
import EmployeeDirectory from './components/EmployeeDirectory';
import PublicJobsPage from './pages/PublicJobs';

type DashboardContext = {
  reloadKey: number;
  handleJobCreated: () => void;
  departmentsVersion: number;
  handleDepartmentCreated: () => void;
};

function ProtectedLayout() {
  const { user, logout, loading } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [departmentsVersion, setDepartmentsVersion] = useState(0);

  const handleJobCreated = () => setReloadKey((prev) => prev + 1);
  const handleDepartmentCreated = () => setDepartmentsVersion((prev) => prev + 1);

  const contextValue = useMemo<DashboardContext>(
    () => ({ reloadKey, handleJobCreated, departmentsVersion, handleDepartmentCreated }),
    [reloadKey, departmentsVersion],
  );

  if (!user && !loading) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Talent Flow</h1>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 14, color: '#555' }}>
              {user.nombre} - {user.rol}
            </span>
            <button onClick={logout}>Cerrar sesion</button>
          </div>
        )}
      </header>
      <Outlet context={contextValue} />
    </div>
  );
}

function Dashboard() {
  const { reloadKey, handleJobCreated, departmentsVersion, handleDepartmentCreated } =
    useOutletContext<DashboardContext>();

  const { user } = useAuth();
  const canManageUsers = Boolean(user?.is_super_admin || user?.rol === 'admin' || user?.rol === 'hr_admin');

  return (
    <>
      {canManageUsers && <UserInvitationManager />}
      <EmployeeDirectory />
      <DepartmentManager onCreated={handleDepartmentCreated} />
      <JobForm onCreated={handleJobCreated} departmentsVersion={departmentsVersion} />
      <JobList reloadKey={reloadKey} />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/portal/vacantes" element={<PublicJobsPage />} />
      <Route path="/invitations/:token" element={<AcceptInvitationPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="jobs/:jobId/apps" element={<JobApplications />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
