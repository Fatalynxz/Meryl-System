import { Navigate } from 'react-router';
import { getRoleGroup, useAuth } from '../../lib/auth-context';

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

  const roleGroup = getRoleGroup(user.role_name);
  const allowedGroups = allowedRoles.map((role) => getRoleGroup(role) || role.toLowerCase());
  const hasAccess = allowedGroups.includes(roleGroup);
  if (!hasAccess) {
    if (roleGroup === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    if (roleGroup === 'sales') {
      return <Navigate to="/sales" replace />;
    }
    if (roleGroup === 'inventory') {
      return <Navigate to="/inventory" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
