// =================================================================
// 1. IMPORTACIONES Y SISTEMA
// =================================================================
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const express = require('express');

require('dotenv').config();

// Fetch nativo (Node 18+) o node-fetch como fallback
const fetchFn = globalThis.fetch
    ? (...args) => globalThis.fetch(...args)
    : (() => {
        try { return require('node-fetch'); }
        catch { return (...args) => import('node-fetch').then(({ default: f }) => f(...args)); }
    })();

// Archivo de respaldo local
const COMPLETED_FILE = path.join(__dirname, 'ejecutivos_guardados.json');

// Memoria para el panel web (guarda los últimos 200 eventos)
const systemLogs = [];
const MAX_LOGS = 200;

// =================================================================
// 2. ZONA DE EDICIÓN: CONFIGURACIÓN Y FLUJO
// =================================================================

// --- A. CONFIGURACIÓN GENERAL ---
const config = {
    sessionTimeout: 30,
    adminNumbers: ['56912345678'], // TU NÚMERO AQUÍ

    // URL de Google Apps Script (termina en /exec)
    googleScriptUrl: 'https://script.google.com/macros/s/AKfycbxJy6kVLgDEhRGtgyrA4Y-KyV4pMO4aPd2BWE6HIHz2HVFcEsgqU0kJAy8W7ruc4zHBlQ/exec',

    links: {
        formulario: 'https://freeworkweb.cl/datosbank',
        ventas: 'https://www.freeworkweb.cl/descarga',
        condicionesEntel: 'https://www.flipsnack.com/entelcatalogo/fav/full-view.html', // ← NUEVO LINK
    },

    contacto: '56912345678',

    // Archivos de bienvenida
    filesToSend: [
        { path: './docs/entel_baner.png' },
      //  { path: './docs/entel_condiciones.pdf', caption: '📄 ENTEL Hogar – Condiciones comerciales' },
       // { path: './docs/entel_foto_1.png', caption: 'https://sites.google.com/view/wf-planes-entel/valores' },
       // { path: './docs/entel_foto_1.png', caption: 'https://sites.google.com/view/wf-planes-entel/valores' },
        { path: './docs/entel_foto_2.png', caption: '✨ cobertura' },
        { path: './docs/wom_baner.png' },
        { path: './docs/wom_condiciones.png', caption: '📄 WOM Hogar – Condiciones comerciales' },
        { path: './docs/wom_comunas.jpg', caption: '🗺️ Comunas factibles WOM' },
        { path: './docs/wom_foto_1.png', caption: '📷 Promoción WOM 1' }
    ]
};

// --- B. DICCIONARIO ---
const userIntents = {
    'SÍ': ['si', 'sí', 'claro', 'ok', 'dale', 'bueno', 'me interesa', 'yo quiero', 'por supuesto', 'adelante', 'yes', 'vale', 'perfecto'],
    'NO': ['no', 'no gracias', 'nop', 'cancelar', 'basta', 'salir', 'chao', 'adiós', 'bye', 'no quiero'],
    'QUIERO_EMPEZAR': ['quiero comenzar', 'comenzar', 'empezar', 'dale vamos', 'iniciar', 'proceder', 'vamos', 'avancemos'],
    'LISTO': ['listo', 'ya', 'terminé', 'ok listo', 'listo todo', 'siguiente', 'revisé', 'listo sigamos'],
    'FORMULARIO_LISTO': ['formulario listo', 'ya completé', 'listo formulario', 'enviado', 'formulario enviado', 'completé el formulario'],
    'COMANDOS': ['comandos', 'comando', 'menu', 'menú', 'opciones', 'ayuda', 'help', 'funciones'],
    'SOPORTE': ['soporte', 'ayuda', 'problema', 'consultar', 'preguntar', 'duda'],
    'CONDICIONES': ['condiciones', 'material', 'documentos', 'info', 'información'],
    'VENTAS': ['ventas', 'ingresar venta', 'link ventas', 'formulario ventas'],
    'PAGOS': ['pagos', 'pago', 'cuándo pagan', 'viernes', 'comisión'],
    'FACTIBILIDAD': ['factibilidad', 'cobertura', 'zona', 'dirección', 'comuna']
};

