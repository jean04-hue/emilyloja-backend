require('dotenv').config();

console.log("Host atual:", process.env.DB_HOST);
console.log("Usuário:", process.env.DB_USER);
console.log("Senha:", process.env.DB_PASSWORD ? "****" : "NÃO DEFINIDA");
