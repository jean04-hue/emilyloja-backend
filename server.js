import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();
const { Pool } = pkg;
const app = express();

// Simple request logging (útil para Render logs)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// CORS (aberto para desenvolvimento)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Monta connectionString preferindo DATABASE_URL (recomendado)
const buildConnectionString = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DB_HOST || "aws-1-sa-east-1.pooler.supabase.com";
  const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 6543;
  const database = process.env.DB_NAME || "postgres";
  const user = process.env.DB_USER || "postgres";
  const pass = process.env.DB_PASS || "SENHA_AQUI";

  // Ensure password is URL encoded
  const encodedPass = encodeURIComponent(pass);
  return `postgresql://${user}:${encodedPass}@${host}:${port}/${database}`;
};

const connectionString = buildConnectionString();
console.log("Using DB connection string:", process.env.DATABASE_URL ? "DATABASE_URL (hidden)" : connectionString);

// Pool config
const pool = new Pool({
  connectionString,
  ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
  // opcional: idleTimeoutMillis, connectionTimeoutMillis, max
  // connectionTimeoutMillis: 2000,
  // max: 10
});

// Escuta erros inesperados do pool
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

// Função de teste de conexão com retries
const testDBConnection = async (retries = 5, delayMs = 1500) => {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("✅ Conexão com o banco OK");
      return true;
    } catch (err) {
      console.error(`Tentativa ${i + 1}/${retries} - erro ao conectar ao banco:`, err.message || err);
      // Se for o último, relança
      if (i === retries - 1) {
        console.error("❌ Não foi possível conectar ao banco após várias tentativas.");
        return false;
      }
      // wait
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
};

// rota root
app.get("/", (req, res) => {
  res.send("🚀 API da EmilyLoja está online e conectada ao Supabase!");
});

// health-check que também testa DB
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", db: true });
  } catch (err) {
    console.error("/health DB err:", err.message || err);
    return res.status(500).json({ status: "error", db: false, message: err.message });
  }
});

// cria tabela se não existir
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
    console.error("❌ Erro ao criar tabela:", error.message || error);
  }
};

// rota cadastro
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
    return res.status(201).json({ usuario: result.rows[0] });
  } catch (error) {
    console.error("Erro em /api/cadastrar:", error);
    if (error.code === "23505" || (error.message && error.message.includes("duplicate key"))) {
      return res.status(400).json({ erro: "E-mail já cadastrado." });
    }
    return res.status(500).json({ erro: error.message || "Erro no servidor" });
  }
});

// rota login
app.post("/api/login", async (req, res) => {
  console.log("Requisição para /api/login recebida");
  const { email, senha } = req.body;

  if (!email || !senha) return res.status(400).json({ erro: "Preencha e-mail e senha!" });

  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const usuario = result.rows[0];
    if (!usuario) return res.status(401).json({ erro: "Usuário não encontrado." });

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) return res.status(401).json({ erro: "Senha incorreta." });

    return res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (error) {
    console.error("Erro em /api/login:", error);
    return res.status(500).json({ erro: error.message || "Erro no servidor" });
  }
});

// inicializa server depois de verificar DB (melhora visibilidade dos erros)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
(async () => {
  const ok = await testDBConnection(5, 1500);
  if (!ok) {
    console.error("Banco inacessível no startup. O servidor continuará rodando, mas as requisições ao DB falharão até resolver a conexão.");
  } else {
    // só cria tabela se o DB estiver OK
    await criarTabelaUsuarios();
  }

  app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
})();