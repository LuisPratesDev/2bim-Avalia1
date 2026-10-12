// functions/api/sessao.js
// Sessão persistente do login Google.
//
//   GET    /api/sessao -> 200 {"logado": true,  "email": "..."} | {"logado": false}
//   POST   /api/sessao -> Authorization: Bearer <id_token> valida o token,
//                          grava a sessao no D1 e devolve o cookie HttpOnly
//                          200 {"logado": true, "email": "..."}
//   DELETE /api/sessao -> apaga a sessao e limpa o cookie
//   outros métodos     -> 405
//
// Sem o binding do D1 (env.DB) responde 503: o site continua funcionando com o
// id_token em memoria, apenas sem persistir a sessao.

import { verificarToken } from "./desenho.js";
import { cookieSessao, cookieLimpo, criarSessao, sessaoAtual, encerrarSessao } from "../../lib/sessao.js";

function json(status, corpo, extras) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extras,
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  const semBanco = () =>
    json(503, {
      erro: "Banco D1 nao associado. Crie o banco, associe o binding DB ao projeto no Pages e faca um novo deploy.",
    });

  // Ordem das verificacoes: metodo (405), token (401), banco (503).
  if (request.method === "GET") {
    if (!env.DB) {
      return semBanco();
    }

    const sessao = await sessaoAtual(env, request);

    if (sessao === null) {
      return json(200, { logado: false });
    }

    return json(200, { logado: true, email: sessao.email, expira_em: sessao.expira_em });
  }

  if (request.method === "POST") {
    const autorizacao = request.headers.get("Authorization") || "";
    const partes = autorizacao.split(" ");

    if (partes.length !== 2 || partes[0] !== "Bearer" || partes[1] === "") {
      return json(401, { erro: "Token ausente. Faca login com o Google." });
    }

    const dados = await verificarToken(partes[1], env.GOOGLE_CLIENT_ID || "");

    if (dados === null) {
      return json(401, { erro: "Token invalido, expirado ou e-mail nao verificado." });
    }

    if (!env.DB) {
      return semBanco();
    }

    try {
      const token = await criarSessao(env, dados.email);
      return json(200, { logado: true, email: dados.email }, { "Set-Cookie": cookieSessao(token) });
    } catch {
      return json(500, { erro: "Falha ao gravar a sessao. Rode o SQL das tabelas usuarios e sessoes no D1." });
    }
  }

  if (request.method === "DELETE") {
    try {
      await encerrarSessao(env, request);
    } catch {
      // ainda assim limpa o cookie do navegador
    }

    return json(200, { logado: false }, { "Set-Cookie": cookieLimpo() });
  }

  return new Response("Metodo nao permitido. Use GET, POST ou DELETE.", {
    status: 405,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
