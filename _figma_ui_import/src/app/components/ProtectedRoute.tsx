import { Navigate } from 'react-router';
import { useAuth } from '../../lib/auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const normalizedRole = user.role_name.trim().toLowerCase();
  const hasAccess = allowedRoles.some((role) => role.toLowerCase() === normalizedRole);
  if (!hasAccess) {
    if (normalizedRole === 'admin' || normalizedRole === 'administrator') {
      return <Navigate to="/admin" replace />;
    }
    if (normalizedRole === 'sales' || normalizedRole === 'sales staff') {
      return <Navigate to="/sales" replace />;
    }
    if (normalizedRole === 'inventory' || normalizedRole === 'inventory staff') {
      return <Navigate to="/inventory" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
