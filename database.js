const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS turnos (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            email TEXT NOT NULL,
            telefono TEXT NOT NULL,
            servicio TEXT NOT NULL,
            fecha TEXT NOT NULL,
            horario TEXT NOT NULL,
            pago TEXT,
            notas TEXT,
            estado TEXT DEFAULT 'pendiente',
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clientes_bloqueados (
            id SERIAL PRIMARY KEY,
            email TEXT,
            telefono TEXT,
            motivo TEXT,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS configuracion (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        )
    `);

    const { rows } = await pool.query(
        "SELECT * FROM configuracion WHERE clave = 'modo_confirmacion'"
    );
    if (rows.length === 0) {
        await pool.query(
            "INSERT INTO configuracion (clave, valor) VALUES ('modo_confirmacion', 'manual')"
        );
    }
}

initDB().catch(console.error);

module.exports = pool;