// --- C. FLUJO DE CONVERSACIÓN ---
async function handleUserFlow(client, chatId, messageBody, currentState, userStates) {
    const name = await BotUtils.getFirstName(client, chatId);
    const send = async (msg, delay = 1500) => await BotUtils.sendMessageWithEffects(client, chatId, msg, { typingDelay: delay });

    // PASO 1: SALUDO CÁLIDO + OPORTUNIDAD
    if (currentState === 'awaiting_msg_1_reply') {
        const respuesta = BotUtils.validateResponse(messageBody, ['SÍ', 'NO']);

        if (respuesta === 'SÍ') {
            await send(`¡Me alegra mucho tu interés, ${name}! 😊`, 1200);
            await send(`Veo que eres una persona proactiva, eso es excelente. Déjame contarte sobre esta gran oportunidad:`, 1800);
            await send(`🌟 *OPORTUNIDAD EXCLUSIVA* 🌟

💜 *WOM Hogar*: ¡Comisión de $45.000 por venta!
🧡 *Entel Hogar*: Comisión de $40.000 por venta
💰 *Pagos semanales*: Todos los viernes sin falta
📈 *Crecimiento profesional*: Posibilidad de contrato
🏠 *Trabajo remoto*: Desde tu casa u oficina

¿Te gustaría conocer más detalles sobre cómo trabajar con nosotros?
👉 Responde: *SÍ* para continuar o *NO* si no es el momento`, 3000);
            userStates.setState(chatId, 'awaiting_msg_2_reply');

        } else if (respuesta === 'NO') {
            await send(`Entiendo completamente, ${name}. A veces el timing no es el adecuado.`, 1500);
            await send(`Si cambias de opinión más adelante, estaré aquí para ayudarte. ¡Te deseo mucho éxito! 💫`, 2000);
            userStates.deleteState(chatId);
        } else {
            await send(`Disculpa ${name}, no logré entender. ¿Te interesa? Responde *SÍ* o *NO*.`);
        }
    }

    // PASO 2: EXPLICACIÓN DETALLADA
    else if (currentState === 'awaiting_msg_2_reply') {
        const respuesta = BotUtils.validateResponse(messageBody, ['SÍ', 'NO']);

        if (respuesta === 'SÍ') {
            await send('¡Excelente decisión! 🎉', 1200);
            await send(`Me encanta tu actitud, ${name}. Esta es una oportunidad real de crecimiento.`, 1800);
            await send(`📋 *DETALLES DEL TRABAJO:*

• *Modalidad freelance*: Tú manejas tus horarios
• *Trabajo 100% remoto*: Desde donde prefieras
• *Capacitación incluida*: Te preparamos para el éxito
• *Soporte constante*: Equipo siempre disponible
• *Comisiones altas*: Entre las mejores del mercado
• *Pagos puntuales*: Viernes sin excusas

Es una oportunidad genuina para generar ingresos estables.`, 3500);
            await send(`¿Listo(a) para conocer los pasos concretos para comenzar?
👉 Responde: *QUIERO COMENZAR*`, 2000);
            userStates.setState(chatId, 'awaiting_msg_3_reply');

        } else if (respuesta === 'NO') {
            await send('Comprendo, cada persona tiene su momento. ¡Estaré aquí si cambias de opinión! 👋');
            userStates.deleteState(chatId);
        }
    }

    // PASO 3: ENVÍO DE PAQUETE DE BIENVENIDA
    else if (currentState === 'awaiting_msg_3_reply') {
        const respuesta = BotUtils.validateResponse(messageBody, ['QUIERO_EMPEZAR', 'NO']);

        if (respuesta === 'QUIERO_EMPEZAR') {
            await send(`¡Fantástico, ${name}! 🚀`, 1000);
            await send('Veo que tienes determinación, esa es la actitud que buscamos.', 1800);
            await send('Ahora voy a enviarte todo el material de apoyo inicial...', 2000);
            await send('📦 *Enviando paquete de bienvenida...*', 1500);
            await BotUtils.sendFilesFromConfig(client, chatId, config.filesToSend);
            await send('✅ *Material enviado completo*', 1200);
            await send(`📱 *¡HAGAMOS LAS COSAS MÁS FÁCILES!* 🌟\nPara que tengas el control total de tus ganancias, toda tu gestión de ventas, pagos y soporte se realizará a través de nuestra aplicación exclusiva: *Freework App*. ¡Es súper fácil de usar!`, 3000);
            await send(`📝 *¿CÓMO SEGUIMOS?*\n1️⃣ Revisa con calma el material que te envié.\n2️⃣ Cuando termines de leerlo y estés listo(a) para el siguiente paso, escríbeme la palabra: *LISTO* 🚀`, 2500);
            userStates.setState(chatId, 'awaiting_msg_4_reply');

        } else if (respuesta === 'NO') {
            await send('No hay problema. La decisión es totalmente tuya. ¡Mucha suerte! ✨');
            userStates.deleteState(chatId);
        }
    }

    // PASO 4: REGISTRO OFICIAL Y APP FREEWORK
    else if (currentState === 'awaiting_msg_4_reply') {
        if (BotUtils.validateResponse(messageBody, ['LISTO'])) {
            await send('¡Perfecto! 👏', 1000);
            await send('Para activar tu cuenta y que empieces a ganar comisiones, solo nos faltan estos *dos últimos pasitos*:', 1800);
            await send(`💳 *PASO 1: TUS DATOS DE PAGO*\nLlena este formulario seguro con la cuenta donde quieres recibir tus pagos (¡todos los viernes! 💰):\n👉 ${config.links.formulario}`, 2500);
            await send(`📲 *PASO 2: DESCARGA LA APP FREEWORK*\nAquí es donde ocurre la magia ✨. Para ingresar tus ventas, ver coberturas y hablar con soporte:`, 2000);

            // Envío de imagen de la app
            try {
                if (fs.existsSync('./docs/imagenapp.png')) {
                    const media = MessageMedia.fromFilePath('./docs/imagenapp.png');
                    await client.sendMessage(chatId, media);
                    BotUtils.logInteraction(chatId, '[Archivo] imagenapp.png', 'OUT');
                    await BotUtils.delay(1000);
                } else {
                    console.log('⚠️ No se encontró la imagen en ./docs/imagenapp.png');
                }
            } catch (e) {
                console.error('Error enviando imagenapp.png', e);
            }

            await send(`👉 Descárgala desde este link:\n${config.links.ventas}`, 2000);
            await send(`Una vez que hayas completado ambos pasos, escríbeme:\n👉 *FORMULARIO LISTO*\n\n¡Ya casi eres parte del equipo! 🙌`);
            userStates.setState(chatId, 'awaiting_msg_5_reply');
        }
    }

    // PASO 5: FINALIZACIÓN Y GUARDADO
    else if (currentState === 'awaiting_msg_5_reply') {
        if (BotUtils.validateResponse(messageBody, ['FORMULARIO_LISTO'])) {
            await send('¡Excelente! 🎊', 1200);
            await send('*Registro completado correctamente* ✅', 1500);
            await send(`¡Felicidades ${name}! Has completado exitosamente todo el proceso de incorporación. 🥳`, 1800);
            await send(`🚀 *¿QUÉ SIGUE AHORA?*\n1️⃣ Abre la App Freework en tu celular.\n2️⃣ Regístrate o inicia sesión.\n3️⃣ ¡Y listo! Ya puedes empezar a ingresar ventas y consultar coberturas directamente desde ahí.`, 3000);
            await send(`Recuerda que dentro de la App tienes a un Bot súper inteligente y a nuestro equipo de soporte listos para ayudarte en lo que necesites. ¡Te deseo el mayor de los éxitos, ${name}! 🎉💪`, 2500);

            // Guardado automático
            PersistenceUtils.saveCompletedUser(chatId, name);
            const phone = BotUtils.extractPhone(chatId);
            GoogleSheetUtils.sendToSheet(name, phone, chatId);
            userStates.setState(chatId, 'completed', { formCompletedAt: new Date().toISOString() });
        }
    }
}

