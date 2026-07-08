import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recuperarAberto, setRecuperarAberto] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await login(email, senha);
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no login.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle>PGFN Devedores</CardTitle>
          <CardDescription>Entre com sua conta para acessar o monitor</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>
          <div className="mt-4 space-y-1 text-center text-sm text-muted-foreground">
            <p>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setRecuperarAberto(true)}
              >
                Esqueci minha senha
              </button>
            </p>
            <p>
              Não tem conta?{" "}
              <Link to="/registro" className="font-medium text-primary hover:underline">
                Cadastre-se
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={recuperarAberto} onOpenChange={setRecuperarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Recuperar senha
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm">
                <p>
                  Por segurança, a redefinição de senha é feita por um{" "}
                  <strong>administrador do sistema</strong>:
                </p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Avise um administrador que você esqueceu a senha.</li>
                  <li>
                    Ele define uma senha temporária para você na aba{" "}
                    <strong>Usuários</strong>.
                  </li>
                  <li>Entre com a senha temporária e troque-a em "Alterar senha".</li>
                </ol>
              </div>
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setRecuperarAberto(false)}>Entendi</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
