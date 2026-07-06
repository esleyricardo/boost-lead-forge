import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Devedores from "@/pages/Devedores";
import Enriquecidas from "@/pages/Enriquecidas";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Registro from "@/pages/Registro";
import Sincronizacao from "@/pages/Sincronizacao";
import Usuarios from "@/pages/Usuarios";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function AdminRoute({ children }: { children: JSX.Element }) {
  const { usuario } = useAuth();
  if (usuario?.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />
      <Route
        path="/"
        element={
          <AppLayout>
            <Dashboard />
          </AppLayout>
        }
      />
      <Route
        path="/devedores"
        element={
          <AppLayout>
            <Devedores />
          </AppLayout>
        }
      />
      <Route
        path="/enriquecidas"
        element={
          <AppLayout>
            <Enriquecidas />
          </AppLayout>
        }
      />
      <Route
        path="/sincronizacao"
        element={
          <AppLayout>
            <Sincronizacao />
          </AppLayout>
        }
      />
      <Route
        path="/usuarios"
        element={
          <AppLayout>
            <AdminRoute>
              <Usuarios />
            </AdminRoute>
          </AppLayout>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
