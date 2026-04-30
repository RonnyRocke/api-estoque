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

// PUT PERIFERICOS

app.put('/perifericos/:id', async (req, res) => {
    const { id } = req.params;
    const { tipo, fabricante, total, observacao, operador } = req.body;

    try {
        // 🔥 VERIFICA SE EXISTE
        const check = await pool.query(
            'SELECT * FROM perifericosDisponiveis WHERE id = $1',
            [id]
        );

        if (check.rows.length === 0) {
            return res.status(404).send('ID não encontrado');
        }

        // 🔥 ATUALIZA
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

        // 🔥 HISTÓRICO SEGURO
        await pool.query(
            `INSERT INTO historicoperifericos
            (idperiferico, acao, tipo, fabricante, quanttotal, quantemprestado, status, observacao, operador, usuario, filial)
            VALUES ($1, 'ATUALIZACAO', $2, $3, $4, 0, 'N/A', $5, $6, $6, 'N/A')`,
            [id, tipo, fabricante, total, observacao, operador]
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
        const check = await pool.query(
            `SELECT * FROM perifericosDisponiveis WHERE id = $1`,
            [id]
        );

        if (check.rows.length === 0)
            return res.status(404).send('Periférico não encontrado');

        const p = check.rows[0];

        if (p.quant_emprestado >= p.quant_total)
            return res.send('Sem estoque disponível');

        await pool.query(
            `INSERT INTO emprestimos
            (idperiferico, nomeusuario, dataemprestimo, filial, status)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 'EMPRESTADO')`,
            [id, usuario, filial]
        );

        const novo = p.quant_emprestado + 1;

        let status = 'DISPONÍVEL';
        if (novo === p.quant_total) status = 'EM FALTA';
        else if (novo > 0) status = 'EMPRESTADO';

        await pool.query(
            `UPDATE perifericosDisponiveis
             SET quant_emprestado = $1, status = $2
             WHERE id = $3`,
            [novo, status, id]
        );

        // 🔥 HISTÓRICO COMPLETO
        await pool.query(
            `INSERT INTO historicoperifericos
            (idperiferico, acao, tipo, fabricante, quanttotal, quantemprestado, status, observacao, operador, usuario, filial)
            SELECT 
                id,
                'EMPRESTIMO',
                tipo,
                fabricante,
                quant_total,
                quant_emprestado,
                status,
                observacao,
                operador,
                $2,
                $3
            FROM perifericosDisponiveis
            WHERE id = $1`,
            [id, usuario, filial]
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
        const emp = await pool.query(
            `SELECT idperiferico FROM emprestimos WHERE idemprestimo = $1`,
            [id]
        );

        if (emp.rows.length === 0)
            return res.status(404).send('Empréstimo não encontrado');

        const idPeriferico = emp.rows[0].idperiferico;

        await pool.query(
            `UPDATE emprestimos 
             SET status = 'DEVOLVIDO' 
             WHERE idemprestimo = $1`,
            [id]
        );

        const count = await pool.query(
            `SELECT COUNT(*) FROM emprestimos 
             WHERE idperiferico = $1 AND status = 'EMPRESTADO'`,
            [idPeriferico]
        );

        const emprestado = parseInt(count.rows[0].count);

        const totalRes = await pool.query(
            `SELECT * FROM perifericosDisponiveis WHERE id = $1`,
            [idPeriferico]
        );

        const p = totalRes.rows[0];

        let status = 'DISPONÍVEL';
        if (emprestado === p.quant_total) status = 'EM FALTA';
        else if (emprestado > 0) status = 'EMPRESTADO';

        await pool.query(
            `UPDATE perifericosDisponiveis
             SET quant_emprestado = $1, status = $2
             WHERE id = $3`,
            [emprestado, status, idPeriferico]
        );

        // 🔥 HISTÓRICO COMPLETO
        await pool.query(
            `INSERT INTO historicoperifericos
            (idperiferico, acao, tipo, fabricante, quanttotal, quantemprestado, status, observacao, operador, usuario, filial)
            SELECT 
                id,
                'DEVOLUCAO',
                tipo,
                fabricante,
                quant_total,
                quant_emprestado,
                status,
                observacao,
                operador,
                'SISTEMA',
                'N/A'
            FROM perifericosDisponiveis
            WHERE id = $1`,
            [idPeriferico]
        );

        res.send('Devolvido com sucesso');

    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// HISTÓRICO (COM JOIN)
// ===============================
app.get('/historico/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
                h.acao,
                h.tipo,
                h.fabricante,
                h.quanttotal,
                h.quantemprestado,
                h.status,
                h.observacao,
                h.operador,
                h.usuario,
                h.filial,
                h.datahora
             FROM historicoperifericos h
             WHERE h.idperiferico = $1
             ORDER BY h.datahora DESC`,
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
// BUSCAR EMPRÉSTIMOS POR PERIFÉRICO
// ===============================
app.get('/emprestimos/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT * FROM emprestimos 
             WHERE idperiferico = $1 
             ORDER BY dataemprestimo DESC`,
            [id]
        );

        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});


app.get('/perifericos/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'SELECT * FROM perifericosDisponiveis WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0)
            return res.status(404).send('Não encontrado');

        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).send(err.message);
    }
});
