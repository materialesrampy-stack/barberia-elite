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

    const configs = [
        { clave: 'modo_confirmacion', valor: 'manual' },
        { clave: 'notif_dueno', valor: 'activo' }
    ];

    for (const config of configs) {
        const { rows } = await pool.query(
            "SELECT * FROM configuracion WHERE clave = $1", [config.clave]
        );
        if (rows.length === 0) {
            await pool.query(
                "INSERT INTO configuracion (clave, valor) VALUES ($1, $2)",
                [config.clave, config.valor]
            );
        }
    }
}

initDB().catch(console.error);

module.exports = pool;