// functions/api/desenho.js
// Contrato da atividade:
//   POST /api/desenho
//   Corpo:   {"numero": 42}
//   Cabecalho: Authorization: Bearer <id_token>
//   200 -> SVG com Content-Type image/svg+xml, assinado com o e-mail do token
//   400 -> corpo ausente, JSON invalido, numero ausente, nao inteiro ou fora de 1..100
//   401 -> token ausente, invalido, expirado, aud diferente ou e-mail nao verificado
//   405 -> qualquer metodo diferente de POST
// Ordem das verificacoes: metodo (405), corpo (400), token (401).

import { gerarDesenho, numeroValido } from "../../lib/desenho.js";

const TOKENINFO = "https://oauth2.googleapis.com/tokeninfo?id_token=";

// Verifica o id_token no servidor. Devolve o payload do token ou null.
async function verificarToken(token, clientId) {
  try {
    const resposta = await fetch(TOKENINFO + encodeURIComponent(token));

    if (resposta.status !== 200) {
      return null;
    }

    const dados = await resposta.json();

    if (dados.aud !== clientId) {
      return null;
    }

    if (dados.email_verified !== "true") {
      return null;
    }

    if (typeof dados.email !== "string" || dados.email === "") {
      return null;
    }

    return dados;
  } catch {
    return null;
  }
}

function erro(status, texto) {
  return new Response(texto, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  // O Client ID vem do painel do Pages (variavel de ambiente).
  const clientId = env.GOOGLE_CLIENT_ID || "";

  // 1) Metodo: somente POST.
  if (request.method !== "POST") {
    return erro(405, "Metodo nao permitido. Use POST.");
  }

  // 2) Corpo: ausente ou JSON invalido.
  let corpo = null;
  try {
    corpo = await request.json();
  } catch {
    return erro(400, "Corpo ausente ou JSON invalido.");
  }

  if (corpo === null || typeof corpo !== "object") {
    return erro(400, "Corpo ausente ou JSON invalido.");
  }

  // 2) Corpo: numero ausente, nao inteiro ou fora de 1 a 100.
  const numero = corpo.numero;
  if (typeof numero !== "number" || !numeroValido(numero)) {
    return erro(400, "numero ausente, nao inteiro ou fora do intervalo de 1 a 100.");
  }

  // 3) Token: ausente.
  const autorizacao = request.headers.get("Authorization") || "";
  const partes = autorizacao.split(" ");
  if (partes.length !== 2 || partes[0] !== "Bearer" || partes[1] === "") {
    return erro(401, "Token ausente. Faca login com o Google.");
  }

  // 3) Token: invalido, expirado, aud diferente ou e-mail nao verificado.
  const dados = await verificarToken(partes[1], clientId);
  if (dados === null) {
    return erro(401, "Token invalido, expirado ou e-mail nao verificado.");
  }

  // 200: SVG assinado com o e-mail da conta Google validada pelo servidor.
  const svg = gerarDesenho(numero, dados.email);

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
    },
  });
}