// --- D. MENÚ POST-VENTA ---
async function handlePostFormCommands(client, chatId, messageBody) {
    const name = await BotUtils.getFirstName(client, chatId);
    const send = async (msg) => await BotUtils.sendMessageWithEffects(client, chatId, msg, { typingDelay: 1200 });
    const command = BotUtils.validateResponse(messageBody, ['CONDICIONES', 'FACTIBILIDAD', 'PAGOS', 'VENTAS', 'SOPORTE', 'ESTADO', 'COMANDOS']);

    if (command === 'CONDICIONES') {
        await send(`¡Claro que sí, ${name}! 😊`);
        await send('Te envío nuevamente todo el material de apoyo inicial:');
        await BotUtils.sendFilesFromConfig(client, chatId, config.filesToSend);
        await send(`📲 *Recuerda:* Toda tu gestión diaria la hacemos en la App Freework: ${config.links.ventas}`);

    } else if (command === 'FACTIBILIDAD' || command === 'VENTAS' || command === 'ESTADO' || command === 'SOPORTE') {
        await send(`📲 *¡Todo tu negocio en un solo lugar, ${name}!* 🌟`);
        await send(`Recuerda que para consultar factibilidades, ingresar tus ventas, ver tus ganancias o hablar con soporte, usamos directamente nuestra *App Freework*.`);
        await send(`¡Allí tenemos un bot especializado y a nuestros asesores listos para apoyarte en tiempo real! 🚀\n\nSi por alguna razón la borraste o no la tienes, te dejo el link de descarga aquí abajito:\n👉 ${config.links.ventas}`);

    } else if (command === 'PAGOS') {
        await send(`💵 *¡TUS PAGOS!* 💰`);
        await send(`• *¿Cuándo?* Todos los viernes (tarde-noche) 🎉\n• *¿Cómo?* Transferencia directa a tu cuenta registrada\n• *Tus Comisiones:* WOM $45.000 / Entel $40.000\n\n*Nota:* Si en algún momento necesitas cambiar tus datos bancarios, escríbenos por el soporte ¡directamente dentro de la App Freework! 😉`);

    } else if (command === 'COMANDOS') {
        await send(`🎮 *MENÚ RÁPIDO - ¡Hola ${name}!* ✨\nEstas son las funciones de este bot de bienvenida:\n\n📋 *CONDICIONES* - Ver material comercial\n💰 *PAGOS* - Info de comisiones\n🌍 *FACTIBILIDAD* - Dónde consultar\n🔗 *VENTAS* - Dónde ingresar\n\n💡 *Súper Tip:* Tu operación diaria (ingresar ventas, ver coberturas, pedir ayuda) se realiza 100% en tu *App Freework*. ¡Nos vemos por allá! 🚀`);

    } else {
        // FALLBACK: mensaje no reconocido en estado completed
        await send(`No entendí tu mensaje, ${name} 😊\nEscribe *COMANDOS* para ver todas las opciones disponibles.`);
    }
}

