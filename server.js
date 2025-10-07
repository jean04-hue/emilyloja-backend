const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Rotas
app.use('/auth', require('./routes/auth'));
app.use('/products', require('./routes/products'));
app.use('/orders', require('./routes/orders'));

// Rota raiz (importante para Railway)
app.get('/', (req, res) => {
  res.send('🚀 API da EmilyLoja está online!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
