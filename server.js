const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const SENDER_TOKEN = process.env.SENDER_TOKEN || '';

let state = {
  ready: false,
  status: 'iniciando',
  qrDataUrl: null,
  lastError: null,
  me: null
};

function tokenOk(req) {
  const token = req.query.token || req.body.token || '';
  return SENDER_TOKEN && token === SENDER_TOKEN;
}

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'main',
    dataPath: './.wwebjs_auth'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});

client.on('qr', async (qr) => {
  state.ready = false;
  state.status = 'aguardando_qr';
  state.lastError = null;
  try {
    state.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
  } catch (err) {
    state.lastError = String(err);
  }
  console.log('QR gerado. Abra a página do serviço para escanear.');
});

client.on('authenticated', () => {
  state.status = 'autenticado';
  state.lastError = null;
  console.log('WhatsApp autenticado.');
});

client.on('ready', () => {
  state.ready = true;
  state.status = 'pronto';
  state.qrDataUrl = null;
  state.lastError = null;
  state.me = client.info?.wid?._serialized || null;
  console.log('WhatsApp pronto.');
});

client.on('auth_failure', (msg) => {
  state.ready = false;
  state.status = 'falha_autenticacao';
  state.lastError = String(msg);
  console.error('Falha de autenticação:', msg);
});

client.on('disconnected', (reason) => {
  state.ready = false;
  state.status = 'desconectado';
  state.lastError = String(reason);
  console.warn('WhatsApp desconectado:', reason);
});

client.initialize().catch((err) => {
  state.ready = false;
  state.status = 'erro_inicializacao';
  state.lastError = String(err);
  console.error(err);
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    whatsapp_ready: state.ready,
    status: state.status
  });
});

app.get('/', async (req, res) => {
  if (!tokenOk(req)) {
    return res.status(401).send('Token inválido. Use ?token=SEU_TOKEN');
  }

  let groups = [];
  if (state.ready) {
    try {
      const chats = await client.getChats();
      groups = chats
        .filter(chat => chat.isGroup)
        .map(chat => ({ id: chat.id._serialized, name: chat.name }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (err) {
      state.lastError = String(err);
    }
  }

  const token = req.query.token;
  const groupOptions = groups.map(g =>
    `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)} — ${escapeHtml(g.id)}</option>`
  ).join('');

  res.send(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WhatsApp Sender</title>
<style>
body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.45}
.card{border:1px solid #ddd;border-radius:14px;padding:18px;margin:16px 0}
.err{color:#b42318}
img{max-width:320px;width:100%;height:auto}
select,button{font-size:16px;padding:10px;width:100%;margin-top:10px}
code{word-break:break-all}
</style>
</head>
<body>
<h1>WhatsApp Sender</h1>
<div class="card">
  <b>Status:</b> ${escapeHtml(state.status)}
  ${state.me ? `<p><b>Número conectado:</b> <code>${escapeHtml(state.me)}</code></p>` : ''}
  ${state.lastError ? `<p class="err"><b>Erro:</b> ${escapeHtml(state.lastError)}</p>` : ''}
</div>

${state.qrDataUrl ? `
<div class="card">
  <h2>1. Escaneie o QR Code</h2>
  <p>No WhatsApp Business: <b>Configurações → Dispositivos conectados → Conectar um dispositivo</b>.</p>
  <img src="${state.qrDataUrl}" alt="QR Code">
  <p>Depois de escanear, aguarde alguns segundos e atualize esta página.</p>
</div>` : ''}

${state.ready ? `
<div class="card">
  <h2>2. Enviar mensagem de teste</h2>
  ${groups.length ? `
  <form method="post" action="/send-test">
    <input type="hidden" name="token" value="${escapeHtml(token)}">
    <label>Escolha o grupo:</label>
    <select name="groupId" required>${groupOptions}</select>
    <button type="submit">Enviar “teste do bot”</button>
  </form>` : `
  <p>Nenhum grupo apareceu ainda. Abra o grupo no celular, envie uma mensagem e atualize esta página.</p>`}
</div>` : ''}

<p><a href="/?token=${encodeURIComponent(token)}">Atualizar página</a></p>
</body>
</html>`);
});

app.post('/send-test', async (req, res) => {
  if (!tokenOk(req)) {
    return res.status(401).send('Token inválido.');
  }
  if (!state.ready) {
    return res.status(503).send('WhatsApp ainda não está pronto.');
  }

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

    res.send(`<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mensagem enviada</title></head>
<body style="font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:0 16px">
<h1>Mensagem enviada ✅</h1>
<p>Foi enviado <b>“teste do bot”</b> para <b>${escapeHtml(chat.name || groupId)}</b>.</p>
<p><a href="/?token=${encodeURIComponent(req.body.token)}">Voltar</a></p>
</body></html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`Erro ao enviar: ${escapeHtml(String(err))}`);
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor HTTP rodando na porta ${PORT}`);
});
