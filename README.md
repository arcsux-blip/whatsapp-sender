# whatsapp-sender

Primeiro teste para conectar um número do WhatsApp Business via WhatsApp Web e enviar uma mensagem para um grupo.

## Render
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Variável obrigatória: `SENDER_TOKEN` com um valor longo e secreto.

Depois do deploy, abra:

`https://SEU-SERVICO.onrender.com/?token=SEU_TOKEN`

Escaneie o QR Code pelo WhatsApp Business em **Dispositivos conectados**.

> Esta primeira versão usa armazenamento local da sessão. Em reinícios/redeploys pode ser necessário escanear o QR novamente. Depois do teste inicial, adicionaremos persistência.
