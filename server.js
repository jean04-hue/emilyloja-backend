import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

// 🌐 Rota inicial (para testar no navegador)
app.get("/", (req, res) => {
  res.send("🚀 API da EmilyLoja está online e conectada ao Supabase!");
});

// 🔗 Conexão com o Supabase (Transaction Pooler)
const pool = new Pool({
  host: process.env.DB_HOST || "aws-1-sa-east-1.pooler.supabase.com",
  port: process.env.DB_PORT || 6543,
  database: process.env.DB_NAME || "postgres",
  user: process.env.DB_USER || "postgres.uidxcmctxdtcaaecdyrg",
  password: process.env.DB_PASS || "SENHA_AQUI", // Substitua localmente
  ssl: { rejectUnauthorized: false },
});

// ✅ Rota para testar leitura
app.get("/testar-select", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ mensagem: "Conexão bem-sucedida!", data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ✅ Rota para testar escrita (cria tabela e insere um dado)
app.get("/testar-insert", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_teste (
        id SERIAL PRIMARY KEY,
        nome TEXT
      )
    `);
    await pool.query(`INSERT INTO usuarios_teste (nome) VALUES ('Schneider')`);
    const result = await pool.query("SELECT * FROM usuarios_teste");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 🚀 Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
