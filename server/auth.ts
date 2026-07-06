/**
 * Autenticação com JWT e fluxo de aprovação de usuários.
 * O primeiro usuário cadastrado vira admin e já entra aprovado;
 * os demais ficam "pendente" até um admin liberar.
 */
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db";
import type { Usuario } from "../shared/types";

const JWT_SECRET = process.env.JWT_SECRET || "pgfn-dev-secret-mude-em-producao";
const TOKEN_TTL = "7d";

interface UsuarioRow {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  role: "admin" | "user";
  status: "pendente" | "aprovado" | "bloqueado";
  created_at: string;
  last_login: string | null;
}

export function toUsuario(row: UsuarioRow): Usuario {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLogin: row.last_login,
  };
}

export function registrar(nome: string, email: string, senha: string): Usuario {
  const emailNorm = email.trim().toLowerCase();
  if (!nome.trim() || !emailNorm.includes("@") || senha.length < 6) {
    throw new HttpError(400, "Dados inválidos. A senha precisa ter ao menos 6 caracteres.");
  }
  const existente = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(emailNorm);
  if (existente) throw new HttpError(409, "Já existe um usuário com este email.");

  const totalUsuarios = (db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n;
  const isPrimeiro = totalUsuarios === 0;
  const senhaHash = bcrypt.hashSync(senha, 10);

  const result = db
    .prepare(
      "INSERT INTO usuarios (nome, email, senha_hash, role, status) VALUES (?, ?, ?, ?, ?)"
    )
    .run(nome.trim(), emailNorm, senhaHash, isPrimeiro ? "admin" : "user", isPrimeiro ? "aprovado" : "pendente");

  const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(result.lastInsertRowid) as UsuarioRow;
  return toUsuario(row);
}

export function login(email: string, senha: string): { token: string; usuario: Usuario } {
  const row = db
    .prepare("SELECT * FROM usuarios WHERE email = ?")
    .get(email.trim().toLowerCase()) as UsuarioRow | undefined;

  if (!row || !bcrypt.compareSync(senha, row.senha_hash)) {
    throw new HttpError(401, "Email ou senha incorretos.");
  }
  if (row.status === "pendente") {
    throw new HttpError(403, "Seu cadastro aguarda liberação por um administrador.");
  }
  if (row.status === "bloqueado") {
    throw new HttpError(403, "Seu acesso foi bloqueado. Fale com um administrador.");
  }

  db.prepare("UPDATE usuarios SET last_login = datetime('now') WHERE id = ?").run(row.id);
  const token = jwt.sign({ sub: row.id, role: row.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  return { token, usuario: toUsuario(row) };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AuthRequest extends Request {
  usuario?: Usuario;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Não autenticado." });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: number };
    const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(payload.sub) as UsuarioRow | undefined;
    if (!row || row.status !== "aprovado") {
      return res.status(401).json({ error: "Sessão inválida ou acesso revogado." });
    }
    req.usuario = toUsuario(row);
    next();
  } catch {
    return res.status(401).json({ error: "Sessão expirada. Entre novamente." });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.usuario?.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem fazer isso." });
  }
  next();
}
