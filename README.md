# whatsapp-sender v3

Versão com diagnóstico detalhado dos eventos do WhatsApp Web.

Principais mudanças:
- remove o QR da tela assim que autentica;
- registra `loading_screen`;
- registra `change_state`;
- registra `ready`;
- `/health` mostra estado real do cliente.

Render:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Variável: `SENDER_TOKEN`

URL:
`https://whatsapp-sender-3no1.onrender.com/?token=SEU_TOKEN`
