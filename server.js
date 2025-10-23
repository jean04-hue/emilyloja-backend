import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import dns from "dns/promises";
import { URL } from "url";

dotenv.config();
const { Pool } = pkg;
const app = express();

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json());

// ======== Força IPv4 ========
const ensureIPv4ConnectionString = async (connStr) => {
  try {
    if (!connStr) return null;
    const url = new URL(connStr);
    const lookup = await dns.lookup(url.hostname, { family: 4 });
    if (lookup?.address) {
      console.log(`🔄 Resolvendo ${url.hostname} -> ${lookup.address}`);
      url.hostname = lookup.address;
      return url.toString();
    }
    return connStr;
  } catch (err) {
    console.error("⚠️ Erro ao forçar IPv4:", err.message);
    return connStr;
  }
};

// ======== Monta connection string ========
const buildConnectionString = async () => {
  const base = process.env.DATABASE_URL
    ? process.env.DATABASE_URL
    : `postgresql://${process.env.DB_USER || "postgres"}:${encodeURIComponent(process.env.DB_PASS || "senha_aqui")}@${process.env.DB_HOST || "db.uidxcmctxdtcaaecdyrg.supabase.co"}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "postgres"}`;
  return await ensureIPv4ConnectionString(base);
};

let pool;

const initDB = async () => {
  const connectionString = await buildConnectionString();
  console.log("🔗 Connection String final:", connectionString);

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  pool.on("error", (err) => console.error("💥 Erro inesperado no cliente idle:", err));

  // Teste de conexão com retries
  for (let i = 1; i <= 5; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("✅ Conexão com o banco OK");
      return;
    } catch (err) {
      console.error(`❌ Tentativa ${i}/5 falhou:`, err.message);
      if (i === 5) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};

// Rota base
app.get("/", (req, res) => res.send("🚀 API da EmilyLoja está online!"));

// Healthcheck
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: true });
  } catch (err) {
    res.status(500).json({ status: "error", db: false, message: err.message });
  }
});

// Criação de tabela
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

// Rotas principais
app.post("/api/cadastrar", async (req, res) => {
  console.log("📨 /api/cadastrar");
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: "Preencha todos os campos!" });

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email",
      [nome, email, senhaHash]
    );
    res.status(201).json({ usuario: result.rows[0] });
  } catch (error) {
    console.error("Erro em /api/cadastrar:", error.message);
    if (error.code === "23505") return res.status(400).json({ erro: "E-mail já cadastrado." });
    res.status(500).json({ erro: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  console.log("📨 /api/login");
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: "Preencha e-mail e senha!" });

  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const usuario = result.rows[0];
    if (!usuario) return res.status(401).json({ erro: "Usuário não encontrado." });

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) return res.status(401).json({ erro: "Senha incorreta." });

    res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (error) {
    console.error("Erro em /api/login:", error.message);
    res.status(500).json({ erro: error.message });
  }
});

// Inicialização
const PORT = process.env.PORT || 5000;
(async () => {
  await initDB();
  await criarTabelaUsuarios();
  app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
})();
