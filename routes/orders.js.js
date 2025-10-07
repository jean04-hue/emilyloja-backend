const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.post('/', (req, res) => {
    const { userId, items, total } = req.body;
    const query = 'INSERT INTO orders (user_id, items, total) VALUES (?, ?, ?)';
    db.query(query, [userId, JSON.stringify(items), total], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Pedido criado!' });
    });
});

router.get('/:userId', (req, res) => {
    const { userId } = req.params;
    db.query('SELECT * FROM orders WHERE user_id = ?', [userId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

module.exports = router;
