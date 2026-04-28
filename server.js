
process.on('unhandledRejection', err => {
    console.error('Erro não tratado:', err);
});

const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const config = {
    user: 'estoque_app',
    password: '123456',
    server: '192.168.0.7',
    port: 1433,
    database: 'Desenvolvimento_Ronald',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// 🔹 CONEXÃO GLOBAL (SEM DERRUBAR A API)
sql.connect(config)
    .then(() => {
        console.log('Conectado ao SQL Server');
    })
    .catch(err => {
        console.error('Erro ao conectar no banco:', err.message);
    });

// ===============================
// 🔹 LISTAR PERIFERICOS
// ===============================
app.get('/perifericos', async (req, res) => {
    try {
        const result = await sql.query('SELECT * FROM perifericosDisponiveis');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// 🔹 INSERIR
// ===============================
app.post('/perifericos', async (req, res) => {
    const { tipo, fabricante, total, observacao, operador } = req.body;

    try {
        const request = new sql.Request();

        request.input('tipo', sql.VarChar, tipo);
        request.input('fabricante', sql.VarChar, fabricante);
        request.input('total', sql.Int, total);
        request.input('obs', sql.VarChar, observacao);
        request.input('operador', sql.VarChar, operador);

        await request.query(`
            INSERT INTO perifericosDisponiveis
            (TIPO, FABRICANTE, QUANT_TOTAL, QUANT_EMPRESTADO, OBSERVACAO, STATUS, OPERADOR)
            VALUES (@tipo, @fabricante, @total, 0, @obs, 'DISPONÍVEL', @operador)
        `);

        res.send('Inserido com sucesso');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// 🔹 ATUALIZAR
// ===============================
app.put('/perifericos/:id', async (req, res) => {
    const id = req.params.id;
    const { tipo, fabricante, total, observacao, operador } = req.body;

    try {
        const request = new sql.Request();

        request.input('id', sql.Int, id);
        request.input('tipo', sql.VarChar, tipo);
        request.input('fabricante', sql.VarChar, fabricante);
        request.input('total', sql.Int, total);
        request.input('obs', sql.VarChar, observacao);
        request.input('operador', sql.VarChar, operador);

        await request.query(`
            UPDATE perifericosDisponiveis
            SET
                TIPO = @tipo,
                FABRICANTE = @fabricante,
                QUANT_TOTAL = @total,
                OBSERVACAO = @obs,
                OPERADOR = @operador
            WHERE ID = @id
        `);

        res.send('Atualizado com sucesso');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// 🔴 DELETE COM BACKUP
// ===============================
app.delete('/perifericos/:id', async (req, res) => {
    const id = req.params.id;

    try {
        const check = await sql.query(`
            SELECT QUANT_EMPRESTADO 
            FROM perifericosDisponiveis 
            WHERE ID = ${id}
        `);

        if (check.recordset[0].QUANT_EMPRESTADO > 0) {
            return res.status(400).send('Não pode apagar: itens emprestados');
        }

        await sql.query(`
            INSERT INTO perifericosBackup
            (TIPO, FABRICANTE, QUANT_TOTAL, QUANT_EMPRESTADO, OBSERVACAO, STATUS)
            SELECT TIPO, FABRICANTE, QUANT_TOTAL, QUANT_EMPRESTADO, OBSERVACAO, STATUS
            FROM perifericosDisponiveis
            WHERE ID = ${id}
        `);

        await sql.query(`
            DELETE FROM perifericosDisponiveis
            WHERE ID = ${id}
        `);

        res.send('Item movido para backup');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// ♻️ LISTAR BACKUP
// ===============================
app.get('/backup', async (req, res) => {
    try {
        const result = await sql.query('SELECT * FROM perifericosBackup');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
// ♻️ RESTAURAR
// ===============================
app.post('/backup/:id/restaurar', async (req, res) => {
    const id = req.params.id;

    try {
        await sql.query(`
            INSERT INTO perifericosDisponiveis
            (TIPO, FABRICANTE, QUANT_TOTAL, QUANT_EMPRESTADO, OBSERVACAO, STATUS)
            SELECT TIPO, FABRICANTE, QUANT_TOTAL, QUANT_EMPRESTADO, OBSERVACAO, STATUS
            FROM perifericosBackup
            WHERE ID = ${id}
        `);

        await sql.query(`
            DELETE FROM perifericosBackup WHERE ID = ${id}
        `);

        res.send('Restaurado com sucesso');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});


//🔹 NOVO: endpoint de empréstimo

app.post('/emprestar', async (req, res) => {
    const { id, usuario, filial } = req.body;

    try {
        await sql.query(`
            INSERT INTO EMPRESTIMOS
            (IDPeriferico, NomeUsuario, DataEmprestimo, Filial, Status)
            VALUES (${id}, '${usuario}', GETDATE(), '${filial}', 'EMPRESTADO')
        `);

        res.send('Emprestado');
    } catch (err) {
        res.status(500).send(err.message);
    }
});


//🔹 NOVO: devolver

app.post('/devolver/:id', async (req, res) => {
    const id = req.params.id;

    try {
        await sql.query(`
            UPDATE EMPRESTIMOS
            SET Status = 'DEVOLVIDO'
            WHERE IDEmprestimo = ${id}
        `);

        res.send('Devolvido');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 🔹 NOVO: histórico

app.get('/historico/:id', async (req, res) => {
    const id = req.params.id;

    try {
        const result = await sql.query(`
            SELECT * FROM HistoricoPerifericos
            WHERE IDPeriferico = ${id}
            ORDER BY DataHora DESC
        `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});