// =================================================================
// 3. MOTOR TÉCNICO Y SERVIDOR WEB
// =================================================================

// --- UTILIDADES GOOGLE SHEETS (con AbortController correcto) ---
class GoogleSheetUtils {
    static async sendToSheet(name, phone, chatId) {
        if (!config.googleScriptUrl) {
            console.log('⚠️ [SHEETS] URL no configurada.');
            return;
        }

        const data = {
            nombre: name,
            telefono: phone,
            chatId: chatId,
            fecha: new Date().toLocaleString(),
            source: 'whatsapp-bot-railway'
        };

        console.log(`📤 [SHEETS] Enviando datos de ${name}...`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetchFn(config.googleScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: controller.signal
            });

            clearTimeout(timer);
            const responseText = await response.text();

            if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
                console.error('❌ [SHEETS] El script devolvió HTML - Revisa permisos de despliegue');
                return;
            }

            try {
                const result = JSON.parse(responseText);
                if (result.status === 'success') {
                    console.log(`✅ [SHEETS] ¡Guardado en Google Sheets!`);
                } else {
                    console.log(`⚠️ [SHEETS] Error:`, result.message);
                }
            } catch (jsonError) {
                console.error('❌ [SHEETS] No es JSON válido:', responseText.substring(0, 100));
            }

        } catch (error) {
            clearTimeout(timer);
            if (error.name === 'AbortError') {
                console.error('⚠️ [SHEETS] Timeout: la petición tardó más de 30 segundos.');
            } else {
                console.error('⚠️ [SHEETS] Error de conexión:', error.message);
            }
        }
    }
}

// --- UTILIDADES DE PERSISTENCIA LOCAL ---
class PersistenceUtils {
    static saveCompletedUser(chatId, name) {
        let users = [];
        try {
            if (fs.existsSync(COMPLETED_FILE)) users = JSON.parse(fs.readFileSync(COMPLETED_FILE));
        } catch (e) { users = []; }

        const phone = BotUtils.extractPhone(chatId);
        const index = users.findIndex(u => u.phone === phone);
        const newUser = { phone, chatId, name, date: new Date().toISOString(), lastUpdate: new Date().toLocaleString() };

        if (index === -1) users.push(newUser);
        else users[index] = newUser;

        try {
            fs.writeFileSync(COMPLETED_FILE, JSON.stringify(users, null, 2));
            console.log(`💾 [JSON] Usuario guardado: ${name}`);
        } catch (e) {
            console.error('Error escribiendo JSON:', e);
        }
    }

    static isUserCompleted(chatId) {
        try {
            if (fs.existsSync(COMPLETED_FILE)) {
                const users = JSON.parse(fs.readFileSync(COMPLETED_FILE));
                return users.some(u => u.phone === BotUtils.extractPhone(chatId));
            }
        } catch (e) { }
        return false;
    }

    static getAllCompletedUsers() {
        try {
            if (fs.existsSync(COMPLETED_FILE)) return JSON.parse(fs.readFileSync(COMPLETED_FILE));
        } catch (e) { }
        return [];
    }
}

// --- UTILIDADES GENERALES ---
class BotUtils {
    static delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    static async sendMessageWithEffects(client, chatId, msg, options = {}) {
        try {
            if (options.useTyping !== false) {
                try {
                    const chat = await client.getChatById(chatId);
                    await chat.sendStateTyping();
                    await this.delay(options.typingDelay || 1500);
                } catch (typingErr) {
                    // Silencioso: el typing falló pero el mensaje igual se envía
                }
            }
            await client.sendMessage(chatId, msg);
            this.logInteraction(chatId, msg.replace(/\n/g, ' ').substring(0, 60) + '...', 'OUT');
        } catch (e) {
            console.error(`❌ Error crítico al enviar mensaje a ${chatId}:`, e.message);
        }
    }

    static async sendFilesFromConfig(client, chatId, files) {
        if (!files || files.length === 0) return;
        for (const file of files) {
            if (fs.existsSync(file.path)) {
                try {
                    const media = MessageMedia.fromFilePath(file.path);
                    await client.sendMessage(chatId, media, { caption: file.caption });
                    this.logInteraction(chatId, `[Archivo] ${file.path}`, 'OUT');
                    await this.delay(1000);
                } catch (e) {
                    console.error(`❌ Error al enviar archivo ${file.path}:`, e.message);
                }
            } else {
                console.log(`⚠️ Archivo no encontrado: ${file.path}`);
            }
        }
    }

