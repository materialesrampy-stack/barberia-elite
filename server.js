require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const turnosRouter = require('./routes/turnos');
const limpiarPendientes = require('./limpieza');
const log = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos fallidos. Esperá 15 minutos.' },
    skipSuccessfulRequests: true
});

// const limiter = rateLimit({
//     windowMs: 10 * 60 * 1000,
//     max: 3,
//     message: { error: 'Demasiados intentos, esperá unos minutos.' }
// });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/turnos/admin', adminLimiter);
// app.use('/api/turnos', limiter);
app.use('/api/turnos', turnosRouter);

app.use((err, req, res, next) => {
    log(`ERROR - ${req.method} ${req.url} - ${err.message}`);
    res.status(500).json({ error: 'Ocurrió un error interno. Intentá de nuevo.' });
});

process.on('uncaughtException', (err) => {
    log(`ERROR CRITICO - ${err.message}`);
    console.error(err);
});

process.on('unhandledRejection', (err) => {
    log(`ERROR PROMESA - ${err.message}`);
    console.error(err);
});

setInterval(limpiarPendientes, 60 * 1000);
limpiarPendientes();

app.listen(PORT, () => {
    log(`Servidor iniciado en puerto ${PORT}`);
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});