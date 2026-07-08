/**
 * Banco de dados SQLite (better-sqlite3).
 * As tabelas são criadas automaticamente na inicialização.
 */
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "pgfn.db");
// Aparece nos logs de deploy: confirme que este caminho está DENTRO do volume
// persistente (ex.: /app/data), senão os dados são perdidos a cada redeploy.
console.log(`[DB] Banco de dados em ${DB_PATH}`);

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','bloqueado')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sincronizacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','error')),
  trimestre_referencia TEXT,
  total_dividas INTEGER NOT NULL DEFAULT 0,
  total_empresas INTEGER NOT NULL DEFAULT 0,
  novas_empresas INTEGER NOT NULL DEFAULT 0,
  novas_dividas INTEGER NOT NULL DEFAULT 0,
  progresso TEXT,
  error_message TEXT,
  disparo TEXT NOT NULL DEFAULT 'manual' CHECK (disparo IN ('manual','automatica')),
  iniciada_em TEXT NOT NULL DEFAULT (datetime('now')),
  concluida_em TEXT
);

-- Uma linha por inscrição em dívida ativa (chave natural: numero_inscricao)
CREATE TABLE IF NOT EXISTS dividas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_inscricao TEXT NOT NULL UNIQUE,
  cnpj TEXT NOT NULL,
  nome_devedor TEXT,
  uf TEXT,
  natureza_divida TEXT NOT NULL,
  receita_principal TEXT,
  situacao_inscricao TEXT,
  indicador_ajuizado TEXT,
  -- Data oficial de inscrição na Dívida Ativa (campo DATA_INSCRICAO do CSV da PGFN)
  data_inscricao TEXT,
  valor_consolidado REAL NOT NULL DEFAULT 0,
  -- Quando o nosso sistema viu esta dívida pela primeira vez
  data_primeira_deteccao TEXT NOT NULL DEFAULT (datetime('now')),
  primeira_sync_id INTEGER NOT NULL,
  ultima_sync_id INTEGER NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_dividas_cnpj ON dividas (cnpj);
CREATE INDEX IF NOT EXISTS idx_dividas_natureza ON dividas (natureza_divida);

-- Visão consolidada por empresa (CNPJ), recalculada após cada sincronização
CREATE TABLE IF NOT EXISTS empresas (
  cnpj TEXT PRIMARY KEY,
  razao_social TEXT NOT NULL,
  uf TEXT,
  naturezas TEXT NOT NULL DEFAULT '',
  qtd_dividas INTEGER NOT NULL DEFAULT 0,
  valor_total REAL NOT NULL DEFAULT 0,
  data_inscricao_mais_antiga TEXT,
  data_inscricao_mais_recente TEXT,
  data_primeira_deteccao TEXT NOT NULL DEFAULT (datetime('now')),
  primeira_sync_id INTEGER NOT NULL,
  -- Trimestre PGFN em que a empresa entrou na base (comparativo de trimestres)
  entrou_na_base_em TEXT,
  -- Enriquecimento via OpenCNPJ
  telefones TEXT,
  email TEXT,
  socios TEXT,
  municipio TEXT,
  cnae_descricao TEXT,
  data_abertura_empresa TEXT,
  situacao_cadastral TEXT,
  enriched_at TEXT,
  enriched_by INTEGER REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_empresas_uf ON empresas (uf);
CREATE INDEX IF NOT EXISTS idx_empresas_valor ON empresas (valor_total);
CREATE INDEX IF NOT EXISTS idx_empresas_enriched ON empresas (enriched_at);
CREATE INDEX IF NOT EXISTS idx_empresas_razao ON empresas (razao_social);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tabela de trabalho do comparativo de trimestres: CNPJs presentes no
-- trimestre ANTERIOR, usados para descobrir quem entrou no trimestre atual.
CREATE TABLE IF NOT EXISTS cnpjs_trimestre_ref (
  cnpj TEXT PRIMARY KEY
) WITHOUT ROWID;
`);

// Migração: bancos criados antes do comparativo de trimestres não têm a coluna
const colunasEmpresas = db.prepare("PRAGMA table_info(empresas)").all() as { name: string }[];
if (!colunasEmpresas.some((c) => c.name === "entrou_na_base_em")) {
  db.exec("ALTER TABLE empresas ADD COLUMN entrou_na_base_em TEXT");
}

export function getConfig(chave: string): string | null {
  const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = ?").get(chave) as
    | { valor: string | null }
    | undefined;
  return row?.valor ?? null;
}

export function setConfig(chave: string, valor: string): void {
  db.prepare(
    `INSERT INTO configuracoes (chave, valor, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`
  ).run(chave, valor);
}

// Valores padrão: sincronização automática diária às 06:00 habilitada
if (getConfig("cron_ativo") === null) setConfig("cron_ativo", "true");
if (getConfig("cron_horario") === null) setConfig("cron_horario", "06:00");