    static validateResponse(msg, intents) {
        if (!msg) return null;
        const m = msg.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        for (let k of intents) {
            if (userIntents[k]?.some(i =>
                m.includes(i.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
            )) return k;
        }
        return null;
    }

    static isAdmin(chatId) {
        const cleanId = this.extractPhone(chatId);
        return config.adminNumbers.some(n => cleanId.includes(n));
    }

    static extractPhone(chatId) { return chatId.split('@')[0]; }

    static async getFirstName(client, chatId) {
        try {
            const contact = await client.getContactById(chatId);
            return (contact.pushname || contact.name || 'Amigo').split(' ')[0];
        } catch (e) {
            return 'Amigo';
        }
    }

    static logInteraction(chatId, msg, dir = 'INFO') {
        const color = dir === 'OUT' ? '\x1b[32m' : '\x1b[36m';
        const time = new Date().toLocaleTimeString();
        const phone = this.extractPhone(chatId);
        
        // Console Log
        console.log(`${color}[${time}] [${dir}] ${phone}: ${msg}\x1b[0m`);
        
        // Memory Log for Web Panel
        systemLogs.unshift({ time, dir, phone, msg });
        if (systemLogs.length > MAX_LOGS) systemLogs.pop();
    }
}

// --- GESTOR DE ESTADO EN MEMORIA ---
class UserStateManager {
    constructor() {
        this.states = new Map();
        this.stateFilePath = path.join(__dirname, 'bot_state.json');
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                this.states = new Map(JSON.parse(fs.readFileSync(this.stateFilePath)));
            }
        } catch (e) { this.states = new Map(); }
    }

    save() {
        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(() => {
            try {
                fs.writeFileSync(this.stateFilePath, JSON.stringify(Array.from(this.states.entries())));
            } catch (e) { console.error('Error guardando estado:', e); }
        }, 1500);
    }

    setState(id, state, data = {}) {
        this.states.set(id, { state, data: { ...(this.states.get(id)?.data || {}), ...data }, ts: Date.now() });
        this.save();
    }

    getState(id) { return this.states.get(id)?.state; }
    getUserData(id) { return this.states.get(id)?.data; }
    deleteState(id) { this.states.delete(id); this.save(); }
    getActiveUsersCount() { return this.states.size; }
    getAllUsers() { return Array.from(this.states.entries()); }

    cleanupOldStates() {
        const now = Date.now();
        for (const [id, state] of this.states.entries()) {
            if (now - state.ts > 86400000) this.states.delete(id);
        }
        this.save();
    }
}

const userStates = new UserStateManager();
setInterval(() => userStates.cleanupOldStates(), 3600000);

// --- COMANDOS DE ADMIN ---
async function handleAdminCommand(client, message, chatId) {
    const body = message.body.trim();
    const cmd = body.split(' ')[0].toLowerCase();
    const args = body.substring(cmd.length).trim();

    if (cmd === '!estado') {
        const users = userStates.getActiveUsersCount();
        const totalSaved = PersistenceUtils.getAllCompletedUsers().length;
        await client.sendMessage(chatId, `🤖 *ESTADO*\n✅ Online\n👥 En conversación: ${users}\n💾 En JSON/Sheets: ${totalSaved}\n⏱️ Uptime: ${Math.floor(process.uptime() / 60)} min`);

    } else if (cmd === '!reset') {
        if (!args) return client.sendMessage(chatId, '❌ Uso: !reset 569...');
        const target = args.includes('@') ? args : `${args}@c.us`;
        userStates.deleteState(target);
        await client.sendMessage(chatId, `✅ Usuario ${args} reiniciado.`);

    } else if (cmd === '!completado') {
        const name = await BotUtils.getFirstName(client, chatId);
        const phone = BotUtils.extractPhone(chatId);
        PersistenceUtils.saveCompletedUser(chatId, name);
        GoogleSheetUtils.sendToSheet(name, phone, chatId);
        userStates.setState(chatId, 'completed', { completado_manual: true });
        await client.sendMessage(chatId, `✅ *COMPLETADO MANUALMENTE*`);

    } else if (cmd === '!exportar') {
        const users = PersistenceUtils.getAllCompletedUsers();
        if (users.length === 0) return client.sendMessage(chatId, '📭 Vacío.');
        const csv = "Nombre,Telefono,Fecha,ChatID\n" +
            users.map(u => `"${u.name}","${u.phone}","${u.date}","${u.chatId}"`).join('\n');
        const p = path.join(__dirname, 'lista.csv');
        fs.writeFileSync(p, csv);
        await client.sendMessage(chatId, MessageMedia.fromFilePath(p), { caption: '📊 Tu lista' });
        fs.unlinkSync(p);

    } else if (cmd === '!broadcast') {
        if (!args) return client.sendMessage(chatId, '❌ Uso: !broadcast <mensaje>');
        // Confirmación de seguridad: requiere prefijo CONFIRM:
        if (!args.startsWith('CONFIRM:')) {
            return client.sendMessage(chatId, `⚠️ Para enviar un broadcast, usa:\n!broadcast CONFIRM:<mensaje>\n\nEjemplo:\n!broadcast CONFIRM:Hola a todos, hay novedades esta semana.`);
        }
        const realMsg = args.replace('CONFIRM:', '').trim();
        const targets = [...new Set([
            ...PersistenceUtils.getAllCompletedUsers().map(u => u.chatId),
            ...userStates.getAllUsers().map(u => u[0])
        ])];
        await client.sendMessage(chatId, `📢 Enviando a ${targets.length} usuarios...`);
        let enviados = 0;
        for (const t of targets) {
            try {
                await client.sendMessage(t, `📢 *ANUNCIO:*\n${realMsg}`);
                enviados++;
                await BotUtils.delay(1500); // Delay más conservador para evitar ban
            } catch (e) {
                console.error(`Error enviando broadcast a ${t}:`, e.message);
            }
        }
        await client.sendMessage(chatId, `✅ Broadcast completado. Enviado a ${enviados}/${targets.length} usuarios.`);

    } else if (cmd === '!help') {
        await client.sendMessage(chatId, `🛠 *COMANDOS ADMIN*\n\n!estado - Ver estado del bot\n!reset <num> - Reiniciar usuario\n!completado - Marcar como completado\n!exportar - Exportar lista CSV\n!broadcast CONFIRM:<msg> - Envío masivo\n!help - Este menú`);
    }
}

