import { createBrowserRouter, Navigate } from 'react-router';
import { Login } from './components/Login';
import { AdminLayout } from './components/AdminLayout';
import { SalesStaffLayout } from './components/SalesStaffLayout';
import { InventoryStaffLayout } from './components/InventoryStaffLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

// Check if user is logged in and redirect accordingly
function RootRedirect() {
  const userStr = localStorage.getItem('user');
  
  if (userStr) {
    const user = JSON.parse(userStr);
    return <Navigate to={`/${user.role}`} replace />;
  }
  
  return <Login />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />,
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <AdminLayout />
      </ProtectedRoute>
    ),
  },
  {
    path: '/sales',
    element: (
      <ProtectedRoute allowedRoles={['sales']}>
        <SalesStaffLayout />
      </ProtectedRoute>
    ),
  },
  {
    path: '/inventory',
    element: (
      <ProtectedRoute allowedRoles={['inventory']}>
        <InventoryStaffLayout />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
