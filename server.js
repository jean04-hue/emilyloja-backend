 
import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import dns from "dns/promises"; // Node 16+ recommended
import { URL } from "url";

dotenv.config();
const { Pool } = pkg;
const app = express();

// logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json());

// Função para garantir que a connection string use IPv4
const ensureIPv4ConnectionString = async (maybeUrl) => {
  try {
    if (!maybeUrl) return null;
    // usa URL para parse
    const url = new URL(maybeUrl);
    const hostname = url.hostname;
    // faz lookup para IPv4 (family: 4)
    const res = await dns.lookup(hostname, { family: 4 });
    if (res && res.address) {
      // substitui hostname por IP (URL automaticamente formata)
      url.hostname = res.address;
      // quando hostname vira IP, por segurança removemos url.username/password se vierem vazias
      return url.toString();
    }
    return maybeUrl;
  } catch (err) {
    console.error("Erro ao resolver hostname para IPv4:", err.message || err);
    // fallback: retorna a original para tentar a conexão (poderá falhar)
    return maybeUrl;
  }
};

// Monta connection string preferindo DATABASE_URL
const buildConnectionString = async () => {
  if (process.env.DATABASE_URL) {
    // garante IPv4
    return await ensureIPv4ConnectionString(process.env.DATABASE_URL);
  }

  const host = process.env.DB_HOST || "db.uidxcmctxdtcaaecdyrg.supabase.co";
  const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;
  const database = process.env.DB_NAME || "postgres";
  const user = process.env.DB_USER || "postgres";
  const pass = process.env.DB_PASS || "SENHA_AQUI";
  const encodedPass = encodeURIComponent(pass);
  const cs = `postgresql://${user}:${encodedPass}@${host}:${port}/${database}`;
  // resolve host para IPv4
  return await ensureIPv4ConnectionString(cs);
};

let pool;

const initDB = async () => {
  const connectionString = await buildConnectionString();
  console.log("DB connection string (host/ip shown):", connectionString ? (process.env.DATABASE_URL ? "(using DATABASE_URL, hostname replaced if needed)" : connectionString) : "none");

  pool = new Pool({
    connectionString,
    ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
    // opcional: adjust timeouts/pool size conforme necessidade
    // connectionTimeoutMillis: 5000,
    // max: 10
  });

  pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
  });

  // Testa conexão com retries
  const retries = 5;
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("✅ Conexão com o banco OK");
      return;
    } catch (err) {
      console.error(`Tentativa ${i + 1}/${retries} - erro ao conectar ao banco:`, err.message || err);
      if (i === retries - 1) {
        console.error("❌ Não foi possível conectar ao banco após várias tentativas.");
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
};

// Rota root
app.get("/", (req, res) => {
  res.send("🚀 API da EmilyLoja está online!");
});

// Health que testa DB
app.get("/health", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ status: "error", db: false, message: "pool-not-initialized" });
    await pool.query("SELECT 1");
    return res.json({ status: "ok", db: true });
  } catch (err) {
    console.error("/health DB err:", err.message || err);
    return res.status(500).json({ status: "error", db: false, message: err.message });
  }
});

// Cria tabela
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

// Rotas
app.post("/api/cadastrar", async (req, res) => {
  console.log("Requisição para /api/cadastrar recebida");
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos!" });

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

// Inicializa DB e server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
(async () => {
  await initDB();
  if (pool) {
    // cria tabela só se pool inicializado
    await criarTabelaUsuarios();
  }
  app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
})();