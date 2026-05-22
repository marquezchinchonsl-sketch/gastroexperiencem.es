exports.handler = async (event) => {
    // Solo permitir POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Método no permitido' };
    }

    // ELIMINADO: Lógica de Resend.
    // MOTIVO: El cliente gestiona todo vía EmailJS desde el frontend (reservas.html y admin.html).
    // Mantener esto activo causaba duplicidad de correos y problemas con cuentas de prueba.

    // Solo logueamos para debug si es necesario
    try {
        const body = JSON.parse(event.body);
        console.log("Webhook recibido (Silenciado):", body.type);
        return { statusCode: 200, body: JSON.stringify({ message: "Webhook processed (No email sent from backend)" }) };
    } catch (e) {
        return { statusCode: 200, body: "{}" };
    }
};
