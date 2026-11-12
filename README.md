# MiniGestão — Mini Escavadeira

Sistema web para controle de obra, horímetro, horas, pausas, valores, manutenção 50/50, pagamentos, fotos e comprovantes. Projetado para **Cloudflare Workers + D1 + R2**, sem outro servidor.

## Funcionalidades

- Três perfis: **administrador**, **gestor** e **operador**.
- Operador informa cliente/obra e inicia o cronômetro. A leitura e a foto do horímetro são opcionais nesta versão.
- **Desligar** pausa as horas; **Retomar obra** abre novo trecho; **Encerrar obra** congela o total. Leitura e foto finais são opcionais.
- **Registrar horas manualmente:** informe hora inicial, hora final e pausas em **minutos**. As horas são calculadas automaticamente, mas você pode digitar a quantidade de horas a cobrar, desde que não ultrapasse o período sem pausas. O valor é proporcional à tarifa histórica na hora inicial. O registro fica auditado e aparece no dashboard e histórico de obras.
- Preço inicial **R$ 100,00/h**, calculado proporcionalmente ao segundo. Só administrador altera tarifa. Ao alterar, um trecho em andamento é fechado e outro é aberto na tarifa nova; os antigos não mudam.
- Dashboard com horas do dia, semana, mês, total, últimos 7 dias, valor recebido e valor a receber.
- Manutenções com descrição, categoria, comprovante, quem pagou, divisão 50%/50% e reembolso líquido.
- Pagamentos de horas com quantidade de minutos/horas quitados, valores, data e comprovante (inclusive parciais).
- CSV para Excel e trilha de auditoria. Exclusão lógica de manutenções e pagamentos **apenas para administrador**.
- Fotos/comprovantes privados no R2 (até 8 MB); não são URLs públicas.

## Implantação mais rápida na Cloudflare

### Opção A — GitHub + Cloudflare

1. Use um repositório no GitHub (recomendado **privado**) (por exemplo `mini-escavadeira`) e coloque **os arquivos do projeto**, mantendo as pastas `src/`, `public/`, `migrations/` etc. Nunca coloque senhas reais no GitHub.
2. No Cloudflare, abra **Workers & Pages → Create → Import a repository**, escolha o repositório e use `npm run deploy` como comando de deploy se solicitado. O Workers detecta `wrangler.jsonc`. Os bindings `DB` (D1) e `FILES` (R2) estão preparados para **provisionamento automático**, sem IDs preenchidos.
3. Confirme que a migração `0001_init.sql` foi executada (no deploy a instrução já está no script). Se a Cloudflare tiver executado somente `wrangler deploy`, rode depois `npx wrangler d1 migrations apply DB --remote` em terminal com acesso à conta.
4. No Worker publicado, em **Settings → Variables and Secrets**, crie um **Secret** chamado `ADMIN_SETUP_KEY` com um código aleatório forte de pelo menos 16 caracteres (32 ou mais recomendado). Não marque como variável pública. Salve/reimplante se necessário.
5. Abra o domínio `.workers.dev`. Na tela inicial, informe **essa chave uma única vez**, escolha usuário/senha do administrador e depois cadastre gestor e operador.

> A Cloudflare pode exigir habilitar o R2 na conta. A disponibilidade de criação automática de recursos depende do fluxo de publicação e das permissões da conta. Verifique D1 e R2 antes do primeiro acesso.

### Opção B — Terminal (mais previsível)

Instale Node.js 20+ e execute dentro da pasta do projeto:

```bash
npm install
npx wrangler login
npm run deploy
npx wrangler secret put ADMIN_SETUP_KEY
```

No comando `secret put`, cole uma chave forte que **só você conhece**, criada fora do repositório. Após isso, abra a URL `.workers.dev` exibida na publicação. O `npm run deploy` publica o Worker e executa as migrações na base D1 remota.

> Se as migrações não tiverem terminado e surgir erro de banco de dados, execute `npm run db:remote` e atualize a página.

### Testar localmente

```bash
npm install
cp .dev.vars.example .dev.vars
# Edite .dev.vars com uma chave forte local, não compartilhe.
npm run db:local
npm run dev
```

Acesse o endereço local indicado pelo Wrangler. Para testar cálculos sem precisar de conta Cloudflare, rode `npm test`.

## Segurança e limites

- Senhas derivadas com PBKDF2 e salt individual; sessões em cookies `HttpOnly; Secure; SameSite=Lax` e tokens armazenados como hashes.
- A conta inicial só pode ser criada quando não houver usuários, e exige o segredo `ADMIN_SETUP_KEY` configurado no Worker.
- Limite básico de tentativas de login, validação do tipo real de arquivo, permissões por papel e registro de alterações.
- **Atenção:** esta versão é um MVP. Antes de uso financeiro definitivo, valide permissões, datas de obras que atravessam a meia-noite, eventual ausência de internet, reembolsos e conciliação bancária. Ative backups do D1 e políticas de retenção de anexos.
- **Não é um aplicativo que funciona offline.** O início, a pausa, a retomada e o encerramento precisam alcançar o servidor; se ficar sem internet, registre as informações e regularize manualmente com a auditoria.
- O tempo considerado é o intervalo que o sistema registra entre ligar e desligar; a comparação com o horímetro real serve para conferência, não aciona a máquina fisicamente.

## Estrutura

```
src/index.js       Worker / API, regras de negócio e acesso
src/math.js        Cálculos puros (taxas, horas, manutenção)
public/            Painel web responsivo
migrations/        Banco Cloudflare D1
tests/             Testes automatizados de cálculo
wrangler.jsonc     Configuração e bindings Cloudflare
```

Não há chave ou credenciais reais no pacote.

## Registro manual (v2)

Na aba **Operação** ou **Obras**, escolha **Registrar horas manualmente**. Preencha cliente, hora inicial, hora final e as pausas em **minutos inteiros**. Se não digitar as horas trabalhadas, o sistema calcula `(hora final - hora inicial) - pausas`. Se digitar, a quantidade informada prevalece, respeitando o limite do período sem pausas. Ex.: 08h–17h, pausa de 60 minutos = 8h = R$ 800,00 a R$ 100/h.

Registros manuais são encerrados imediatamente, sem iniciar cronômetro. O sistema rejeita horários sobrepostos a obras já cadastradas para evitar duplicidade. Os campos de horímetro e foto podem ficar vazios. Horários são interpretados como horário de Brasília (UTC-3); a cobrança usa a tarifa que estava vigente no início da obra.

Para obras controladas pelo cronômetro, continuam disponíveis início, desligamento, retomada e encerramento. Quem precisar fazer uma correção de horas em obra antiga pode utilizar **Obras → Detalhes → Corrigir horas**, somente como administrador, com justificativa registrada.
