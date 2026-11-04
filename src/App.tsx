import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth, type UserRole } from './context/AuthContext.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import { LandingPage, AuthPage, PublicTrackingPage } from './pages/PublicPages.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import {
  OrdersListPage,
  OrderFormPage,
  OrderEditWrapperPage,
  OrderDetailPage,
} from './pages/OrdersPages.tsx';
import { CustomersListPage, CustomerDetailPage } from './pages/CustomersPages.tsx';
import { ProductionKanbanPage, ProductionDetailPage } from './pages/ProductionPages.tsx';
import {
  InvoicesListPage,
  InvoiceDetailPage,
  ReportsPage,
} from './pages/InvoicesReportsPages.tsx';
import {
  TeamPage,
  SettingsPage,
  SubscriptionPage,
  CustomerPortalOverviewPage,
  CustomerPortalDesignsPage,
} from './pages/WorkspaceCustomerPages.tsx';

function ProtectedShellRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const { firebaseUser, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500">
        Memuat sesi workspace OrderFlow...
      </div>
    );
  }

  if (!firebaseUser || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(profile.effectiveRole)) {
    const fallback = profile.effectiveRole === 'customer' ? '/portal' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
          <Route path="/track" element={<PublicTrackingPage />} />
          <Route path="/track/:token" element={<PublicTrackingPage />} />

          {/* Internal Workspace Dashboard Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin', 'production_staff']}>
                <DashboardPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin', 'production_staff']}>
                <OrdersListPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/orders/create"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin']}>
                <OrderFormPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/orders/:id/edit"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin']}>
                <OrderEditWrapperPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin', 'production_staff']}>
                <OrderDetailPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin']}>
                <CustomersListPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/customers/:id"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin']}>
                <CustomerDetailPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/production"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin', 'production_staff']}>
                <ProductionKanbanPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/production/:id"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin', 'production_staff']}>
                <ProductionDetailPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin']}>
                <InvoicesListPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/invoices/:id"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin', 'customer']}>
                <InvoiceDetailPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedShellRoute allowedRoles={['owner', 'admin']}>
                <ReportsPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/team"
            element={
              <ProtectedShellRoute allowedRoles={['owner']}>
                <TeamPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedShellRoute allowedRoles={['owner']}>
                <SettingsPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/subscription"
            element={
              <ProtectedShellRoute allowedRoles={['owner']}>
                <SubscriptionPage />
              </ProtectedShellRoute>
            }
          />

          {/* Customer Portal Routes */}
          <Route
            path="/portal"
            element={
              <ProtectedShellRoute allowedRoles={['customer']}>
                <CustomerPortalOverviewPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/portal/orders"
            element={
              <ProtectedShellRoute allowedRoles={['customer']}>
                <CustomerPortalOverviewPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/portal/orders/:id"
            element={
              <ProtectedShellRoute allowedRoles={['customer']}>
                <OrderDetailPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/portal/designs"
            element={
              <ProtectedShellRoute allowedRoles={['customer']}>
                <CustomerPortalDesignsPage />
              </ProtectedShellRoute>
            }
          />
          <Route
            path="/portal/invoices"
            element={
              <ProtectedShellRoute allowedRoles={['customer']}>
                <InvoicesListPage />
              </ProtectedShellRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
