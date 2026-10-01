const express = require('express');
const QRCode = require('qrcode');
const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const SENDER_TOKEN = process.env.SENDER_TOKEN || '';

let client = null;

let state = {
  ready: false,
  authenticated: false,
  status: 'iniciando',
  qrDataUrl: null,
  lastError: null,
  me: null,
  browserPath: null,
  whatsappState: null,
  loadingPercent: null,
  loadingMessage: null,
  lastEvent: 'boot'
};

function tokenOk(req) {
  const token = req.query.token || req.body.token || '';
  return Boolean(SENDER_TOKEN) && token === SENDER_TOKEN;
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function mark(eventName, extra = {}) {
  state.lastEvent = eventName;
  Object.assign(state, extra);
  console.log(`[EVENT] ${eventName}`, extra);
}

async function initWhatsApp() {
  try {
    mark('preparando_chromium', { status: 'preparando_chromium' });

    const executablePath = await chromium.executablePath();
    state.browserPath = executablePath;
    console.log('Chromium:', executablePath);

    client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'main',
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: {
        executablePath,
        headless: true,
        args: [
          ...chromium.args,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      }
    });

    client.on('qr', async (qr) => {
      try {
        state.qrDataUrl = await QRCode.toDataURL(qr, { width: 340, margin: 2 });
      } catch (e) {
        state.lastError = String(e);
      }

      mark('qr', {
        ready: false,
        authenticated: false,
        status: 'aguardando_qr',
        lastError: null
      });
    });

    client.on('authenticated', () => {
      mark('authenticated', {
        authenticated: true,
        ready: false,
        status: 'autenticado',
        qrDataUrl: null,
        lastError: null
      });
    });

    client.on('loading_screen', (percent, message) => {
      mark('loading_screen', {
        status: 'carregando_whatsapp',
        loadingPercent: percent,
        loadingMessage: message || null
      });
    });

    client.on('change_state', (newState) => {
      mark('change_state', {
        whatsappState: String(newState),
        status: state.ready ? 'pronto' : `estado_${String(newState).toLowerCase()}`
      });
    });

    client.on('ready', () => {
      mark('ready', {
        ready: true,
        authenticated: true,
        status: 'pronto',
        qrDataUrl: null,
        lastError: null,
        whatsappState: 'READY'
      });

      state.me = client.info?.wid?._serialized || null;
      console.log('WhatsApp pronto.');
    });

    client.on('auth_failure', (msg) => {
      mark('auth_failure', {
        ready: false,
        authenticated: false,
        status: 'falha_autenticacao',
        lastError: String(msg)
      });
    });

    client.on('disconnected', (reason) => {
      mark('disconnected', {
        ready: false,
        authenticated: false,
        status: 'desconectado',
        lastError: String(reason)
      });
    });

    mark('client_initialize', { status: 'abrindo_whatsapp_web' });
    await client.initialize();

  } catch (err) {
    mark('init_error', {
      ready: false,
      status: 'erro_inicializacao',
      lastError: String(err)
    });
    console.error(err);
  }
}

app.get('/health', async (req, res) => {
  let actualState = null;

  if (client) {
    try {
      actualState = await client.getState();
    } catch (_) {}
  }

  res.json({
    ok: true,
    whatsapp_ready: state.ready,
    authenticated: state.authenticated,
    status: state.status,
    browser_ready: Boolean(state.browserPath),
    last_event: state.lastEvent,
    whatsapp_state: state.whatsappState,
    actual_client_state: actualState,
    loading_percent: state.loadingPercent,
    loading_message: state.loadingMessage,
    last_error: state.lastError
  });
});

