import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  GitCompareArrows,
  Loader2,
  PlayCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { ComparativoStatus, Sincronizacao as Sync, SyncConfig } from "@shared/types";
import { api, formatarDataHora } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** "2026_trimestre_01" -> "1º trimestre de 2026" */
function formatarTrimestre(t: string | null | undefined): string {
  if (!t) return "—";
  const m = t.match(/^(\d{4})_trimestre_0([1-4])$/);
  return m ? `${m[2]}º trimestre de ${m[1]}` : t;
}

function StatusBadge({ s }: { s: Sync }) {
  if (s.status === "running")
    return (
      <Badge className="bg-blue-600 hover:bg-blue-600">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Em andamento
      </Badge>
    );
  if (s.status === "completed")
    return (
      <Badge className="bg-green-600 hover:bg-green-600">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Concluída
      </Badge>
    );
  return (
    <Badge variant="destructive">
      <AlertCircle className="mr-1 h-3 w-3" /> Erro
    </Badge>
  );
}

export default function Sincronizacao() {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const [horarioEdicao, setHorarioEdicao] = useState<string | null>(null);

  const { data: config } = useQuery({
    queryKey: ["sync-config"],
    queryFn: () => api.get<SyncConfig>("/sync/config"),
    refetchInterval: 10_000,
  });

  const { data: historico } = useQuery({
    queryKey: ["sync-historico"],
    queryFn: () =>
      api.get<{ sincronizacoes: Sync[] }>("/sync/historico").then((r) => r.sincronizacoes),
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === "running") ? 3000 : 15_000),
  });

  const emAndamento = config?.executando || historico?.some((s) => s.status === "running");

  const { data: comparativo } = useQuery({
    queryKey: ["comparativo-status"],
    queryFn: () => api.get<ComparativoStatus>("/comparativo/status"),
    refetchInterval: (q) => (q.state.data?.executando ? 3000 : 15_000),
  });

  const executarComparativo = useMutation({
    mutationFn: () => api.post("/comparativo/executar", {}),
    onSuccess: () => {
      toast.success("Comparativo iniciado. Ele baixa a base do trimestre anterior; acompanhe abaixo.");
      queryClient.invalidateQueries({ queryKey: ["comparativo-status"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Falha ao iniciar o comparativo."),
  });

  const executar = useMutation({
    mutationFn: (forcar: boolean) => api.post("/sync/executar", { forcar }),
    onSuccess: () => {
      toast.success("Sincronização iniciada. Acompanhe o progresso abaixo.");
      queryClient.invalidateQueries({ queryKey: ["sync-historico"] });
      queryClient.invalidateQueries({ queryKey: ["sync-config"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Falha ao iniciar sincronização."),
  });

  const salvarConfig = useMutation({
    mutationFn: (payload: { cronAtivo: boolean; cronHorario: string }) =>
      api.put("/sync/config", payload),
    onSuccess: () => {
      toast.success("Configuração salva.");
      setHorarioEdicao(null);
      queryClient.invalidateQueries({ queryKey: ["sync-config"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao salvar."),
  });

  const resetar = useMutation({
    mutationFn: () => api.post("/sync/reset", {}),
    onSuccess: () => {
      toast.success("Base zerada. Você já pode iniciar uma nova sincronização.");
      queryClient.invalidateQueries();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao zerar a base."),
  });

  const isAdmin = usuario?.role === "admin";
  const syncAtual = historico?.find((s) => s.status === "running");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sincronização</h1>
        <p className="text-sm text-muted-foreground">
          Importação automática diária dos Dados Abertos da PGFN
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Atualização automática diária
            </CardTitle>
            <CardDescription>
              O sistema baixa a base da PGFN todos os dias no horário definido e marca as
              empresas e dívidas que entraram na base, guardando a data oficial de inscrição e a
              data de detecção.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="cron-ativo">Sincronizar automaticamente</Label>
              <Switch
                id="cron-ativo"
                checked={config?.cronAtivo ?? false}
                disabled={!isAdmin || salvarConfig.isPending}
                onCheckedChange={(v) =>
                  salvarConfig.mutate({
                    cronAtivo: v,
                    cronHorario: config?.cronHorario || "06:00",
                  })
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="horario">Horário (Brasília)</Label>
                <Input
                  id="horario"
                  type="time"
                  disabled={!isAdmin}
                  value={horarioEdicao ?? config?.cronHorario ?? "06:00"}
                  onChange={(e) => setHorarioEdicao(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={!isAdmin || horarioEdicao == null || salvarConfig.isPending}
                onClick={() =>
                  salvarConfig.mutate({
                    cronAtivo: config?.cronAtivo ?? true,
                    cronHorario: horarioEdicao!,
                  })
                }
              >
                Salvar horário
              </Button>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <p>
                Última sincronização:{" "}
                <strong>{formatarDataHora(config?.ultimaSincronizacao) || "nunca"}</strong>
              </p>
              <p>
                Próxima execução automática:{" "}
                <strong>
                  {config?.proximaExecucao ? formatarDataHora(config.proximaExecucao) : "desativada"}
                </strong>
              </p>
            </div>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Apenas administradores alteram o agendamento.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4" /> Sincronizar agora
            </CardTitle>
            <CardDescription>
              O sistema primeiro confere se a PGFN publicou algo novo. Só baixa a base (que é
              grande) quando há um trimestre novo — se nada mudou, encerra em segundos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => executar.mutate(false)}
              disabled={emAndamento || executar.isPending}
              className="w-full"
            >
              {emAndamento ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sincronização em andamento...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" /> Verificar e sincronizar
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => executar.mutate(true)}
              disabled={emAndamento || executar.isPending}
              title="Baixa e reprocessa a base inteira mesmo que nada tenha mudado (demora horas)"
            >
              Forçar reprocessamento completo
            </Button>
            {syncAtual?.progresso && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <p className="font-medium">Progresso:</p>
                <p className="text-muted-foreground">{syncAtual.progresso}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4" /> Comparativo de trimestres
          </CardTitle>
          <CardDescription>
            Compara a base atual com as dos <strong>trimestres anteriores</strong> da PGFN (3
            trimestres no total) e registra em qual trimestre cada empresa entrou na base — veja a
            coluna &quot;Entrou na base&quot; e o filtro correspondente na aba Devedores. Roda
            automaticamente após a primeira sincronização; o processo baixa as bases anteriores
            inteiras e pode demorar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => executarComparativo.mutate()}
            disabled={comparativo?.executando || emAndamento || executarComparativo.isPending}
          >
            {comparativo?.executando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Comparativo em andamento...
              </>
            ) : (
              <>
                <GitCompareArrows className="mr-2 h-4 w-4" /> Comparar último × penúltimo trimestre
              </>
            )}
          </Button>
          {comparativo?.executando && comparativo.etapa && (
            <div className="rounded-md border bg-muted/50 p-3 text-sm">
              <p className="font-medium">Progresso:</p>
              <p className="text-muted-foreground">{comparativo.etapa}</p>
            </div>
          )}
          {!comparativo?.executando && comparativo?.errorMessage && (
            <p className="text-sm text-destructive">{comparativo.errorMessage}</p>
          )}
          {comparativo?.resultado && (
            <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">
                Último comparativo: {formatarDataHora(comparativo.resultado.executadoEm)}
              </p>
              {comparativo.resultado.porTrimestre.length === 0 && (
                <p className="text-muted-foreground">
                  Nenhuma empresa nova identificada no período comparado.
                </p>
              )}
              {comparativo.resultado.porTrimestre.map((p) => (
                <p key={p.trimestre}>
                  Entraram no {formatarTrimestre(p.trimestre)}:{" "}
                  <strong>{p.empresas.toLocaleString("pt-BR")} empresas</strong>
                </p>
              ))}
              <p className="text-xs text-muted-foreground">
                Empresas sem marcação já estavam na base antes do período comparado.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de sincronizações</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Disparo</TableHead>
              <TableHead>Trimestre</TableHead>
              <TableHead className="text-right">Empresas</TableHead>
              <TableHead className="text-right">Dívidas</TableHead>
              <TableHead className="text-right">Novas empresas</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historico?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Nenhuma sincronização executada ainda.
                </TableCell>
              </TableRow>
            )}
            {historico?.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <StatusBadge s={s} />
                  {s.status === "error" && s.errorMessage && (
                    <p className="mt-1 max-w-64 text-xs text-destructive">{s.errorMessage}</p>
                  )}
                </TableCell>
                <TableCell className="text-sm capitalize">{s.disparo}</TableCell>
                <TableCell className="text-sm">{s.trimestreReferencia || "—"}</TableCell>
                <TableCell className="text-right text-sm">
                  {s.totalEmpresas.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {s.totalDividas.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {s.novasEmpresas.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-sm">{formatarDataHora(s.iniciadaEm)}</TableCell>
                <TableCell className="text-sm">{formatarDataHora(s.concluidaEm)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {isAdmin && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" /> Zona de perigo
            </CardTitle>
            <CardDescription>
              Zera todos os dados de sincronização (dívidas, empresas, histórico e comparativo) e
              libera o espaço em disco, para recomeçar do zero. <strong>Seus usuários e senhas são
              mantidos.</strong> Esta ação não pode ser desfeita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={emAndamento || resetar.isPending}>
                  {resetar.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Zerar base e recomeçar do zero
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Zerar toda a base?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todas as dívidas, empresas, histórico de sincronizações e o comparativo serão
                    apagados definitivamente, e o espaço em disco será liberado. Os usuários
                    cadastrados (incluindo o seu login) permanecem. Deseja continuar?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => resetar.mutate()}
                  >
                    Sim, zerar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