// --- SERVIDOR WEB ---
const app = express();
const PORT = process.env.PORT || 3000;
let currentQRImage = null;
let qrTimestamp = null;
let connectionStatus = 'Esperando QR...';

app.set('trust proxy', 1);
app.use(express.json());

app.get('/qr', (req, res) => {
    if (!currentQRImage) {
        return res.send(getHtmlTemplate('🔴 Bot WhatsApp - Esperando QR', connectionStatus, true, 'waiting'));
    }
    if (currentQRImage === 'CONNECTED') {
        return res.send(getHtmlTemplate('🟢 Bot WhatsApp - Conectado', '✅ Sistema operativo y listo', false, 'connected'));
    }
    res.send(getHtmlQR('QR Actualizado: ' + new Date(qrTimestamp).toLocaleTimeString()));
});

app.get('/qr-image', (req, res) => {
    if (!currentQRImage || currentQRImage === 'CONNECTED') return res.status(404).send('QR no disponible');
    const img = Buffer.from(currentQRImage, 'base64');
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': img.length, 'Cache-Control': 'no-cache' });
    res.end(img);
});

app.get('/status', (req, res) => {
    res.json({
        status: currentQRImage === 'CONNECTED' ? 'connected' : 'waiting',
        qrGenerated: !!currentQRImage && currentQRImage !== 'CONNECTED',
        timestamp: qrTimestamp,
        activeUsers: userStates.getActiveUsersCount(),
        registeredUsers: PersistenceUtils.getAllCompletedUsers().length,
        uptime: process.uptime()
    });
});

// NUEVAS RUTAS PARA EL PANEL EN VIVO
app.get('/panel', (req, res) => {
    res.send(getHtmlPanel());
});

app.get('/api/logs', (req, res) => {
    res.json(systemLogs);
});

app.listen(PORT, () => console.log(`🌐 Servidor Web iniciado en puerto ${PORT}`));

// --- CLIENTE WHATSAPP ---
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "bot-railway" }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-site-isolation-trials',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    }
});

client.on('qr', qr => {
    connectionStatus = '🔴 Escanea el QR con WhatsApp';
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) {
            currentQRImage = url.split(',')[1];
            qrTimestamp = Date.now();
            console.log(`📱 QR generado. Escanea en: http://localhost:${PORT}/qr`);
        }
    });
});

client.on('ready', () => {
    console.log('✅ Bot conectado y listo');
    currentQRImage = 'CONNECTED';
    connectionStatus = '🟢 Conectado y operativo';
});

client.on('disconnected', (reason) => {
    console.log('⚠️ Bot desconectado:', reason);
    currentQRImage = null;
    connectionStatus = '🔴 Desconectado - Reiniciando...';
});

// Evento: mensajes enviados desde el propio número (host)
client.on('message_create', async msg => {
    if (msg.fromMe && msg.body.trim().toLowerCase() === '!guardar') {
        const chatId = msg.to;
        const name = await BotUtils.getFirstName(client, chatId);
        const phone = BotUtils.extractPhone(chatId);
        PersistenceUtils.saveCompletedUser(chatId, name);
        GoogleSheetUtils.sendToSheet(name, phone, chatId);
        userStates.setState(chatId, 'completed', { savedBy: 'host' });
        await client.sendMessage(chatId, `✅ *SISTEMA:* Ejecutivo activo con *ÉXITO*.`);
    }
});

