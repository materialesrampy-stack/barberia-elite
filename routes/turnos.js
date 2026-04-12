const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const router = express.Router();
const pool = require('../database');
const log = require('../logger');
require('dotenv').config();
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);



function verificarToken(req, res) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
        res.status(401).json({ error: 'No autorizado' });
        return false;
    }
    try {
        jwt.verify(token, process.env.TOKEN_SECRET);
        return true;
    } catch {
        res.status(401).json({ error: 'Token inválido o expirado' });
        return false;
    }
}

// GET /api/turnos?fecha=2026-04-10
router.get('/', async (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.status(400).json({ error: 'Falta la fecha' });

  const { rows } = await pool.query(
    `SELECT horario FROM turnos WHERE fecha = $1 AND estado IN ('pendiente', 'confirmado')`,
    [fecha]
  );

  res.json({ ocupados: rows.map(t => t.horario) });
});

// POST /api/turnos/login
router.post('/login', async (req, res) => {
    const { password } = req.body;
    const valida = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!valida) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    const token = jwt.sign({ admin: true }, process.env.TOKEN_SECRET, { expiresIn: '8h' });
    res.json({ token });
});

// POST /api/turnos/admin
router.post('/admin', async (req, res) => {
    if (!verificarToken(req, res)) return;
    const { fecha } = req.body;

    const { rows } = fecha
        ? await pool.query(`SELECT * FROM turnos WHERE fecha = $1 ORDER BY fecha, horario`, [fecha])
        : await pool.query(`SELECT * FROM turnos ORDER BY fecha, horario`);

    res.json({ turnos: rows });
});

// GET /api/turnos/config/modo
router.get('/config/modo', async (req, res) => {
    const { rows } = await pool.query(
        "SELECT valor FROM configuracion WHERE clave = 'modo_confirmacion'"
    );
    res.json({ modo: rows[0]?.valor || 'manual' });
});

// POST /api/turnos/config/modo
router.post('/config/modo', async (req, res) => {
    if (!verificarToken(req, res)) return;
    const { modo } = req.body;
    if (!['manual', 'automatico'].includes(modo)) {
        return res.status(400).json({ error: 'Modo inválido' });
    }
    await pool.query(
        "UPDATE configuracion SET valor = $1 WHERE clave = 'modo_confirmacion'",
        [modo]
    );
    log(`Modo de confirmación cambiado a ${modo}`);
    res.json({ ok: true });
});

// GET /api/turnos/cancelar/:token
router.get('/cancelar/:token', async (req, res) => {
  try {
    const [hmac, data] = req.params.token.split('.');
    const decoded = Buffer.from(data, 'base64').toString();
    const [id, email] = decoded.split('|');

    const expectedHmac = crypto.createHmac('sha256', process.env.TOKEN_SECRET)
      .update(decoded)
      .digest('hex');

    if (hmac !== expectedHmac) {
      return res.send('<h2>Link inválido.</h2>');
    }

    const { rows } = await pool.query(
      'SELECT * FROM turnos WHERE id = $1 AND email = $2',
      [id, email]
    );
    const turno = rows[0];

    if (!turno) {
      return res.send('<h2>Link inválido o turno no encontrado.</h2>');
    }

    if (turno.estado === 'cancelado') {
      return res.send('<h2>Este turno ya fue cancelado.</h2>');
    }

    await pool.query('UPDATE turnos SET estado = $1 WHERE id = $2', ['cancelado', turno.id]);

    res.send(`
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family:Arial;text-align:center;padding:60px;">
          <h2>✅ Turno cancelado correctamente</h2>
          <p>Tu turno del <strong>${turno.fecha}</strong> a las <strong>${turno.horario}</strong> fue cancelado.</p>
          <p>Si querés reservar otro turno podés hacerlo desde nuestra página.</p>
      </body>
      </html>
    `);
  } catch (err) {
    res.send('<h2>Link inválido.</h2>');
  }
});

