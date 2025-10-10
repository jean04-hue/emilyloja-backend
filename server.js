import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(express.json());

// Configuração da conexão com o Supabase (Transaction Pooler)
const pool = new Pool({
  host: "aws-1-sa-east-1.pooler.supabase.com",
  port: 6543,
  database: "postgres",
  user: "postgres.uidxcmctxdtcaaecdyrg",
  password: "SENHA_AQUI", // substitua pela senha real do Supabase
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

app.listen(3000, () => console.log("🚀 Servidor rodando em http://localhost:3000"));
