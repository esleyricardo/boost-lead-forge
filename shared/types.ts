/**
 * Tipos compartilhados entre o servidor e o frontend.
 */

export const NATUREZAS_DIVIDA = [
  "Tributário Previdenciário",
  "Tributário Simples Nacional",
  "Tributário Demais Débitos",
] as const;

export type NaturezaDivida = (typeof NATUREZAS_DIVIDA)[number];

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
] as const;

// ---------- Usuários ----------

export type UserRole = "admin" | "user";
export type UserStatus = "pendente" | "aprovado" | "bloqueado";

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLogin: string | null;
}

export interface AuthResponse {
  token: string;
  usuario: Usuario;
}

// ---------- Empresas / Dívidas ----------

export interface Empresa {
  cnpj: string;
  razaoSocial: string;
  uf: string | null;
  naturezas: string; // naturezas distintas separadas por ", "
  qtdDividas: number;
  valorTotal: number;
  /** Data oficial (PGFN) da inscrição mais antiga em dívida ativa */
  dataInscricaoMaisAntiga: string | null;
  /** Data oficial (PGFN) da inscrição mais recente */
  dataInscricaoMaisRecente: string | null;
  /** Quando o sistema detectou esta empresa pela primeira vez */
  dataPrimeiraDeteccao: string;
  /** true se a empresa entrou na base na última sincronização concluída */
  isNova: boolean;
  // Enriquecimento (OpenCNPJ)
  telefones: string | null;
  email: string | null;
  socios: string | null; // JSON array
  municipio: string | null;
  cnaeDescricao: string | null;
  dataAberturaEmpresa: string | null;
  situacaoCadastral: string | null;
  enrichedAt: string | null;
  enrichedByNome: string | null;
}

export interface Divida {
  id: number;
  cnpj: string;
  numeroInscricao: string;
  naturezaDivida: string;
  receitaPrincipal: string | null;
  situacaoInscricao: string | null;
  indicadorAjuizado: string | null;
  /** Data oficial de inscrição na Dívida Ativa (campo DATA_INSCRICAO da PGFN) */
  dataInscricao: string | null;
  valorConsolidado: number;
  dataPrimeiraDeteccao: string;
  ativa: number;
}

export interface Socio {
  nome: string;
  qualificacao: string;
  tipo: string;
  faixaEtaria: string;
}

export interface EmpresasFiltro {
  busca?: string;
  natureza?: string;
  uf?: string;
  valorMin?: number;
  valorMax?: number;
  apenasNovas?: boolean;
  enriquecidas?: "sim" | "nao";
  page?: number;
  pageSize?: number;
  orderBy?: "valorTotal" | "dataInscricaoMaisRecente" | "razaoSocial" | "dataPrimeiraDeteccao";
  orderDir?: "asc" | "desc";
}

export interface PaginatedEmpresas {
  items: Empresa[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- Sincronização ----------

export type SyncStatus = "running" | "completed" | "error";

export interface Sincronizacao {
  id: number;
  status: SyncStatus;
  trimestreReferencia: string | null;
  totalDividas: number;
  totalEmpresas: number;
  novasEmpresas: number;
  novasDividas: number;
  progresso: string | null;
  errorMessage: string | null;
  iniciadaEm: string;
  concluidaEm: string | null;
  disparo: "manual" | "automatica";
}

export interface SyncConfig {
  cronAtivo: boolean;
  cronHorario: string; // ex: "06:00"
  ultimaSincronizacao: string | null;
  proximaExecucao: string | null;
  executando: boolean;
}

// ---------- Enriquecimento ----------

export interface EnriquecimentoStatus {
  executando: boolean;
  total: number;
  processados: number;
  sucesso: number;
  falhas: number;
  cnpjAtual: string | null;
}

// ---------- Dashboard ----------

export interface DashboardMetrics {
  totalEmpresas: number;
  totalDividas: number;
  valorTotal: number;
  novasEmpresasUltimaSync: number;
  empresasEnriquecidas: number;
  ultimaSincronizacao: string | null;
  proximaExecucao: string | null;
  usuariosPendentes: number;
  porNatureza: { natureza: string; qtd: number; valor: number }[];
  porUf: { uf: string; qtd: number }[];
}
