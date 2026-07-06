/**
 * Enriquecimento de dados de empresas via API OpenCNPJ (https://api.opencnpj.org).
 * O usuário seleciona as empresas na tela; o processamento roda em segundo
 * plano no servidor, sequencialmente, respeitando o rate limit da API.
 */
import { db } from "../db";
import type { EnriquecimentoStatus } from "../../shared/types";

const OPENCNPJ_BASE = "https://api.opencnpj.org";
const DELAY_MS = 350;

interface CnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  data_inicio_atividade: string;
  municipio: string;
  uf: string;
  email: string;
  telefones: Array<{ ddd: string; numero: string; is_fax: boolean }>;
  QSA: Array<{
    nome_socio: string;
    qualificacao_socio: string;
    identificador_socio: string;
    faixa_etaria: string;
  }>;
  cnaes: Array<{ codigo: string; descricao: string; is_principal: boolean }>;
  // Alguns retornos usam cnae_principal em vez da lista
  cnae_principal?: string;
}

const status: EnriquecimentoStatus = {
  executando: false,
  total: 0,
  processados: 0,
  sucesso: 0,
  falhas: 0,
  cnpjAtual: null,
};

export function getEnriquecimentoStatus(): EnriquecimentoStatus {
  return { ...status };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function consultarCnpj(cnpj: string, tentativa = 0): Promise<CnpjData | null> {
  const cnpjLimpo = cnpj.replace(/\D/g, "");
  try {
    const response = await fetch(`${OPENCNPJ_BASE}/${cnpjLimpo}`, {
      headers: { Accept: "application/json", "User-Agent": "PGFN-Devedores/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 429 && tentativa < 3) {
      await sleep(2000 * (tentativa + 1));
      return consultarCnpj(cnpj, tentativa + 1);
    }
    if (!response.ok) return null;
    return (await response.json()) as CnpjData;
  } catch {
    return null;
  }
}

function formatarTelefones(telefones: CnpjData["telefones"]): string | null {
  if (!telefones?.length) return null;
  const fones = telefones.filter((t) => !t.is_fax).map((t) => `(${t.ddd}) ${t.numero}`);
  return fones.length ? fones.join(", ") : null;
}

function formatarSocios(qsa: CnpjData["QSA"]): string | null {
  if (!qsa?.length) return null;
  return JSON.stringify(
    qsa.map((s) => ({
      nome: s.nome_socio,
      qualificacao: s.qualificacao_socio,
      tipo: s.identificador_socio,
      faixaEtaria: s.faixa_etaria,
    }))
  );
}

export async function enriquecerEmpresa(cnpj: string, userId: number): Promise<boolean> {
  const dados = await consultarCnpj(cnpj);
  if (!dados) return false;

  const cnaePrincipal =
    dados.cnaes?.find((c) => c.is_principal)?.descricao || dados.cnae_principal || null;

  db.prepare(
    `UPDATE empresas SET
       telefones = ?, email = ?, socios = ?, municipio = ?, cnae_descricao = ?,
       data_abertura_empresa = ?, situacao_cadastral = ?,
       enriched_at = datetime('now'), enriched_by = ?
     WHERE cnpj = ?`
  ).run(
    formatarTelefones(dados.telefones),
    dados.email || null,
    formatarSocios(dados.QSA),
    dados.municipio || null,
    cnaePrincipal ? String(cnaePrincipal).substring(0, 500) : null,
    dados.data_inicio_atividade || null,
    dados.situacao_cadastral || null,
    userId,
    cnpj
  );
  return true;
}

/**
 * Inicia o enriquecimento das empresas selecionadas em segundo plano.
 * Retorna imediatamente; o progresso é acompanhado via getEnriquecimentoStatus().
 */
export function iniciarEnriquecimento(cnpjs: string[], userId: number): EnriquecimentoStatus {
  if (status.executando) {
    throw new Error("Já existe um enriquecimento em andamento. Aguarde a conclusão.");
  }
  const lista = [...new Set(cnpjs.map((c) => c.replace(/\D/g, "")))].filter((c) => c.length === 14);
  if (lista.length === 0) throw new Error("Nenhum CNPJ válido selecionado.");

  status.executando = true;
  status.total = lista.length;
  status.processados = 0;
  status.sucesso = 0;
  status.falhas = 0;
  status.cnpjAtual = null;

  (async () => {
    try {
      for (const cnpj of lista) {
        status.cnpjAtual = cnpj;
        try {
          const ok = await enriquecerEmpresa(cnpj, userId);
          if (ok) status.sucesso++;
          else status.falhas++;
        } catch (err) {
          console.error(`[Enriquecimento] Falha no CNPJ ${cnpj}:`, err);
          status.falhas++;
        }
        status.processados++;
        await sleep(DELAY_MS);
      }
    } finally {
      status.executando = false;
      status.cnpjAtual = null;
      console.log(
        `[Enriquecimento] Concluído: ${status.sucesso} com sucesso, ${status.falhas} falhas de ${status.total}.`
      );
    }
  })();

  return getEnriquecimentoStatus();
}
