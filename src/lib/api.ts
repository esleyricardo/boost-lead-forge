/**
 * Cliente HTTP da API com token JWT.
 */

const TOKEN_KEY = "pgfn_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    setToken(null);
    // Sessão expirada: força retorno para o login
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* resposta sem corpo JSON */
    }
    throw new ApiError(res.status, msg);
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body != null ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};

/** Baixa um arquivo (POST) preservando o header de autenticação. */
export async function downloadArquivo(path: string, body: unknown): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* sem corpo */
    }
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const nome = match?.[1] || "export.xlsx";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Formatação ----------

export function formatarCnpj(cnpj: string): string {
  if (!cnpj || cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarMoedaCompacta(valor: number): string {
  if (valor >= 1_000_000_000) return `R$ ${(valor / 1_000_000_000).toFixed(1)} bi`;
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (valor >= 1_000) return `R$ ${(valor / 1_000).toFixed(1)} mil`;
  return formatarMoeda(valor);
}

/** Formata "AAAA-MM-DD..." como "DD/MM/AAAA". */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Formata data/hora armazenada em UTC ("AAAA-MM-DD HH:MM:SS") no horário local. */
export function formatarDataHora(valor: string | null | undefined): string {
  if (!valor) return "—";
  const iso = valor.includes("T") ? valor : valor.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return valor;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
