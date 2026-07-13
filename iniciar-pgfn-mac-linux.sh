#!/usr/bin/env bash
# PGFN Devedores — versão desktop (roda no seu computador)
set -e
cd "$(dirname "$0")"

echo "============================================================"
echo "  PGFN Devedores — versão desktop"
echo "============================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js não encontrado. Instale em: https://nodejs.org"
  exit 1
fi

# Dados fora da pasta do app: atualizar o app não apaga nada
export DATA_DIR="${DATA_DIR:-$HOME/.pgfn-devedores/data}"
mkdir -p "$DATA_DIR"
echo "Dados salvos em: $DATA_DIR"

if [ ! -d node_modules ]; then
  echo "Instalando dependências (só na primeira vez)..."
  npm install --no-audit --no-fund
fi
if [ ! -d dist ]; then
  echo "Preparando a interface (só na primeira vez)..."
  npm run build
fi

echo
echo "Sistema iniciando... o navegador abre sozinho quando o servidor estiver pronto."
echo "Endereço: http://localhost:3001 — NÃO feche este terminal enquanto usa o sistema."
echo

# O próprio servidor abre o navegador quando terminar de subir
export OPEN_BROWSER=1
npm start
