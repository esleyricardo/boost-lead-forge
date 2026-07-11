# PGFN Devedores — versão desktop (no seu computador)

Rodando no seu computador, o sistema usa a memória e o disco da sua máquina —
sem os limites (e custos) da hospedagem na nuvem. A base completa da PGFN
cabe tranquilamente.

## Instalação (só na primeira vez)

1. **Instale o Node.js LTS** (se ainda não tiver):
   - Acesse https://nodejs.org e baixe a versão **LTS** (botão verde)
   - Instale clicando em Avançar → Avançar → Concluir

2. **Baixe o sistema**:
   - Acesse https://github.com/esleyricardo/boost-lead-forge
   - Clique no botão verde **Code** → **Download ZIP**
   - Extraia o ZIP para uma pasta fixa (ex.: `Documentos\PGFN`)

3. **Inicie**:
   - Entre na pasta extraída
   - Dê **dois cliques em `Iniciar-PGFN-Windows.bat`**
   - Na primeira vez ele instala tudo sozinho (alguns minutos)
   - O navegador abre automaticamente em `http://localhost:3001`

> Mac/Linux: no terminal, rode `bash iniciar-pgfn-mac-linux.sh`

## Uso no dia a dia

- Dois cliques em `Iniciar-PGFN-Windows.bat` → o navegador abre → use normalmente
- **Não feche a janela preta** enquanto estiver usando (ela é o servidor)
- Para encerrar: feche a janela preta

## Onde ficam os dados

Os dados (empresas, dívidas, usuários) ficam em uma pasta **separada do app**:

- Windows: `%LOCALAPPDATA%\PGFN-Devedores\data`
- Mac/Linux: `~/.pgfn-devedores/data`

Por isso você pode apagar/substituir a pasta do app sem perder nada.

## Como atualizar o sistema

1. Baixe o ZIP novo do GitHub (mesmo passo 2 da instalação)
2. Apague a pasta antiga do app e extraia a nova no lugar
3. Dê dois cliques em `Iniciar-PGFN-Windows.bat` — seus dados continuam lá

## Observações

- A **sincronização automática diária** só roda se o computador estiver ligado
  e o sistema aberto no horário agendado. Se estiver desligado, é só clicar em
  "Verificar e sincronizar" quando abrir.
- A primeira sincronização baixa a base inteira da PGFN e demora bastante —
  deixe rodando. As seguintes verificam em segundos se há novidade.
- O sistema fica acessível só no seu computador (`localhost`). Outras pessoas
  não acessam pela internet — para acesso compartilhado, use a versão na nuvem.
