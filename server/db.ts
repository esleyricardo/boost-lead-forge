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
// Desempenho no desktop: usa a memória da máquina para acelerar a busca.
// mmap mapeia o arquivo do banco direto na RAM (leituras em velocidade de
// memória, sem ir ao disco toda hora); cache maior guarda mais páginas; os
// índices/ordenações temporários vão para a memória em vez do disco.
db.pragma("mmap_size = 2147483648"); // 2 GB memory-mapped
db.pragma("cache_size = -262144"); // 256 MB de cache de páginas
db.pragma("temp_store = MEMORY");
db.pragma("busy_timeout = 5000");

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
  -- Origem dos dados: 'PGFN' (federal) ou o id de uma fonte estadual (ex: 'PGE-GO')
  fonte TEXT NOT NULL DEFAULT 'PGFN',
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
  ativa INTEGER NOT NULL DEFAULT 1,
  -- Origem/esfera do crédito: federal (PGFN) ou estadual (PGE-GO, PGE-RS, ...)
  origem TEXT NOT NULL DEFAULT 'PGFN',
  esfera TEXT NOT NULL DEFAULT 'federal'
);
CREATE INDEX IF NOT EXISTS idx_dividas_cnpj ON dividas (cnpj);
CREATE INDEX IF NOT EXISTS idx_dividas_natureza ON dividas (natureza_divida);
-- (idx_dividas_origem é criado após as migrações, quando a coluna origem já
--  existe também em bancos antigos)

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
  -- Esferas das dívidas ativas da empresa ("federal", "estadual" ou ambas)
  esferas TEXT NOT NULL DEFAULT '',
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
-- Acelera a listagem padrão (só empresas com dívida, ordenada por valor)
-- em bases grandes (milhões de empresas)
CREATE INDEX IF NOT EXISTS idx_empresas_ativas_valor
  ON empresas (valor_total DESC) WHERE qtd_dividas > 0;
-- Acelera o filtro de recência (dívida inscrita a partir de...)
CREATE INDEX IF NOT EXISTS idx_empresas_inscricao_recente
  ON empresas (data_inscricao_mais_recente) WHERE qtd_dividas > 0;
-- Acelera o filtro por estado já na ordem de valor (evita reordenar)
CREATE INDEX IF NOT EXISTS idx_empresas_uf_valor
  ON empresas (uf, valor_total DESC) WHERE qtd_dividas > 0;

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

// Migrações: bancos criados por versões anteriores não têm estas colunas
const colunasEmpresas = db.prepare("PRAGMA table_info(empresas)").all() as { name: string }[];
if (!colunasEmpresas.some((c) => c.name === "entrou_na_base_em")) {
  db.exec("ALTER TABLE empresas ADD COLUMN entrou_na_base_em TEXT");
}
if (!colunasEmpresas.some((c) => c.name === "esferas")) {
  db.exec("ALTER TABLE empresas ADD COLUMN esferas TEXT NOT NULL DEFAULT ''");
  // Base pré-existente veio inteira da PGFN
  db.exec("UPDATE empresas SET esferas = 'federal' WHERE qtd_dividas > 0");
}
const colunasDividas = db.prepare("PRAGMA table_info(dividas)").all() as { name: string }[];
if (!colunasDividas.some((c) => c.name === "origem")) {
  db.exec("ALTER TABLE dividas ADD COLUMN origem TEXT NOT NULL DEFAULT 'PGFN'");
  db.exec("ALTER TABLE dividas ADD COLUMN esfera TEXT NOT NULL DEFAULT 'federal'");
}
const colunasSync = db.prepare("PRAGMA table_info(sincronizacoes)").all() as { name: string }[];
if (!colunasSync.some((c) => c.name === "fonte")) {
  db.exec("ALTER TABLE sincronizacoes ADD COLUMN fonte TEXT NOT NULL DEFAULT 'PGFN'");
}
// Índice em origem: criado agora, depois de garantir a coluna nos dois
// caminhos (base nova via CREATE TABLE; base antiga via ALTER acima)
db.exec("CREATE INDEX IF NOT EXISTS idx_dividas_origem ON dividas (origem)");

