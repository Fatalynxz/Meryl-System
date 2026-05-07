import { Navigate } from 'react-router';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const userStr = localStorage.getItem('user');
  
  if (!userStr) {
    // Not logged in, redirect to login
    return <Navigate to="/" replace />;
  }

  const user = JSON.parse(userStr);
  
  if (!allowedRoles.includes(user.role)) {
    // User doesn't have permission, redirect to their dashboard
    return <Navigate to={`/${user.role}`} replace />;
  }

  return <>{children}</>;
}
