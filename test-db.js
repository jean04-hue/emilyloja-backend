require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function testConnection() {
  try {
    await client.connect();
    console.log("✅ Conexão bem-sucedida com o banco de dados!");
    const res = await client.query('SELECT NOW()');
    console.log('🕒 Hora do servidor:', res.rows[0].now);
  } catch (err) {
    console.error("❌ Erro ao conectar ao banco de dados:", err);
  } finally {
    await client.end();
  }
}

testConnection();