// Índice de busca textual (FTS5/trigram) para pesquisa por nome quase
// instantânea em bases com milhões de empresas — inclusive por trechos no
// meio da palavra. Mantido em sincronia por triggers.
const FTS_VERSAO = "2-trigram";
export let ftsDisponivel = false;
try {
  const versaoFts = (
    db.prepare("SELECT valor FROM configuracoes WHERE chave = 'fts_versao'").get() as
      | { valor: string | null }
      | undefined
  )?.valor;
  const precisaReconstruir = versaoFts !== FTS_VERSAO;
  if (precisaReconstruir) {
    // Estrutura antiga (ou inexistente): recria do zero
    db.exec(`
      DROP TRIGGER IF EXISTS empresas_fts_ai;
      DROP TRIGGER IF EXISTS empresas_fts_ad;
      DROP TRIGGER IF EXISTS empresas_fts_au;
      DROP TABLE IF EXISTS empresas_fts;
    `);
  }
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS empresas_fts USING fts5(
      razao_social,
      content='empresas',
      content_rowid='rowid',
      tokenize='trigram'
    );
    CREATE TRIGGER IF NOT EXISTS empresas_fts_ai AFTER INSERT ON empresas BEGIN
      INSERT INTO empresas_fts(rowid, razao_social) VALUES (new.rowid, new.razao_social);
    END;
    CREATE TRIGGER IF NOT EXISTS empresas_fts_ad AFTER DELETE ON empresas BEGIN
      INSERT INTO empresas_fts(empresas_fts, rowid, razao_social) VALUES ('delete', old.rowid, old.razao_social);
    END;
    CREATE TRIGGER IF NOT EXISTS empresas_fts_au AFTER UPDATE OF razao_social ON empresas BEGIN
      INSERT INTO empresas_fts(empresas_fts, rowid, razao_social) VALUES ('delete', old.rowid, old.razao_social);
      INSERT INTO empresas_fts(rowid, razao_social) VALUES (new.rowid, new.razao_social);
    END;
  `);
  // Índice novo ou de versão antiga: preenche a partir dos dados existentes.
  // (Não dá para "espiar" se está vazio: consultas simples numa tabela FTS de
  // conteúdo externo leem da tabela de origem.)
  if (precisaReconstruir) {
    console.log("[DB] Construindo índice de busca por nome (só na primeira vez, aguarde)...");
    db.prepare("INSERT INTO empresas_fts(empresas_fts) VALUES ('rebuild')").run();
    console.log("[DB] Índice de busca pronto.");
  }
  db.prepare(
    `INSERT INTO configuracoes (chave, valor, updated_at) VALUES ('fts_versao', ?, datetime('now'))
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`
  ).run(FTS_VERSAO);
  ftsDisponivel = true;
} catch (err) {
  console.warn(
    "[DB] FTS5 indisponível; a busca por nome usará o modo tradicional.",
    err instanceof Error ? err.message : err
  );
}

/**
 * Zera todos os dados de sincronização (dívidas, empresas, histórico,
 * comparativo) e recupera o espaço em disco, mantendo os usuários e o
 * agendamento. Usado para "começar do zero" sem perder o login.
 */
export function resetarDadosPGFN(): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM dividas").run();
    db.prepare("DELETE FROM empresas").run();
    db.prepare("DELETE FROM sincronizacoes").run();
    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();
    db.prepare(
      `DELETE FROM configuracoes
       WHERE chave IN ('assinatura_pgfn','ultima_sincronizacao','trimestre_atual','comparativo_resultado')`
    ).run();
    // Reinicia a contagem de IDs (só afeta tabelas com AUTOINCREMENT)
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('dividas','sincronizacoes')").run();
  });
  tx();
  // Compacta o arquivo do banco para devolver o espaço ao disco/volume
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
  console.log("[DB] Dados da PGFN zerados e disco recuperado (usuários mantidos).");
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
