import { type ReactNode } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import {
  Building2,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/devedores", label: "Devedores", icon: Building2 },
  { to: "/enriquecidas", label: "Enriquecidas", icon: Sparkles },
  { to: "/sincronizacao", label: "Sincronização", icon: RefreshCw },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { usuario, carregando, logout } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  const itens = [...NAV_ITEMS];
  if (usuario.role === "admin") {
    itens.push({ to: "/usuarios", label: "Usuários", icon: Users });
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r bg-background">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <p className="text-sm font-bold leading-tight">PGFN Devedores</p>
            <p className="text-xs text-muted-foreground leading-tight">Monitor da Dívida Ativa</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {itens.map((item) => {
            const ativo =
              item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  ativo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{usuario.nome}</p>
            <p className="truncate text-xs text-muted-foreground">
              {usuario.email} {usuario.role === "admin" && "· admin"}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="ml-60 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
