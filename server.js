import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();
const { Pool } = pkg;
const app = express();

// Logging middleware (útil para debug no Render)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// CORS - aberto para todos enquanto estiver em desenvolvimento
app.use(
  cors({
    origin: "*", // em produção restrinja para o domínio do front-end
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Conexão com o banco (Supabase ou Postgres)
const pool = new Pool({
  host:
    process.env.DB_HOST || "aws-1-sa-east-1.pooler.supabase.com", // substitua se usar outro host
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 6543,
  database: process.env.DB_NAME || "postgres",
  user: process.env.DB_USER || "postgres.uidxcmctxdtcaaecdyrg",
  password: process.env.DB_PASS || "SENHA_AQUI",
  // Supabase exige SSL; em outros ambientes configure conforme necessário
  ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
});

// Rota inicial (teste de status)
app.get("/", (req, res) => {
  res.send("🚀 API da EmilyLoja está online e conectada ao Supabase!");
});

// Health check (útil para confirmar que o serviço e o DB estão OK)
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", db: true });
  } catch (err) {
    console.error("/health error:", err.message);
    return res.status(500).json({ status: "error", db: false, message: err.message });
  }
});

// Cria tabela de usuários se não existir
const criarTabelaUsuarios = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL
      );
    `);
    console.log("✅ Tabela 'usuarios' verificada/criada com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao criar tabela:", error.message);
  }
};
criarTabelaUsuarios();

// Rota: Cadastro
app.post("/api/cadastrar", async (req, res) => {
  console.log("Requisição para /api/cadastrar recebida");
  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: "Preencha todos os campos!" });
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email",
      [nome, email, senhaHash]
    );

    // Resposta consistente com o frontend esperando data.usuario
    return res.status(201).json({ usuario: result.rows[0] });
  } catch (error) {
    // Postgres unique violation code é "23505"
    if (error.code === "23505" || (error.message && error.message.includes("duplicate key"))) {
      return res.status(400).json({ erro: "E-mail já cadastrado." });
    }
    console.error("Erro em /api/cadastrar:", error);
    return res.status(500).json({ erro: error.message || "Erro no servidor" });
  }
});

// Rota: Login
app.post("/api/login", async (req, res) => {
  console.log("Requisição para /api/login recebida");
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: "Preencha e-mail e senha!" });
  }

  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const usuario = result.rows[0];

    if (!usuario) return res.status(401).json({ erro: "Usuário não encontrado." });

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) return res.status(401).json({ erro: "Senha incorreta." });

    // Retorna objeto dentro de { usuario: ... } para manter consistência
    return res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (error) {
    console.error("Erro em /api/login:", error);
    return res.status(500).json({ erro: error.message || "Erro no servidor" });
  }
});

// Inicialização do servidor
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));