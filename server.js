process.on('unhandledRejection', err => {
    console.error('Erro não tratado:', err);
});

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 CONEXÃO NEON
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_Jn0VEQd8lHKe@ep-sweet-night-acdeoik9-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// ===============================
// TESTE
// ===============================
app.get('/', (req, res) => {
    res.send('API ONLINE 🚀');
});

// ===============================
// LISTAR
// ===============================
app.get('/perifericos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM perifericosDisponiveis');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// INSERIR
// ===============================
app.post('/perifericos', async (req, res) => {
    const { tipo, fabricante, total, observacao, operador } = req.body;

    try {
        await pool.query(
            `INSERT INTO perifericosDisponiveis 
            (tipo, fabricante, quant_total, quant_emprestado, observacao, status, operador)
            VALUES ($1, $2, $3, 0, $4, 'DISPONÍVEL', $5)`,
            [tipo, fabricante, total, observacao, operador]
        );

        res.send('Inserido com sucesso');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// ATUALIZAR
// ===============================
app.put('/perifericos/:id', async (req, res) => {
    const { id } = req.params;
    const { tipo, fabricante, total, observacao, operador } = req.body;

    try {
        await pool.query(
            `UPDATE perifericosDisponiveis
             SET tipo = $1,
                 fabricante = $2,
                 quant_total = $3,
                 observacao = $4,
                 operador = $5
             WHERE id = $6`,
            [tipo, fabricante, total, observacao, operador, id]
        );

        res.send('Atualizado com sucesso');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// EMPRESTAR
// ===============================
app.post('/emprestar', async (req, res) => {
    const { id, usuario, filial } = req.body;

    try {
        // 🔹 verifica estoque disponível
        const check = await pool.query(
            `SELECT quant_total, quant_emprestado 
             FROM perifericosDisponiveis 
             WHERE id = $1`,
            [id]
        );

        if (check.rows.length === 0)
            return res.status(404).send('Periférico não encontrado');

        const { quant_total, quant_emprestado } = check.rows[0];

        if (quant_emprestado >= quant_total)
            return res.send('Sem estoque disponível');

        // 🔹 insere empréstimo
        await pool.query(
            `INSERT INTO emprestimos
            (idperiferico, nomeusuario, dataemprestimo, filial, status)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 'EMPRESTADO')`,
            [id, usuario, filial]
        );

        // 🔹 atualiza estoque
        const novoEmprestado = quant_emprestado + 1;

        let status = 'DISPONÍVEL';
        if (novoEmprestado === quant_total)
            status = 'EM FALTA';
        else if (novoEmprestado > 0)
            status = 'EMPRESTADO';

        await pool.query(
            `UPDATE perifericosDisponiveis
             SET quant_emprestado = $1, status = $2
             WHERE id = $3`,
            [novoEmprestado, status, id]
        );

        res.send('Empréstimo realizado com sucesso');

    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// DEVOLVER
// ===============================
app.post('/devolver/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query(
            `UPDATE emprestimos
             SET status = 'DEVOLVIDO'
             WHERE idemprestimo = $1`,
            [id]
        );

        res.send('Devolvido');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// HISTÓRICO
// ===============================
app.get('/historico/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT * FROM historicoperifericos
             WHERE idperiferico = $1
             ORDER BY datahora DESC`,
            [id]
        );

        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});

// ===============================
// DELETE
// ===============================
app.delete('/perifericos/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query(
            'DELETE FROM perifericosdisponiveis WHERE id = $1',
            [id]
        );

        res.send('Deletado com sucesso');
    } catch (err) {
        res.status(500).send(err.message);
    }
});