// POST /api/turnos
router.post('/', async (req, res) => {
  const { nombre, email, telefono, servicio, fecha, horario, pago, notas } = req.body;

  const sanitizar = (str, max) => String(str || '').trim().slice(0, max);

  const nombreLimpio = sanitizar(nombre, 100);
  const emailLimpio = sanitizar(email, 100);
  const telefonoLimpio = sanitizar(telefono, 20);
  const servicioLimpio = sanitizar(servicio, 100);
  const fechaLimpia = sanitizar(fecha, 10);
  const horarioLimpio = sanitizar(horario, 5);
  const pagoLimpio = sanitizar(pago, 50);
  const notasLimpio = sanitizar(notas, 300);

  if (!nombreLimpio || !emailLimpio || !telefonoLimpio || !servicioLimpio || !fechaLimpia || !horarioLimpio) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  const { rows: existente } = await pool.query(
    `SELECT id FROM turnos WHERE fecha = $1 AND horario = $2 AND estado IN ('pendiente', 'confirmado')`,
    [fechaLimpia, horarioLimpio]
  );

  if (existente.length > 0) {
    return res.status(409).json({ error: 'Ese horario ya está reservado' });
  }

  const { rows: bloqueado } = await pool.query(
    `SELECT id FROM clientes_bloqueados WHERE email = $1 OR telefono = $2`,
    [emailLimpio, telefonoLimpio]
  );

  if (bloqueado.length > 0) {
    return res.status(403).json({ error: 'No podés realizar reservas en este momento. Contactanos para más información.' });
  }

  const ahora = new Date();
  const fechaHoraTurno = new Date(`${fechaLimpia}T${horarioLimpio}:00-03:00`);
  const diferenciaHoras = (fechaHoraTurno - ahora) / (1000 * 60 * 60);

  if (diferenciaHoras < 1) {
    return res.status(400).json({ error: 'El turno debe reservarse con al menos 1 hora de antelación. Por favor seleccioná otra fecha y/o horario.' });
  }

  const { rows: config } = await pool.query(
    "SELECT valor FROM configuracion WHERE clave = 'modo_confirmacion'"
  );
  const modoAuto = config[0]?.valor === 'automatico';
  const estadoInicial = modoAuto ? 'confirmado' : 'pendiente';

  const { rows: resultado } = await pool.query(`
    INSERT INTO turnos (nombre, email, telefono, servicio, fecha, horario, pago, notas, estado)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `, [nombreLimpio, emailLimpio, telefonoLimpio, servicioLimpio, fechaLimpia, horarioLimpio, pagoLimpio, notasLimpio, estadoInicial]);

  log(`Turno creado - ${fechaLimpia} ${horarioLimpio} - ${nombreLimpio} - ${servicioLimpio} - modo: ${estadoInicial}`);

  const { rows: configNotif } = await pool.query(
      "SELECT valor FROM configuracion WHERE clave = 'notif_dueno'"
  );
  if (configNotif[0]?.valor === 'activo') {
      try {
          await resend.emails.send({
              from: 'onboarding@resend.dev',
              to: process.env.EMAIL_DUENO,
              subject: '🔔 Nuevo turno solicitado - Barbería Elite',
              html: `
                  <h2>Nuevo turno solicitado</h2>
                  <ul>
                      <li><strong>Nombre:</strong> ${nombreLimpio}</li>
                      <li><strong>Servicio:</strong> ${servicioLimpio}</li>
                      <li><strong>Fecha:</strong> ${fechaLimpia}</li>
                      <li><strong>Horario:</strong> ${horarioLimpio}</li>
                      <li><strong>Teléfono:</strong> ${telefonoLimpio}</li>
                      <li><strong>Pago:</strong> ${pagoLimpio}</li>
                      <li><strong>Notas:</strong> ${notasLimpio || 'Sin notas'}</li>
                  </ul>
                  <p>Entrá al panel admin para confirmar o cancelar el turno.</p>
              `
          });
          log(`Notificación enviada al dueño`);
      } catch (error) {
          log(`ERROR notif dueño - ${error.message}`);
      }
  }


  if (modoAuto) {
    const turno = resultado[0];

    const token = crypto.createHmac('sha256', process.env.TOKEN_SECRET)
      .update(`${turno.id}|${emailLimpio}`)
      .digest('hex') + '.' + Buffer.from(`${turno.id}|${emailLimpio}`).toString('base64');

    const linkCancelar = `${process.env.BASE_URL}/api/turnos/cancelar/${token}`;

    const html = `
      <h2>¡Tu turno está confirmado!</h2>
      <p>Hola <strong>${nombreLimpio}</strong>, tu reserva fue confirmada.</p>
      <ul>
        <li><strong>Servicio:</strong> ${servicioLimpio}</li>
        <li><strong>Fecha:</strong> ${fechaLimpia}</li>
        <li><strong>Horario:</strong> ${horarioLimpio}</li>
        <li><strong>Pago:</strong> ${pagoLimpio}</li>
      </ul>
      <p>Si necesitás cancelar tu turno, hacé click acá:</p>
      <a href="${linkCancelar}" style="background:#ef4444;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Cancelar turno</a>
      <p style="margin-top:20px;">¡Te esperamos en Barbería Elite!</p>
    `;

    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'materialesrampy@gmail.com', // 👈 IMPORTANTE para test
        subject: '✅ Turno confirmado - Barbería Elite',
        html
      });

      console.log("MAIL AUTO ENVIADO CON RESEND");
    } catch (error) {
      console.error("ERROR MAIL AUTO:", error);
    }
  }

  res.json({
    ok: true,
    id: resultado[0].id,
    whatsapp: `https://wa.me/${process.env.WHATSAPP_NUMBER}?text=${encodeURIComponent(
      `Hola Barbería Elite! Quiero reservar un turno\n\nNombre: ${nombreLimpio}\nServicio: ${servicioLimpio}\nFecha: ${new Date(fechaLimpia + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}\nHorario: ${horarioLimpio}\nMedio de pago: ${pagoLimpio}\nNotas: ${notasLimpio || 'Sin notas'}\n\nGracias! Espero su confirmacion.`
    )}`
  });
});

