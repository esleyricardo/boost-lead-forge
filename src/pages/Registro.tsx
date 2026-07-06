import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Usuario } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Registro() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [criado, setCriado] = useState<Usuario | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api.post<{ usuario: Usuario }>("/auth/registro", { nome, email, senha });
      setCriado(r.usuario);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no cadastro.");
    } finally {
      setEnviando(false);
    }
  }

  if (criado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-green-600" />
            <CardTitle>Cadastro enviado</CardTitle>
            <CardDescription>
              {criado.status === "aprovado"
                ? "Sua conta já está liberada. Você pode entrar agora."
                : "Sua conta foi criada e aguarda liberação por um administrador. Você receberá acesso assim que for aprovado."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">Ir para o login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>
            Após o cadastro, um administrador precisa liberar seu acesso
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha (mínimo 6 caracteres)</Label>
              <Input
                id="senha"
                type="password"
                required
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cadastrar
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
