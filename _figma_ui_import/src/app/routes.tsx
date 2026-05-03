import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from '../lib/auth-context';

const Login = lazy(() => import('./components/Login').then((module) => ({ default: module.Login })));
const AdminLayout = lazy(() => import('./components/AdminLayout').then((module) => ({ default: module.AdminLayout })));
const SalesStaffLayout = lazy(() =>
  import('./components/SalesStaffLayout').then((module) => ({ default: module.SalesStaffLayout })),
);
const InventoryStaffLayout = lazy(() =>
  import('./components/InventoryStaffLayout').then((module) => ({ default: module.InventoryStaffLayout })),
);

function RouteLoader({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>{children}</Suspense>;
}

function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user) {
    const normalizedRole = user.role_name.trim().toLowerCase();
    if (normalizedRole === 'admin' || normalizedRole === 'administrator') {
      return <Navigate to="/admin" replace />;
    }
    if (normalizedRole === 'sales' || normalizedRole === 'sales staff') {
      return <Navigate to="/sales" replace />;
    }
    if (normalizedRole === 'inventory' || normalizedRole === 'inventory staff') {
      return <Navigate to="/inventory" replace />;
    }
  }

  return <Login />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RouteLoader>
        <RootRedirect />
      </RouteLoader>
    ),
  },
  {
    path: '/admin',
    element: (
      <RouteLoader>
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminLayout />
        </ProtectedRoute>
      </RouteLoader>
    ),
  },
  {
    path: '/sales',
    element: (
      <RouteLoader>
        <ProtectedRoute allowedRoles={['sales', 'sales staff']}>
          <SalesStaffLayout />
        </ProtectedRoute>
      </RouteLoader>
    ),
  },
  {
    path: '/inventory',
    element: (
      <RouteLoader>
        <ProtectedRoute allowedRoles={['inventory', 'inventory staff']}>
          <InventoryStaffLayout />
        </ProtectedRoute>
      </RouteLoader>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
