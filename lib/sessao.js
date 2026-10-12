// lib/sessao.js
// Sessão persistente do login, guardada no D1 (Cloudflare Pages -> Settings ->
// Bindings -> D1 database, variavel "DB").
//
// Por que isso existe: o id_token do Google vale cerca de uma hora e some quando
// a pagina recarrega. Aqui o token validado pelo servidor e trocado por uma
// sessao propria: um valor aleatorio que vai para um cookie HttpOnly do
// navegador, enquanto no banco fica apenas o SHA-256 dele. Assim o usuario nao
// precisa clicar em "Fazer login com o Google" a cada visita, e o navegador
// nunca guarda o token do Google.
//
// O e-mail que assina o desenho continua vindo de um id_token do Google
// validado pelo servidor: a sessao apenas guarda esse e-mail ja verificado.

export const NOME_COOKIE = "sessao";
export const DURACAO_SEGUNDOS = 7 * 24 * 60 * 60; // 7 dias

// Nome da variavel de binding no painel do Pages. O nome e livre (o painel so
// pede um apelido), entao procuramos os mais comuns antes de desistir: assim
// qualquer um dos nomes habituais funciona sem mexer no codigo.
export function bancoD1(env) {
  return env.DB || env.db || env.DATABASE || env.database || null;
}

// 32 bytes aleatorios em hexadecimal.
function novoToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// SHA-256 em hexadecimal: e o hash que vai para o banco, nunca o token em claro.
async function hashToken(token) {
  const dados = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Le um valor do cabecalho Cookie.
function lerCookie(request, nome) {
  const bruto = request.headers.get("Cookie") || "";
  for (const par of bruto.split(";")) {
    const [chave, ...resto] = par.trim().split("=");
    if (chave === nome) {
      return decodeURIComponent(resto.join("="));
    }
  }
  return null;
}

// Atributos do cookie: so o servidor le (HttpOnly), so por HTTPS (Secure) e
// so em requisicoes deste proprio site (SameSite=Strict).
export function cookieSessao(token) {
  return `${NOME_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${DURACAO_SEGUNDOS}; HttpOnly; Secure; SameSite=Strict`;
}

export function cookieLimpo() {
  return `${NOME_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function agora() {
  return Math.floor(Date.now() / 1000);
}

// Cria (ou atualiza) o usuario e abre uma sessao. Devolve { token, expira_em }:
// o token em claro so existe aqui e no cookie do navegador.
export async function criarSessao(env, email) {
  const db = bancoD1(env);
  if (!db) {
    throw new Error("D1 nao associado ao projeto");
  }

  const token = novoToken();
  const hash = await hashToken(token);
  const instante = agora();
  const expira = instante + DURACAO_SEGUNDOS;

  await db.batch([
    db.prepare(
      "INSERT INTO usuarios (email, ultimo_acesso) VALUES (?1, ?2) " +
        "ON CONFLICT(email) DO UPDATE SET ultimo_acesso = excluded.ultimo_acesso"
    ).bind(email, instante),
    db.prepare("INSERT INTO sessoes (token_hash, email, expira_em) VALUES (?1, ?2, ?3)").bind(
      hash,
      email,
      expira
    ),
    // limpa sessoes vencidas a cada abertura de sessao
    db.prepare("DELETE FROM sessoes WHERE expira_em < ?1").bind(instante),
  ]);

  return { token, expira_em: expira };
}

// Devolve { email, expira_em } ou null. Qualquer problema no banco vira null:
// a ausencia de sessao jamais pode derrubar o contrato da rota /api/desenho.
export async function sessaoAtual(env, request) {
  const token = lerCookie(request, NOME_COOKIE);
  const db = bancoD1(env);
  if (!token || !db) {
    return null;
  }

  try {
    const hash = await hashToken(token);
    const linha = await db.prepare(
      "SELECT email, expira_em FROM sessoes WHERE token_hash = ?1 AND expira_em > ?2"
    )
      .bind(hash, agora())
      .first();
    return linha || null;
  } catch {
    return null;
  }
}

// Encerra a sessao do cookie atual. Sem cookie nao ha o que apagar.
export async function encerrarSessao(env, request) {
  const token = lerCookie(request, NOME_COOKIE);
  const db = bancoD1(env);
  if (!token || !db) {
    return;
  }

  const hash = await hashToken(token);
  await db.prepare("DELETE FROM sessoes WHERE token_hash = ?1").bind(hash).run();
}
