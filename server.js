const express = require('express');
const QRCode = require('qrcode');
const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const SENDER_TOKEN = process.env.SENDER_TOKEN || '';

let client = null;
let state = { ready:false, status:'iniciando', qrDataUrl:null, lastError:null, me:null, browserPath:null };

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

async function initWhatsApp() {
  try {
    state.status = 'preparando_chromium';
    const executablePath = await chromium.executablePath();
    state.browserPath = executablePath;
    console.log('Chromium:', executablePath);

    client = new Client({
      authStrategy: new LocalAuth({ clientId:'main', dataPath:'./.wwebjs_auth' }),
      puppeteer: {
        executablePath,
        headless: true,
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      }
    });

    client.on('qr', async qr => {
      state.ready = false;
      state.status = 'aguardando_qr';
      state.lastError = null;
      state.qrDataUrl = await QRCode.toDataURL(qr, { width:340, margin:2 });
      console.log('QR gerado.');
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

    client.on('auth_failure', msg => {
      state.ready = false;
      state.status = 'falha_autenticacao';
      state.lastError = String(msg);
    });

    client.on('disconnected', reason => {
      state.ready = false;
      state.status = 'desconectado';
      state.lastError = String(reason);
    });

    state.status = 'abrindo_whatsapp_web';
    await client.initialize();
  } catch (err) {
    state.ready = false;
    state.status = 'erro_inicializacao';
    state.lastError = String(err);
    console.error(err);
  }
}

app.get('/health', (req,res) => {
  res.json({ ok:true, whatsapp_ready:state.ready, status:state.status, browser_ready:Boolean(state.browserPath) });
});

app.get('/', async (req,res) => {
  if (!tokenOk(req)) return res.status(401).send('Token inválido. Use ?token=SEU_TOKEN');

  let groups = [];
  if (state.ready && client) {
    try {
      const chats = await client.getChats();
      groups = chats.filter(c => c.isGroup).map(c => ({id:c.id._serialized, name:c.name}))
        .sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    } catch (e) {
      state.lastError = String(e);
    }
  }

  const token = req.query.token;
  const opts = groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)} — ${esc(g.id)}</option>`).join('');

  res.send(`<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp Sender</title>
<style>
body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.45}
.card{border:1px solid #ddd;border-radius:14px;padding:18px;margin:16px 0}
.err{color:#b42318} img{max-width:340px;width:100%;height:auto}
select,button{font-size:16px;padding:10px;width:100%;margin-top:10px}
code{word-break:break-all}
</style></head><body>
<h1>WhatsApp Sender</h1>
<div class="card">
<b>Status:</b> ${esc(state.status)}
${state.browserPath ? '<p><b>Chromium:</b> OK</p>' : ''}
${state.me ? `<p><b>Número conectado:</b> <code>${esc(state.me)}</code></p>` : ''}
${state.lastError ? `<p class="err"><b>Erro:</b> ${esc(state.lastError)}</p>` : ''}
</div>

${state.qrDataUrl ? `<div class="card"><h2>1. Escaneie o QR Code</h2>
<p>No WhatsApp Business: <b>Configurações → Dispositivos conectados → Conectar um dispositivo</b>.</p>
<img src="${state.qrDataUrl}" alt="QR Code">
<p>Depois de escanear, aguarde alguns segundos e atualize esta página.</p></div>` : ''}

${state.ready ? `<div class="card"><h2>2. Enviar mensagem de teste</h2>
${groups.length ? `<form method="post" action="/send-test">
<input type="hidden" name="token" value="${esc(token)}">
<label>Escolha o grupo:</label><select name="groupId" required>${opts}</select>
<button type="submit">Enviar “teste do bot”</button></form>` :
'<p>Nenhum grupo apareceu ainda. Abra o grupo no celular, envie uma mensagem e atualize esta página.</p>'}
</div>` : ''}

<p><a href="/?token=${encodeURIComponent(token)}">Atualizar página</a></p>
</body></html>`);
});

app.post('/send-test', async (req,res) => {
  if (!tokenOk(req)) return res.status(401).send('Token inválido.');
  if (!state.ready || !client) return res.status(503).send('WhatsApp ainda não está pronto.');

  const groupId = req.body.groupId;
  if (!groupId || !groupId.endsWith('@g.us')) return res.status(400).send('Grupo inválido.');

  try {
    const chat = await client.getChatById(groupId);
    if (!chat || !chat.isGroup) return res.status(400).send('O ID informado não é de um grupo.');
    await client.sendMessage(groupId, 'teste do bot');
    res.send(`<html><meta charset="utf-8"><body style="font-family:Arial;max-width:700px;margin:40px auto;padding:0 16px">
<h1>Mensagem enviada ✅</h1><p>Foi enviado <b>“teste do bot”</b> para <b>${esc(chat.name||groupId)}</b>.</p>
<p><a href="/?token=${encodeURIComponent(req.body.token)}">Voltar</a></p></body></html>`);
  } catch (err) {
    res.status(500).send(`Erro ao enviar: ${esc(String(err))}`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor HTTP rodando na porta ${PORT}`);
  initWhatsApp();
});
