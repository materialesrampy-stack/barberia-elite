const pool = require('./database');
const log = require('./logger');

async function limpiarPendientes() {
    try {
        const resultado = await pool.query(`
            DELETE FROM turnos 
            WHERE estado = 'pendiente' 
            AND creado_en < NOW() - INTERVAL '15 minutes'
        `);

        if (resultado.rowCount > 0) {
            log(`${resultado.rowCount} turno(s) pendiente(s) liberado(s)`);
        }
    } catch (err) {
        log(`ERROR limpieza - ${err.message}`);
    }
}

module.exports = limpiarPendientes;