// Evento: mensajes entrantes
client.on('message', async msg => {
    if (msg.isGroup) return;

    const chatId = msg.from;
    const body = msg.body.trim();

    // Comando de activación manual (reinicia el flujo)
    if (body.toLowerCase() === '!activar') {
        const name = await BotUtils.getFirstName(client, chatId);
        userStates.deleteState(chatId);
        await BotUtils.sendMessageWithEffects(client, chatId,
            `¡Hola ${name}! 👋\n\nEstamos reclutando ejecutivos para ENTEL y WOM.\n\n¿Te interesa?\n👉 Responde: *SÍ* o *NO*`,
            { typingDelay: 2000 }
        );
        userStates.setState(chatId, 'awaiting_msg_1_reply');
        return;
    }

    // Comandos admin
    if (BotUtils.isAdmin(chatId) && body.startsWith('!')) {
        await handleAdminCommand(client, msg, chatId);
        return;
    }

    BotUtils.logInteraction(chatId, body, 'IN');
    let state = userStates.getState(chatId);

    // Si no está en memoria pero sí en JSON, restaurar como completed
    if (!state && PersistenceUtils.isUserCompleted(chatId)) {
        state = 'completed';
        userStates.setState(chatId, 'completed');
    }

    // Nuevo usuario: iniciar flujo
    if (!state) {
        const name = await BotUtils.getFirstName(client, chatId);
        await BotUtils.sendMessageWithEffects(client, chatId,
            `¡Hola ${name}! 👋\n\nEstamos reclutando ejecutivos para ENTEL y WOM.\n\n¿Te interesa?\n👉 Responde: *SÍ* o *NO*`,
            { typingDelay: 2000 }
        );
        userStates.setState(chatId, 'awaiting_msg_1_reply');
        return;
    }

    // Despachar según estado
    if (state === 'completed') {
        await handlePostFormCommands(client, chatId, body);
    } else {
        await handleUserFlow(client, chatId, body, state, userStates);
    }
});

// Inicializar bot
console.log('🚀 Iniciando Bot Unificado...');
client.initialize().catch(err => {
    console.error("❌ Error grave al inicializar Puppeteer:", err);
    process.exit(1);
});

// Manejo limpio de cierre
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando bot de forma segura...');
    try { await client.destroy(); } catch (e) { }
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Excepción no capturada:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
});

// =================================================================
// 4. PLANTILLAS HTML
// =================================================================

function getHtmlTemplate(title, msg, spinner, status) {
    const bgColor = status === 'connected' ? '#4CAF50' : status === 'waiting' ? '#FF9800' : '#2196F3';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta http-equiv="refresh" content="10"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.container{background:white;padding:40px 30px;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.1);text-align:center;max-width:500px;width:100%}.status-indicator{width:20px;height:20px;border-radius:50%;background:${bgColor};margin:0 auto 20px;box-shadow:0 0 20px ${bgColor};animation:pulse 2s infinite}h1{color:#333;margin-bottom:15px;font-size:24px;font-weight:600}.message{color:#666;font-size:16px;line-height:1.5;margin-bottom:25px}.spinner{border:4px solid #f3f3f3;border-top:4px solid #25D366;border-radius:50%;width:50px;height:50px;animation:spin 1.5s linear infinite;margin:20px auto}.stats{background:#f8f9fa;padding:15px;border-radius:10px;margin-top:20px;border-left:4px solid #25D366}.stats p{margin:5px 0;color:#555;font-size:14px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}@keyframes pulse{0%{transform:scale(1);opacity:1}50%{transform:scale(1.1);opacity:0.7}100%{transform:scale(1);opacity:1}}.logo{font-size:48px;margin-bottom:15px}.railway-badge{background:#0B0D0E;color:white;padding:5px 10px;border-radius:5px;font-size:12px;margin-bottom:10px;display:inline-block}</style></head><body><div class="container"><div class="railway-badge">🚄 RAILWAY</div><div class="logo">🤖</div><div class="status-indicator"></div><h1>${title}</h1><div class="message">${msg}</div>${spinner ? '<div class="spinner"></div>' : ''}<div class="stats"><p><strong>Usuarios activos:</strong> ${userStates.getActiveUsersCount()}</p><p><strong>Registrados total:</strong> ${PersistenceUtils.getAllCompletedUsers().length}</p><p><strong>Última actualización:</strong> ${new Date().toLocaleTimeString()}</p></div><p style="margin-top:20px;color:#888;font-size:12px">Actualización automática cada 10 segundos</p></div></body></html>`;
}

