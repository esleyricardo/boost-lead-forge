# PGFN Devedores — Monitor da Dívida Ativa

Aplicação web que baixa automaticamente os Dados Abertos da PGFN (dívida ativa da União),
monta uma base pesquisável de empresas devedoras e enriquece os contatos
(telefone, email, sócios) via API OpenCNPJ — para prospecção e análise.

## Funcionalidades

- **Sincronização automática diária**: o servidor baixa os arquivos trimestrais da
  PGFN todos os dias no horário configurado (padrão 06:00, fuso de Brasília),
  descobre sozinho o trimestre mais recente publicado e detecta o que entrou de novo na base.
- **Data de inclusão da dívida**: cada dívida guarda a **data oficial de inscrição
  na Dívida Ativa** (campo `DATA_INSCRICAO` do CSV da PGFN) **e** a data em que o
  sistema a detectou pela primeira vez. Empresas que entraram na última
  sincronização recebem o selo **"Nova"**.
- **Controle de usuários com liberação**: qualquer pessoa pode se cadastrar, mas o
  acesso só é ativado depois que um administrador **libera** o usuário na tela
  de Usuários. O primeiro usuário cadastrado vira admin automaticamente.
- **Enriquecimento seletivo**: selecione as empresas desejadas na tabela e clique
  em "Enriquecer selecionadas" — o sistema busca telefones, email, sócios e CNAE
  no OpenCNPJ em segundo plano, com barra de progresso.
- **Histórico de enriquecidas**: página própria listando todas as empresas já
  enriquecidas, quando e por quem.
- **Exportação Excel** com filtros ou com a seleção atual.
- Filtros por natureza da dívida (Previdenciário, Simples Nacional, Demais
  Débitos), UF, faixa de valor, busca por razão social/CNPJ e "só novas".

## Stack

- **Backend**: Node.js + Express + SQLite (better-sqlite3) + node-cron
- **Frontend**: React + Vite + Tailwind + shadcn/ui + TanStack Query
- **Autenticação**: JWT + bcrypt

## Como rodar

```bash
npm install

# Desenvolvimento (API na porta 3001 + frontend na 8080 com proxy)
npm run dev

# Produção
npm run build      # gera o frontend em dist/
npm start          # sobe o servidor na porta 3001 servindo API + frontend
```

Acesse http://localhost:8080 (dev) ou http://localhost:3001 (produção).
O primeiro cadastro feito no sistema vira administrador.

### Variáveis de ambiente (opcionais)

| Variável     | Padrão            | Descrição                                   |
| ------------ | ----------------- | ------------------------------------------- |
| `PORT`       | `3001`            | Porta do servidor                           |
| `JWT_SECRET` | (valor de dev)    | **Defina em produção** — segredo dos tokens |
| `DATA_DIR`   | `./data`          | Pasta do banco SQLite                       |

### Primeira carga de dados

Depois de entrar, vá em **Sincronização → Executar sincronização**. Os arquivos da
PGFN são grandes (centenas de MB) e a primeira importação pode levar bastante tempo.
Depois disso a atualização acontece sozinha, todos os dias.

## Testes

```bash
npm test
```

Cobre o parser do CSV da PGFN, o pipeline de upsert/consolidação, a detecção de
novas empresas, os filtros, o fluxo de aprovação de usuários e o gerador de Excel.

## Fontes de dados

- PGFN Dados Abertos: https://dadosabertos.pgfn.gov.br (arquivos trimestrais
  `Dados_abertos_Previdenciario.zip` e `Dados_abertos_Nao_Previdenciario.zip`)
- OpenCNPJ: https://api.opencnpj.org
