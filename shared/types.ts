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
  /** Esferas das dívidas ativas ("federal", "estadual"), separadas por ", " */
  esferas: string;
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
  /**
   * Trimestre PGFN (ex: "2026_trimestre_01") em que a empresa ENTROU na base,
   * apurado pelo comparativo último × penúltimo trimestre. null = já estava antes
   * (ou o comparativo ainda não foi executado).
   */
  entrouNaBaseEm: string | null;
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
  /** Apenas empresas que entraram na base neste trimestre (ex: "2026_trimestre_01") */
  trimestreEntrada?: string;
  /** Dívida mais recente inscrita a partir desta data (AAAA-MM-DD) */
  inscricaoDe?: string;
  /** Dívida mais recente inscrita até esta data (AAAA-MM-DD) */
  inscricaoAte?: string;
  /** Esfera da dívida: federal (PGFN) ou estadual (PGEs) */
  esfera?: "federal" | "estadual";
  enriquecidas?: "sim" | "nao";
  page?: number;
  pageSize?: number;
  orderBy?:
    | "valorTotal"
    | "dataInscricaoMaisRecente"
    | "razaoSocial"
    | "dataPrimeiraDeteccao"
    | "entrouNaBaseEm"
    | "enrichedAt";
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
  /** Origem dos dados: "PGFN" (federal) ou o id de uma fonte estadual (ex: "PGE-GO") */
  fonte: string;
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

// ---------- Fontes estaduais ----------

export interface FonteEstadualStatus {
  id: string; // ex: "PGE-GO"
  nome: string; // ex: "Goiás — Dívida Ativa Estadual"
  uf: string;
  /** Cadência típica de publicação da fonte (informativo) */
  atualizacao: string;
  ultimaSincronizacao: string | null;
  executando: boolean;
}

// ---------- Comparativo de trimestres ----------

export interface ComparativoResultado {
  /** Trimestre mais recente (o que está carregado na base) */
  trimestreAtual: string;
  /** Trimestres anteriores baixados para a comparação (do mais recente ao mais antigo) */
  trimestresComparados: string[];
  /** Quantas empresas entraram na base em cada trimestre identificado */
  porTrimestre: { trimestre: string; empresas: number }[];
  executadoEm: string;
}

export interface ComparativoStatus {
  executando: boolean;
  etapa: string | null;
  errorMessage: string | null;
  resultado: ComparativoResultado | null;
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
