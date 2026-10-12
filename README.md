# Desenho Assinado

Página que recebe um número inteiro entre 1 e 100 e devolve uma figura em SVG, assinada com o e-mail da conta Google usada no login OAuth.

A figura é a tabuada modular no círculo: 240 pontos igualmente espaçados numa circunferência, com cada ponto `i` ligado ao ponto `(k * i) mod 240`, em que `k = número + 1`. O número 1 produz uma cardioide, o 2 uma nefroide, e cada valor gera uma figura diferente.

A geração saiu do navegador: o desenho é produzido no servidor por uma Pages Function, e a assinatura é o e-mail que o próprio servidor extrai do `id_token` do Google — nunca um texto digitado pelo usuário.

## Como funciona

O formulário tem apenas o campo número e o botão de login do Google; o campo de e-mail não existe mais. O usuário faz login com o Google Identity Services e recebe um `id_token`. O navegador envia o número e o token para `POST /api/desenho`, uma Pages Function que:

1. recusa métodos diferentes de POST (405);
2. valida o corpo JSON e o número entre 1 e 100 (400);
3. verifica o token em `https://oauth2.googleapis.com/tokeninfo?id_token=...`, conferindo `aud` contra a variável de ambiente `GOOGLE_CLIENT_ID` e `email_verified` (401);
4. devolve o SVG gerado por `lib/desenho.js`, assinado com o `email` validado pelo servidor (200).

A ordem das verificações é sempre método (405), corpo (400), token (401). A função `gerarDesenho` vive apenas em `lib/desenho.js`, fora de `public/`, e nunca é servida ao navegador.

Antes disso, a página busca sua configuração em `GET /api/config`, que devolve `{"clientId": "...apps.googleusercontent.com"}` lido da variável de ambiente. Nenhum valor de configuração fica escrito em `public/script.js`: trocar de projeto no Google Cloud exige apenas atualizar a variável e criar um novo deploy.

## Contrato da API

| Item | Exigência |
|---|---|
| Rota | `POST /api/desenho` |
| Corpo | JSON no formato `{"numero": 42}` |
| Cabeçalho | `Authorization: Bearer <id_token>` |
| 200 | Corpo com o SVG, `Content-Type: image/svg+xml`, assinado com o e-mail do token |
| 400 | Corpo ausente, JSON inválido, `numero` ausente, não inteiro ou fora de 1 a 100 |
| 401 | Token ausente, inválido, expirado, com `aud` diferente do Client ID ou com e-mail não verificado |
| 405 | Qualquer método diferente de POST |

## Estrutura

```
public/
  index.html    formulário apenas com o número e o login do Google
  style.css     aparência da página
  script.js     envia número e token com fetch e exibe a resposta
lib/
  desenho.js    função pura gerarDesenho(numero, email)
functions/
  api/
    desenho.js  Pages Function que implementa o contrato da API
    config.js   entrega à página o Client ID lido da variável de ambiente
evidencias/
  exemplo.svg   desenho gerado pelo site publicado
```

O diretório `functions/` fica na **raiz** do repositório, ao lado de `public/`, que é o que faz o Cloudflare Pages publicar a rota `/api/desenho` junto com os arquivos estáticos.

## Publicação no Cloudflare Pages

Conecte o repositório do GitHub ao projeto no Pages e use exatamente:

| Configuração | Valor |
|---|---|
| Framework preset | `None` |
| Build command | (vazio) |
| Build output directory | `public` |
| Production branch | `main` |

Com isso, cada `git push` na `main` gera um novo deploy automaticamente.

## Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `GOOGLE_CLIENT_ID` | **Sim** | Client ID do cliente OAuth Web. A Pages Function compara esse valor com o campo `aud` do token; sem ela, todo token é recusado com 401. É também esse valor que `GET /api/config` entrega à página. Este é o único lugar onde o Client ID existe. |
| `GOOGLE_CLIENT_SECRET` | Não | **Este projeto não usa o Client Secret.** O login usa `id_token` (Google Identity Services) e a verificação no servidor é feita pelo endpoint `tokeninfo`, que se autentica pelo próprio token — não há troca de código por token com segredo. Cadastrá-lo não faz mal, mas não muda nada; se preferir manter, marque como *secret* (criptografado) no painel. |

Cadastre `GOOGLE_CLIENT_ID` em **Pages → projeto → Settings → Variables and Secrets**, nos ambientes *Production* e *Preview*.

> **Importante:** alterar variáveis de ambiente **não afeta o deploy que já está no ar**. O painel do Pages avisa que a mudança "will take effect on the next deployment". Depois de cadastrar ou corrigir um valor, crie um novo deploy (**Deployments → ⋯ → Retry deployment**, ou apenas faça um novo push). Um deploy antigo continua executando com os valores antigos.

Nunca faça commit de `GOOGLE_CLIENT_SECRET`, de tokens ou de arquivos `.env`. Só o `GOOGLE_CLIENT_ID` é público e pode aparecer no código.

## Login com Google

1. No Google Cloud Console, crie (ou reutilize) um cliente OAuth do tipo **Web application**.
2. Em **Authorized JavaScript origins**, cadastre a URL exata do site publicado, sem barra no final e sem caminho — por exemplo `https://SEU-PROJETO.pages.dev`.
3. Cadastre o Client ID na variável `GOOGLE_CLIENT_ID` do Pages, nos ambientes *Production* e *Preview*. Não há Client ID escrito em `public/script.js`: a página o recebe de `GET /api/config`.
4. A página usa `google.accounts.id.initialize` com esse Client ID e renderiza o botão "Fazer login com o Google"; o callback guarda o `id_token` e o `fetch` para `/api/desenho` o envia no cabeçalho `Authorization`.

## Como testar

**Contrato da API** — substitua a URL e confira os códigos:

```bash
BASE=https://SEU-PROJETO.pages.dev
curl -si -X POST "$BASE/api/desenho"                                                    # 405 (método diferente de POST)
curl -si -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/desenho"        # 400
curl -si -X POST -H 'Content-Type: application/json' -d '{"numero":20}' "$BASE/api/desenho"  # 401 (sem token)
```

**Fluxo completo** — abra o site, clique em *Fazer login com o Google*, entre com a sua conta, digite um número entre 1 e 100 e clique em *Desenhar*. O SVG aparece na página, assinado com o e-mail da conta usada no login, e o botão *Baixar SVG* salva o arquivo.

**Evidência** — `evidencias/exemplo.svg` é o desenho baixado do site publicado, gerado com o número derivado do RA.

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| A página diz "Não foi possível validar sua conta" (401) para um login legítimo | `GOOGLE_CLIENT_ID` ausente, diferente do Client ID do `script.js` ou cadastrada depois do último deploy — cadastre/corrija a variável e **crie um novo deploy**. |
| O popup do Google acusa `origin_mismatch` | A URL do site não está em *Authorized JavaScript origins* no Google Cloud Console. |
| O botão do Google não aparece ou não reage | Client ID inválido no `public/script.js`, ou o script `https://accounts.google.com/gsi/client` não carregou. |
| Erro 400 mesmo com número válido | O `body` precisa ser JSON e `numero` precisa ser um número inteiro (não string) entre 1 e 100. |
| A página avisa que o servidor não informou o Client ID | `GOOGLE_CLIENT_ID` ausente ou cadastrada depois do último deploy: corrija a variável e **crie um novo deploy**. |

## Identificação (preencha após o fork)

Nome: Luis Fernando Prates Santana
RA: 202610820
URL: https://2bim-avalia1-1kv.pages.dev/
