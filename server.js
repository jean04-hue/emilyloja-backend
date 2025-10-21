import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import dns from "dns";
import { URL } from "url";

dotenv.config();
const { Pool } = pkg;
const app = express();

// Força IPv4 para conexões DNS
dns.setDefaultResultOrder("ipv4first");

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// ==================================================
// Função para converter connection string para IPv4
// ==================================================
const ensureIPv4ConnectionString = async (maybeUrl) => {
  try {
    if (!maybeUrl) return null;
    const parsed = new URL(maybeUrl);
    const lookup = await new Promise((resolve, reject) => {
      dns.lookup(parsed.hostname, { family: 4 }, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });
    parsed.hostname = lookup;
    return parsed.toString();
  } catch (err) {
    console.warn("⚠️ Falha ao resolver hostname para IPv4, usando original:", err.message);
    return maybeUrl;
  }
};

// ==================================================
// Monta connection string (com fallback IPv4)
// ==================================================
const buildConnectionString = async () => {
  if (process.env.DATABASE_URL) {
    return await ensureIPv4ConnectionString(process.env.DATABASE_URL);
  }

  const host = process.env.DB_HOST || "db.uidxcmctxdtcaaecdyrg.supabase.co";
  const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;
  const database = process.env.DB_NAME || "postgres";
  const user = process.env.DB_USER || "postgres";
  const pass = encodeURIComponent(process.env.DB_PASS || "SENHA_AQUI");
  const cs = `postgresql://${user}:${pass}@${host}:${port}/${database}`;
  return await ensureIPv4ConnectionString(cs);
};

let pool;

// ==================================================
// Inicializa conexão com o banco (com retries)
// ==================================================
const initDB = async () => {
  const connectionString = await buildConnectionString();
  console.log("🔗 Connection String:", connectionString);

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  pool.on("error", (err) => {
    console.error("Erro inesperado no cliente do pool:", err);
  });

  const retries = 5;
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("✅ Conexão com o banco OK");
      return;
    } catch (err) {
      console.error(`Tentativa ${i + 1}/${retries} - erro ao conectar:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};

// ==================================================
// Cria tabela usuários, se não existir
// ==================================================
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
    console.log("✅ Tabela 'usuarios' criada/verificada com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao criar tabela:", err.message);
  }
};

// ==================================================
// ROTAS
// ==================================================
app.get("/", (req, res) => {
  res.send("🚀 API da EmilyLoja está online e conectada ao Supabase!");
});

app.get("/health", async (req, res) => {
  try {
    if (!pool) throw new Error("pool-not-initialized");
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: true });
  } catch (err) {
    console.error("/health DB err:", err.message);
    res.status(500).json({ status: "error", db: false, message: err.message });
  }
});

app.post("/api/cadastrar", async (req, res) => {
  console.log("📩 /api/cadastrar");
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha)
    return res.status(400).json({ erro: "Preencha todos os campos!" });

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email",
      [nome, email, senhaHash]
    );
    res.status(201).json({ usuario: result.rows[0] });
  } catch (err) {
    console.error("Erro em /api/cadastrar:", err.message);
    if (err.code === "23505") {
      res.status(400).json({ erro: "E-mail já cadastrado." });
    } else {
      res.status(500).json({ erro: err.message });
    }
  }
});

app.post("/api/login", async (req, res) => {
  console.log("📩 /api/login");
  const { email, senha } = req.body;
  if (!email || !senha)
    return res.status(400).json({ erro: "Preencha e-mail e senha!" });

  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email=$1", [email]);
    const usuario = result.rows[0];
    if (!usuario) return res.status(401).json({ erro: "Usuário não encontrado." });

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) return res.status(401).json({ erro: "Senha incorreta." });

    res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (err) {
    console.error("Erro em /api/login:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// ==================================================
// Inicialização
// ==================================================
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await initDB();
    await criarTabelaUsuarios();
    app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
  } catch (err) {
    console.error("❌ Falha ao iniciar servidor:", err.message);
    process.exit(1);
  }
})();
