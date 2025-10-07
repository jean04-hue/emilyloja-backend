const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: 'Usuário criado!' });
        });
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, result) => {
        if (err) return res.status(500).json(err);
        if (!result[0]) return res.status(404).json({ message: 'Usuário não encontrado' });

        const match = await bcrypt.compare(password, result[0].password);
        if (!match) return res.status(401).json({ message: 'Senha incorreta' });

        const token = jwt.sign({ id: result[0].id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: result[0].id, name: result[0].name, email: result[0].email } });
    });
});

module.exports = router;
