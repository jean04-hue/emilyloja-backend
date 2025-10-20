// server.js
import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Leitura das variáveis de ambiente (defina no .env local ou no painel do Render)
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT || 6543;
const DB_NAME = process.env.DB_NAME || "postgres";
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;

if (!DB_HOST || !DB_USER || !DB_PASS) {
  console.warn("⚠️ Variáveis de BD faltando. Configure DB_HOST, DB_USER e DB_PASS.");
}

// Conexão com Postgres (Supabase pooler)
const pool = new Pool({
  host: DB_HOST,
  port: Number(DB_PORT),
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASS,
  ssl: { rejectUnauthorized: false },
  // max, idleTimeoutMillis etc podem ser adicionados se necessário
});

// Utility: cria tabela se não existir
const criarTabelaUsuarios = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        criado_em TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Tabela 'usuarios' verificada/criada.");
  } catch (err) {
    console.error("❌ Erro ao criar tabela usuarios:", err.message || err);
  }
};

// tenta criar tabela ao iniciar (não bloqueante)
criarTabelaUsuarios().catch((e) => console.error(e));

// ROTA RAIZ (JSON) — evita JSON.parse errors no front
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    return res.json({
      status: "ok",
      mensagem: "🚀 API da EmilyLoja está online",
      agora: result.rows[0]
    });
  } catch (err) {
    return res.status(500).json({ erro: "Erro ao conectar ao BD", detalhes: err.message });
  }
});

// ROTA DE TESTE (SELECT simples)
app.get("/testar-select", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ mensagem: "Conexão bem-sucedida!", data: result.rows[0] });
  } catch (error) {
    console.error("Erro testar-select:", error);
    res.status(500).json({ erro: error.message || "Erro no servidor" });
  }
});

// ROTA: cadastro (POST)
app.post("/api/cadastrar", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos" });

    // verifica duplicado
    const { rows: existentes } = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email.toLowerCase()]);
    if (existentes.length > 0) return res.status(400).json({ erro: "E-mail já cadastrado" });

    const senhaHash = await bcrypt.hash(senha, 10);
    const { rows } = await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email, criado_em",
      [nome, email.toLowerCase(), senhaHash]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Erro /api/cadastrar:", err);
    // tratamento para erro de unique constraint
    if (err.code === "23505") return res.status(400).json({ erro: "E-mail já cadastrado" });
    return res.status(500).json({ erro: "Erro interno" });
  }
});

// ROTA: login (POST)
app.post("/api/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: "Preencha e-mail e senha" });

    const { rows } = await pool.query("SELECT id, nome, email, senha FROM usuarios WHERE email = $1", [email.toLowerCase()]);
    const usuario = rows[0];
    if (!usuario) return res.status(401).json({ erro: "Usuário não encontrado" });

    const ok = await bcrypt.compare(senha, usuario.senha);
    if (!ok) return res.status(401).json({ erro: "Senha incorreta" });

    // não retorna senha
    return res.json({ id: usuario.id, nome: usuario.nome, email: usuario.email });
  } catch (err) {
    console.error("Erro /api/login:", err);
    return res.status(500).json({ erro: "Erro interno" });
  }
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
