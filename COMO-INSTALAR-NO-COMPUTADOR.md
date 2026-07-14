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
   - Ele cria automaticamente o atalho **"PGFN Devedores"** na sua área de trabalho
   - Na primeira vez ele instala tudo sozinho em segundo plano (alguns
     minutos, sem nenhuma janela aparecendo — é normal a tela ficar "parada")
   - O app abre sozinho, em janela própria, quando estiver pronto

> Mac/Linux: no terminal, rode `bash iniciar-pgfn-mac-linux.sh`

## Uso no dia a dia

- Dois cliques no atalho **"PGFN Devedores"** da área de trabalho
- **Não aparece nenhuma janela preta.** O sistema roda em segundo plano e
  abre direto em **janela própria de aplicativo** (sem barra de endereço
  nem abas — visual de programa instalado)
- Para encerrar: **feche a janela do app** — o servidor encerra sozinho junto
  (a menos que uma sincronização esteja em andamento; nesse caso ele espera
  terminar antes de encerrar)
- Clicar no atalho de novo com o app já aberto só traz a janela para frente,
  sem abrir uma segunda cópia

Se algo não abrir, veja a seção **Solução de problemas** no final.

## Onde ficam os dados

Os dados (empresas, dívidas, usuários) ficam em uma pasta **separada do app**:

- Windows: `%LOCALAPPDATA%\PGFN-Devedores\data`
- Mac/Linux: `~/.pgfn-devedores/data`

Por isso você pode apagar/substituir a pasta do app sem perder nada.

## Atualização automática (Windows)

Você **não precisa baixar mais nada manualmente**: toda vez que abre o sistema
pelo atalho, ele verifica no GitHub se há versão nova. Se houver, baixa e
aplica sozinho (leva ~1 minuto) e depois inicia normalmente. Seus dados nunca
são tocados.

Para a verificação funcionar, escolha UMA das opções:

**Opção A — tornar o repositório público (mais simples):**
1. Acesse https://github.com/esleyricardo/boost-lead-forge/settings
2. Role até o final (**Danger Zone**) → **Change visibility** → **Make public**

**Opção B — manter privado, usando um token:**
1. Acesse https://github.com/settings/tokens → **Generate new token (fine-grained)**
2. Em "Repository access", selecione só o `boost-lead-forge`;
   em "Permissions", dê **Contents: Read-only**
3. Copie o token e cole-o num arquivo de texto salvo em:
   `%LOCALAPPDATA%\PGFN-Devedores\token.txt`

Se nenhuma das duas estiver configurada, o sistema apenas avisa que não pôde
verificar e abre normalmente com a versão instalada.

**Como saber se atualizou:** o número da versão (7 primeiros caracteres do
commit) aparece pequeno no rodapé do menu lateral do sistema. Depois que eu
avisar que subi uma melhoria, feche e abra o app pelo atalho — se o número
mudou, a atualização pegou.

## Solução de problemas

Tudo que acontece nos bastidores fica registrado em dois arquivos, dentro de
`%LOCALAPPDATA%\PGFN-Devedores\`:

- **`log.txt`** — verificação de atualização, instalação, início do servidor
- **`servidor.log`** — tudo que o servidor imprime enquanto roda (erros,
  avisos de operações lentas, etc.)

Se o app não abrir ou a atualização não parecer ter pego, abra esses dois
arquivos com o Bloco de Notas e me envie o conteúdo — normalmente identifico
o problema na hora.

**Forçar uma verificação de atualização agora:** apague o arquivo
`%LOCALAPPDATA%\PGFN-Devedores\versao.txt` e abra o app pelo atalho — ele vai
tratar como se nunca tivesse a versão instalada e baixar a mais recente.

## Observações

- A **sincronização automática diária** só roda se o computador estiver ligado
  e o sistema aberto no horário agendado. Se estiver desligado, é só clicar em
  "Verificar e sincronizar" quando abrir.
- A primeira sincronização baixa a base inteira da PGFN e demora bastante —
  deixe rodando. As seguintes verificam em segundos se há novidade.
- O sistema fica acessível só no seu computador (`localhost`). Outras pessoas
  não acessam pela internet — para acesso compartilhado, use a versão na nuvem.
