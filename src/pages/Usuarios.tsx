import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import type { Usuario, UserStatus } from "@shared/types";
import { api, formatarDataHora } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatusBadge({ status }: { status: UserStatus }) {
  if (status === "aprovado") return <Badge className="bg-green-600 hover:bg-green-600">Aprovado</Badge>;
  if (status === "pendente") return <Badge className="bg-amber-500 hover:bg-amber-500">Pendente</Badge>;
  return <Badge variant="destructive">Bloqueado</Badge>;
}

export default function Usuarios() {
  const { usuario: eu } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => api.get<{ usuarios: Usuario[] }>("/usuarios").then((r) => r.usuarios),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, ...body }: { id: number; status?: UserStatus; role?: string }) =>
      api.patch(`/usuarios/${id}`, body),
    onSuccess: () => {
      toast.success("Usuário atualizado.");
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao atualizar."),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Libere, bloqueie ou promova o acesso dos usuários cadastrados
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.nome} {u.id === eu?.id && <span className="text-xs text-muted-foreground">(você)</span>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  {u.role === "admin" ? (
                    <Badge variant="secondary">
                      <ShieldCheck className="mr-1 h-3 w-3" /> Admin
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Usuário</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={u.status} />
                </TableCell>
                <TableCell className="text-sm">{formatarDataHora(u.createdAt)}</TableCell>
                <TableCell className="text-sm">{formatarDataHora(u.lastLogin)}</TableCell>
                <TableCell className="space-x-2 text-right">
                  {u.status !== "aprovado" && (
                    <Button
                      size="sm"
                      onClick={() => atualizar.mutate({ id: u.id, status: "aprovado" })}
                      disabled={atualizar.isPending}
                    >
                      <Check className="mr-1 h-4 w-4" /> Liberar
                    </Button>
                  )}
                  {u.status !== "bloqueado" && u.id !== eu?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => atualizar.mutate({ id: u.id, status: "bloqueado" })}
                      disabled={atualizar.isPending}
                    >
                      <UserX className="mr-1 h-4 w-4" /> Bloquear
                    </Button>
                  )}
                  {u.role !== "admin" && u.status === "aprovado" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => atualizar.mutate({ id: u.id, role: "admin" })}
                      disabled={atualizar.isPending}
                    >
                      Tornar admin
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
