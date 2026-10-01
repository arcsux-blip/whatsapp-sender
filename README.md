# whatsapp-sender v4

Mudanças principais:
- `protocolTimeout` do Puppeteer aumentado para 300 segundos;
- página principal não chama mais `getChats()` diretamente;
- grupos carregam via `/groups` em segundo plano;
- `/groups` tem timeout próprio de 30 segundos;
- `/send-test` também tem timeouts de proteção;
- diagnóstico `/health` continua disponível.

Render:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Variável: `SENDER_TOKEN`

URL principal:
`https://whatsapp-sender-3no1.onrender.com/?token=SEU_TOKEN`
