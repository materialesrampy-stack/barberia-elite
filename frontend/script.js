document.addEventListener('DOMContentLoaded', () => {

    // ===== Bloquear fechas anteriores a hoy =====
    const hoy = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[name="fecha"]').forEach(input => {
        input.setAttribute('min', hoy);
    });


    // ===== Botones desplegables info extra =====
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const extraInfo = btn.nextElementSibling;
            extraInfo.classList.toggle('show');
            btn.textContent = extraInfo.classList.contains('show') ? "Menos info" : "Más info";
        });
    });

    // ===== Botones "Reservar turno" que abren el formulario =====
    const reserveButtons = document.querySelectorAll('.reserve-btn');
    reserveButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.card');
            const form = card.querySelector('.reserve-form');
            if (form) form.classList.toggle('show');
        });
    });


    // ===== Actualizar horarios disponibles según fecha =====
    document.querySelectorAll('input[name="fecha"]').forEach(inputFecha => {
        inputFecha.addEventListener('change', async () => {
            const fecha = inputFecha.value;
            if (!fecha) return;

            const form = inputFecha.closest('.reserve-form');
            const selectHorario = form.querySelector('select[name="horario"]');

            // Resetear opciones
            selectHorario.innerHTML = '<option value="">Cargando...</option>';

            try {
                const res = await fetch(`https://barberia-elite-production.up.railway.app/api/turnos?fecha=${fecha}`);
                const datos = await res.json();
                const ocupados = datos.ocupados || [];

                const todosLosHorarios = [
                    '09:00','09:30','10:00','10:30','11:00','11:30',
                    '12:00','12:30','14:00','14:30','15:00','15:30',
                    '16:00','16:30','17:00','17:30'
                ];

                selectHorario.innerHTML = '<option value="">-- Elegí un horario --</option>';
                const ahora = new Date();
                const esHoy = fecha === ahora.toISOString().split('T')[0];
                const horaActual = ahora.getHours() * 60 + ahora.getMinutes();

                todosLosHorarios.forEach(horario => {
                    if (ocupados.includes(horario)) return;

                    if (esHoy) {
                        const [h, m] = horario.split(':').map(Number);
                        const minutosHorario = h * 60 + m;
                        if (minutosHorario <= horaActual) return;
                    }

                    const option = document.createElement('option');
                    option.value = horario;
                    option.textContent = horario;
                    selectHorario.appendChild(option);
                });

                if (selectHorario.options.length === 1) {
                    selectHorario.innerHTML = '<option value="">Este día no tiene horarios disponibles</option>';
                    selectHorario.disabled = true;
                } else {
                    selectHorario.disabled = false;
                }

            } catch (err) {
                selectHorario.innerHTML = '<option value="">Error al cargar horarios</option>';
            }
        });
    });

    // ===== Botones WhatsApp — ahora con backend =====
    const sendWspButtons = document.querySelectorAll('.send-wsp');
    sendWspButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const form = btn.closest('.reserve-form');
            const nombre = form.querySelector('input[name="nombre"]').value.trim();
            const email = form.querySelector('input[name="email"]').value.trim();
            const telefonoRaw = form.querySelector('input[name="telefono"]').value.trim();
            const telefono = '549' + telefonoRaw.replace(/\D/g, '');
            const pago = form.querySelector('.pago')?.value || '';
            const notas = form.querySelector('.notas')?.value || '';
            const servicio = form.closest('.card').querySelector('h3')?.textContent || 'Servicio';
            const fecha = form.querySelector('input[name="fecha"]')?.value || '';
            const horario = form.querySelector('select[name="horario"]')?.value || '';

            if (!nombre || !email || !telefono || !fecha || !horario) {
                alert('Por favor completá todos los campos obligatorios');
                return;
            }

            btn.textContent = 'Enviando...';
            btn.disabled = true;

            try {
                const respuesta = await fetch('https://barberia-elite-production.up.railway.app/api/turnos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, email, telefono, servicio, fecha, horario, pago, notas })
                });

                const datos = await respuesta.json();

                if (!respuesta.ok) {
                    alert('Error: ' + datos.error);
                    btn.textContent = 'Confirmar por WhatsApp';
                    btn.disabled = false;
                    return;
                }

                // Abrir WhatsApp con los datos
                window.open(datos.whatsapp, '_blank');
                alert('✅ Turno reservado!\n\nRecibirás un mail de confirmación una vez que verifiquemos tu pago (transferencia) o confirmemos tu pedido.\n\n¡Gracias!');
                form.classList.remove('show');
                form.querySelectorAll('input').forEach(i => i.value = '');

            } catch (err) {
                alert('No se pudo conectar con el servidor. ¿Está corriendo node server.js?');
                btn.textContent = 'Confirmar por WhatsApp';
                btn.disabled = false;
            }
        });
    });

     // ===== Promo =====
        const promo = document.querySelector('.promo-animada');
    window.addEventListener('scroll', () => {
        const top = promo.getBoundingClientRect().top;
        const height = window.innerHeight;
        if (top < height - 100) {
            promo.classList.add('visible');
        }
    });


    // ===== Carrusel =====
        const track = document.querySelector('.carousel-track');

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        const offset = 100; // espacio desde arriba
        const bodyRect = document.body.getBoundingClientRect().top;
        const targetRect = target.getBoundingClientRect().top;
        const targetPos = targetRect - bodyRect - offset;
        window.scrollTo({
            top: targetPos,
            behavior: 'smooth'
        });
    });
    });

    document.addEventListener("DOMContentLoaded", () => {
        const toggle = document.getElementById("menu-toggle");
        const nav = document.querySelector(".nav-links");

        toggle.addEventListener("click", () => {
            nav.classList.toggle("active");
        });
    });


});