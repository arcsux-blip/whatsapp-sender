# whatsapp-sender v5

Mudanças principais:
- `/health` não consulta mais o Chromium;
- página principal não consulta mais o Chromium;
- a interface abre imediatamente usando apenas o estado salvo em memória;
- grupos só são carregados quando o usuário clica em `Carregar grupos`;
- carregamento de grupos continua protegido por timeout;
- `protocolTimeout` do Puppeteer permanece em 300 segundos.

Render:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Variável: `SENDER_TOKEN`

URL principal:
`https://whatsapp-sender-3no1.onrender.com/?token=SEU_TOKEN`
