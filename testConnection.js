const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
});

client.connect()
    .then(() => {
        console.log('Conexão com o banco de dados bem-sucedida!');
        return client.end();
    })
    .catch(err => {
        console.error('Erro ao conectar ao banco de dados:', err);
    });