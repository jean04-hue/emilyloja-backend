import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();
const { Pool } = pkg;
const app = express();

// ✅ CORS configurado para aceitar o front-end
app.use(cors({
  origin: "*", // pode restringir depois para seu domínio
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// 🔗 Conexão com o Supabase
const pool = new Pool({
  host: process.env.DB_HOST || "aws-1-sa-east-1.pooler.supabase.com",
  port: process.env.DB_PORT || 6543,
  database: process.env.DB_NAME || "postgres",
  user: process.env.DB_USER || "postgres.uidxcmctxdtcaaecdyrg",
  password: process.env.DB_PASS || "SENHA_AQUI",
  ssl: { rejectUnauthorized: false },
});

// 🌐 Rota inicial (teste de status)
app.get("/", (req, res) => {
  res.send("🚀 API da EmilyLoja está online e conectada ao Supabase!");
});

// ✅ Cria tabela de usuários se não existir
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

// 🧠 Rota: Cadastro
app.post("/api/cadastrar", async (req, res) => {
  console.log("Requisição para /api/cadastrar recebida"); // Adicionando o log

  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha)
    return res.status(400).json({ erro: "Preencha todos os campos!" });

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email",
      [nome, email, senhaHash]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.message.includes("duplicate key"))
      return res.status(400).json({ erro: "E-mail já cadastrado." });
    res.status(500).json({ erro: error.message });
  }
});

// 🔐 Rota: Login
app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha)
    return res.status(400).json({ erro: "Preencha e-mail e senha!" });

  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const usuario = result.rows[0];

    if (!usuario) return res.status(401).json({ erro: "Usuário não encontrado." });

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) return res.status(401).json({ erro: "Senha incorreta." });

    res.json({ id: usuario.id, nome: usuario.nome, email: usuario.email });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 🚀 Inicialização
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(🚀 Servidor rodando na porta ${PORT}));