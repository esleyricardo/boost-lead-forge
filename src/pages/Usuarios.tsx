import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Loader2, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import type { Usuario, UserStatus } from "@shared/types";
import { api, formatarDataHora } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [redefinindo, setRedefinindo] = useState<Usuario | null>(null);
  const [novaSenha, setNovaSenha] = useState("");

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

  const redefinirSenha = useMutation({
    mutationFn: ({ id, senha }: { id: number; senha: string }) =>
      api.post(`/usuarios/${id}/senha`, { novaSenha: senha }),
    onSuccess: () => {
      toast.success(`Senha de ${redefinindo?.nome} redefinida. Informe a nova senha a ele(a).`);
      setRedefinindo(null);
      setNovaSenha("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao redefinir senha."),
  });

  function confirmarRedefinicao(e: FormEvent) {
    e.preventDefault();
    if (!redefinindo) return;
    redefinirSenha.mutate({ id: redefinindo.id, senha: novaSenha });
  }

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
                  <Button
                    size="sm"
                    variant="outline"
                    title="Definir uma nova senha para este usuário (recuperação de acesso)"
                    onClick={() => {
                      setNovaSenha("");
                      setRedefinindo(u);
                    }}
                  >
                    <KeyRound className="mr-1 h-4 w-4" /> Redefinir senha
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={redefinindo != null}
        onOpenChange={(aberto) => {
          if (!aberto) setRedefinindo(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Redefinir senha
            </DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{redefinindo?.nome}</strong> ({redefinindo?.email})
              e informe a ele(a) por um canal seguro. Recomende trocá-la depois em "Alterar senha".
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmarRedefinicao} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova senha (mínimo 6 caracteres)</Label>
              <Input
                id="nova-senha"
                type="text"
                required
                minLength={6}
                autoComplete="off"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Ex: troque-me-123"
              />
            </div>
            <Button type="submit" className="w-full" disabled={redefinirSenha.isPending}>
              {redefinirSenha.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