function getHtmlQR(time) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>🤖 Escanear QR</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.container{background:white;padding:40px 30px;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.1);text-align:center;max-width:500px;width:100%}.logo{font-size:48px;margin-bottom:15px}h1{color:#333;margin-bottom:10px;font-size:24px;font-weight:600}.subtitle{color:#666;margin-bottom:30px;font-size:16px}.qr-container{background:#f8f9fa;padding:25px;border-radius:15px;margin:20px 0;border:2px dashed #ddd}.qr-image{max-width:300px;width:100%;height:auto;border:1px solid #e0e0e0;border-radius:10px;padding:10px;background:white}.instructions{background:#e8f5e8;padding:15px;border-radius:10px;margin:20px 0;text-align:left;border-left:4px solid #25D366}.instructions ol{margin-left:20px;color:#555}.instructions li{margin-bottom:8px}.btn{background:#25D366;color:white;border:none;padding:12px 30px;border-radius:25px;cursor:pointer;font-size:16px;font-weight:600;transition:all 0.3s ease;margin:10px 5px}.btn:hover{background:#1da851;transform:translateY(-2px);box-shadow:0 5px 15px rgba(37,211,102,0.3)}.status-info{color:#666;margin:15px 0;font-size:14px}.pulse{animation:pulse 2s infinite}.railway-badge{background:#0B0D0E;color:white;padding:5px 10px;border-radius:5px;font-size:12px;margin-bottom:10px;display:inline-block}@keyframes pulse{0%{opacity:1}50%{opacity:0.7}100%{opacity:1}}</style></head><body><div class="container"><div class="railway-badge">🚄 RAILWAY</div><div class="logo">📱</div><h1>Escanear Código QR</h1><div class="subtitle">Para conectar el Bot de WhatsApp</div><div class="qr-container"><img src="/qr-image" class="qr-image pulse" alt="Código QR WhatsApp"/></div><div class="status-info"><strong>Estado:</strong> <span style="color:#FF9800">⏳ Esperando escaneo...</span><br><strong>Actualizado:</strong> ${time}</div><div class="instructions"><strong>📋 Instrucciones:</strong><ol><li>Abre WhatsApp en tu teléfono</li><li>Toca los <strong>tres puntos</strong> → <strong>Dispositivos vinculados</strong></li><li>Toca <strong>Vincular un dispositivo</strong></li><li>Escanear este código QR</li><li>¡Listo! El bot estará activo</li></ol></div><div><button class="btn" onclick="location.reload()">🔄 Actualizar QR</button></div><p style="margin-top:20px;color:#888;font-size:12px">Esta página se actualiza automáticamente • Railway</p></div><script>setTimeout(()=>{location.reload()},15000)</script></body></html>`;
}

// HTML DEL PANEL DE LOGS EN VIVO
function getHtmlPanel() {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monitor del Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Consolas', 'Courier New', Courier, monospace; background-color: #121212; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
        header { background-color: #1e1e1e; padding: 15px 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        h1 { font-size: 1.2rem; color: #4CAF50; display: flex; align-items: center; gap: 10px; }
        .dot { height: 10px; width: 10px; background-color: #4CAF50; border-radius: 50%; display: inline-block; animation: blink 1.5s infinite; }
        .stats { font-size: 0.9rem; color: #888; }
        #terminal { flex: 1; padding: 20px; overflow-y: auto; background-color: #000; }
        .log-entry { margin-bottom: 8px; line-height: 1.4; font-size: 14px; word-wrap: break-word; }
        .time { color: #888; margin-right: 10px; }
        .dir-IN { color: #00bcd4; font-weight: bold; }
        .dir-OUT { color: #4CAF50; font-weight: bold; }
        .dir-INFO { color: #ffeb3b; font-weight: bold; }
        .phone { color: #e91e63; margin-right: 10px; }
        .msg { color: #e0e0e0; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #121212; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
    </style>
</head>
<body>
    <header>
        <h1><span class="dot"></span> Monitor de Conversaciones (En Vivo)</h1>
        <div class="stats" id="status-text">Conectando...</div>
    </header>
    <div id="terminal"></div>

    <script>
        const terminal = document.getElementById('terminal');
        const statusText = document.getElementById('status-text');

        async function fetchLogs() {
            try {
                const response = await fetch('/api/logs');
                const logs = await response.json();
                
                terminal.innerHTML = '';
                if(logs.length === 0) {
                    terminal.innerHTML = '<div class="log-entry"><span class="msg" style="color:#888;">No hay eventos recientes. Esperando mensajes...</span></div>';
                }

                // Render logs (they are stored newest first, so we reverse to show oldest at top, newest at bottom)
                [...logs].reverse().forEach(log => {
                    const div = document.createElement('div');
                    div.className = 'log-entry';
                    div.innerHTML = \`
                        <span class="time">[\${log.time}]</span>
                        <span class="dir-\${log.dir}">[\${log.dir}]</span>
                        <span class="phone">\${log.phone}:</span>
                        <span class="msg">\${log.msg}</span>
                    \`;
                    terminal.appendChild(div);
                });

                // Auto-scroll al fondo
                terminal.scrollTop = terminal.scrollHeight;
                statusText.innerText = 'Actualizado: ' + new Date().toLocaleTimeString();
            } catch (error) {
                statusText.innerText = 'Error de conexión';
                statusText.style.color = '#f44336';
            }
        }

        // Cargar inmediatamente y luego cada 3 segundos
        fetchLogs();
        setInterval(fetchLogs, 3000);
    </script>
</body>
</html>`;
}