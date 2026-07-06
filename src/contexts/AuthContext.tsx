import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthResponse, Usuario } from "@shared/types";
import { api, getToken, setToken } from "@/lib/api";

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setCarregando(false);
      return;
    }
    api
      .get<{ usuario: Usuario }>("/auth/me")
      .then((r) => setUsuario(r.usuario))
      .catch(() => setToken(null))
      .finally(() => setCarregando(false));
  }, []);

  async function login(email: string, senha: string) {
    const r = await api.post<AuthResponse>("/auth/login", { email, senha });
    setToken(r.token);
    setUsuario(r.usuario);
  }

  function logout() {
    setToken(null);
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