app.get('/', async (req, res) => {
  if (!tokenOk(req)) {
    return res.status(401).send('Token inválido. Use ?token=SEU_TOKEN');
  }

  let groups = [];
  let actualState = null;

  if (client) {
    try {
      actualState = await client.getState();
    } catch (_) {}
  }

  if (state.ready && client) {
    try {
      const chats = await client.getChats();
      groups = chats
        .filter(c => c.isGroup)
        .map(c => ({
          id: c.id._serialized,
          name: c.name
        }))
        .sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    } catch (e) {
      state.lastError = String(e);
    }
  }

  const token = req.query.token;
  const opts = groups.map(g =>
    `<option value="${esc(g.id)}">${esc(g.name)} — ${esc(g.id)}</option>`
  ).join('');

  res.send(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp Sender</title>
<style>
body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.45}
.card{border:1px solid #ddd;border-radius:14px;padding:18px;margin:16px 0}
.err{color:#b42318}
.ok{color:#067647}
img{max-width:340px;width:100%;height:auto}
select,button{font-size:16px;padding:10px;width:100%;margin-top:10px}
code{word-break:break-all}
table{border-collapse:collapse;width:100%}
td{padding:6px;border-bottom:1px solid #eee;vertical-align:top}
td:first-child{font-weight:bold;width:180px}
</style>
</head>
<body>

<h1>WhatsApp Sender</h1>

<div class="card">
  <table>
    <tr><td>Status</td><td>${esc(state.status)}</td></tr>
    <tr><td>Último evento</td><td>${esc(state.lastEvent)}</td></tr>
    <tr><td>Autenticado</td><td>${state.authenticated ? 'sim' : 'não'}</td></tr>
    <tr><td>Pronto</td><td>${state.ready ? 'sim' : 'não'}</td></tr>
    <tr><td>Chromium</td><td>${state.browserPath ? 'OK' : 'não'}</td></tr>
    <tr><td>Estado WhatsApp</td><td>${esc(state.whatsappState || '-')}</td></tr>
    <tr><td>Estado real do cliente</td><td>${esc(actualState || '-')}</td></tr>
    <tr><td>Carregamento</td><td>${state.loadingPercent !== null ? esc(state.loadingPercent) + '%' : '-'}</td></tr>
    <tr><td>Mensagem</td><td>${esc(state.loadingMessage || '-')}</td></tr>
    ${state.me ? `<tr><td>Número conectado</td><td><code>${esc(state.me)}</code></td></tr>` : ''}
  </table>

  ${state.lastError ? `<p class="err"><b>Erro:</b> ${esc(state.lastError)}</p>` : ''}
</div>

${state.qrDataUrl && !state.authenticated ? `
<div class="card">
  <h2>1. Escaneie o QR Code</h2>
  <p>No WhatsApp Business: <b>Configurações → Dispositivos conectados → Conectar um dispositivo</b>.</p>
  <img src="${state.qrDataUrl}" alt="QR Code">
</div>
` : ''}

${state.authenticated && !state.ready ? `
<div class="card">
  <h2>WhatsApp autenticado</h2>
  <p>O QR já foi aceito. Agora estamos aguardando o WhatsApp Web concluir a inicialização.</p>
  <p>Atualize esta página em alguns segundos para acompanhar o estado.</p>
</div>
` : ''}

${state.ready ? `
<div class="card">
  <h2>Enviar mensagem de teste</h2>

  ${groups.length ? `
  <form method="post" action="/send-test">
    <input type="hidden" name="token" value="${esc(token)}">
    <label>Escolha o grupo:</label>
    <select name="groupId" required>${opts}</select>
    <button type="submit">Enviar “teste do bot”</button>
  </form>
  ` : `
  <p>Nenhum grupo apareceu ainda. Abra o grupo no celular, envie uma mensagem e atualize esta página.</p>
  `}
</div>
` : ''}

<p><a href="/?token=${encodeURIComponent(token)}">Atualizar página</a></p>
<p><a href="/health" target="_blank">Abrir diagnóstico /health</a></p>

</body>
</html>`);
});

app.post('/send-test', async (req, res) => {
  if (!tokenOk(req)) return res.status(401).send('Token inválido.');
  if (!state.ready || !client) return res.status(503).send('WhatsApp ainda não está pronto.');

  const groupId = req.body.groupId;
  if (!groupId || !groupId.endsWith('@g.us')) {
    return res.status(400).send('Grupo inválido.');
  }

  try {
    const chat = await client.getChatById(groupId);

    if (!chat || !chat.isGroup) {
      return res.status(400).send('O ID informado não é de um grupo.');
    }

    await client.sendMessage(groupId, 'teste do bot');

    res.send(`<html><meta charset="utf-8"><body style="font-family:Arial;max-width:700px;margin:40px auto;padding:0 16px">
      <h1>Mensagem enviada ✅</h1>
      <p>Foi enviado <b>“teste do bot”</b> para <b>${esc(chat.name || groupId)}</b>.</p>
      <p><a href="/?token=${encodeURIComponent(req.body.token)}">Voltar</a></p>
    </body></html>`);
  } catch (err) {
    res.status(500).send(`Erro ao enviar: ${esc(String(err))}`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor HTTP rodando na porta ${PORT}`);
  initWhatsApp();
});