router.patch('/:id', async (req, res) => {
  if (!verificarToken(req, res)) return;
  const { estado } = req.body;

  if (!['confirmado', 'cancelado', 'pendiente'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  const resultado = await pool.query(
    'UPDATE turnos SET estado = $1 WHERE id = $2 RETURNING id',
    [estado, req.params.id]
  );

  if (resultado.rows.length === 0) {
    return res.status(404).json({ error: 'Turno no encontrado' });
  }

  log(`Turno ${req.params.id} cambiado a ${estado}`);

  const estadoNormalizado = estado?.toLowerCase().trim();

  console.log("ESTADO RECIBIDO:", estado);

  if (estadoNormalizado === 'confirmado') {
    const { rows } = await pool.query('SELECT * FROM turnos WHERE id = $1', [req.params.id]);
    const turno = rows[0];

    const token = crypto.createHmac('sha256', process.env.TOKEN_SECRET)
      .update(`${turno.id}|${turno.email}`)
      .digest('hex') + '.' + Buffer.from(`${turno.id}|${turno.email}`).toString('base64');
    const linkCancelar = `${process.env.BASE_URL}/api/turnos/cancelar/${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: turno.email,
      subject: '✅ Turno confirmado - Barbería Elite',
      html: `
        <h2>¡Tu turno está confirmado!</h2>
        <p>Hola <strong>${turno.nombre}</strong>, tu reserva fue confirmada.</p>
        <ul>
          <li><strong>Servicio:</strong> ${turno.servicio}</li>
          <li><strong>Fecha:</strong> ${turno.fecha}</li>
          <li><strong>Horario:</strong> ${turno.horario}</li>
          <li><strong>Pago:</strong> ${turno.pago}</li>
        </ul>
        <p>Si necesitás cancelar tu turno, hacé click acá:</p>
        <a href="${linkCancelar}" style="background:#ef4444;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Cancelar turno</a>
        <p style="margin-top:20px;">¡Te esperamos en Barbería Elite!</p>
      `
    };

    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: turno.email,
        subject: '✅ Turno confirmado - Barbería Elite',
        html: mailOptions.html
      });

      console.log("MAIL ENVIADO CON RESEND");
    } catch (error) {
      console.error("ERROR MAIL:", error);
    }
  }

  res.json({ ok: true });
});

// DELETE /api/turnos/:id
router.delete('/:id', async (req, res) => {
  if (!verificarToken(req, res)) return;
  await pool.query('DELETE FROM turnos WHERE id = $1', [req.params.id]);
  log(`Turno ${req.params.id} eliminado`);
  res.json({ ok: true });
});

// POST /api/turnos/bloqueados/list
router.post('/bloqueados/list', async (req, res) => {
  if (!verificarToken(req, res)) return;
  const { rows } = await pool.query('SELECT * FROM clientes_bloqueados ORDER BY creado_en DESC');
  res.json({ bloqueados: rows });
});

// POST /api/turnos/bloqueados
router.post('/bloqueados', async (req, res) => {
  if (!verificarToken(req, res)) return;
  const { email, telefono, motivo } = req.body;
  await pool.query(
    `INSERT INTO clientes_bloqueados (email, telefono, motivo) VALUES ($1, $2, $3)`,
    [email || '', telefono || '', motivo || '']
  );
  res.json({ ok: true });
});

// DELETE /api/turnos/bloqueados/:id
router.delete('/bloqueados/:id', async (req, res) => {
  if (!verificarToken(req, res)) return;
  await pool.query('DELETE FROM clientes_bloqueados WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;