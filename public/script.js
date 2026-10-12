// script.js
// A pagina: (1) busca em /api/config o Client ID do Google, que o servidor le
// da variavel de ambiente GOOGLE_CLIENT_ID do Cloudflare Pages,
// (2) recebe o id_token do Google Identity Services e o troca por uma sessao
// persistente gravada no D1 (/api/sessao), (3) envia o numero e o token para
// /api/desenho e (4) exibe o SVG devolvido pelo servidor.
//
// Quando existe sessao, o servidor reconhece o cookie HttpOnly e a pagina nao
// precisa mais do id_token: recarregar nao desloga o usuario.
//
// Nenhum valor de configuracao fica escrito neste arquivo.

let idToken = "";
let email = "";
let sessaoAtiva = false;
let clientId = "";

const formulario = document.getElementById("formulario");
const campoNumero = document.getElementById("numero");
const area = document.getElementById("desenho");
const mensagem = document.getElementById("mensagem");
const botaoBaixar = document.getElementById("baixar");
const googleLogin = document.getElementById("google-login");
const conta = document.getElementById("conta");
const contaEmail = document.getElementById("conta-email");
const contaInicial = document.getElementById("conta-inicial");
const botaoSair = document.getElementById("sair");

let svgAtual = "";

function mostrarErro(texto) {
  mensagem.textContent = texto;
}

/* -------------------------------------------------------------------------- *
   Conta conectada
 * -------------------------------------------------------------------------- */

function mostrarConta() {
  contaInicial.textContent = (email || "?").charAt(0).toUpperCase();
  contaEmail.textContent = email || "conta Google";
  contaEmail.title = email || "";
  conta.hidden = false;
  googleLogin.hidden = true;
  document.body.classList.add("logado");
}

function ocultarConta() {
  idToken = "";
  email = "";
  sessaoAtiva = false;
  conta.hidden = true;
  googleLogin.hidden = false;
  document.body.classList.remove("logado");
}

// Le o e-mail do payload do id_token so para exibir na tela. Nao ha confianca
// aqui: quem decide o e-mail da assinatura e o servidor, a partir do token
// validado no tokeninfo ou da sessao gravada no D1.
function emailDoToken(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).email || "";
  } catch (erro) {
    return "";
  }
}

async function carregarSessao() {
  try {
    const resposta = await fetch("/api/sessao", { cache: "no-store" });

    // 503 = D1 ainda nao associado: a pagina segue com o login por token.
    if (!resposta.ok) {
      return;
    }

    const dados = await resposta.json();

    if (dados.logado) {
      email = dados.email;
      sessaoAtiva = true;
      mostrarConta();
    }
  } catch (erro) {
    // sem rede a pagina continua util com o login normal
  }
}

async function criarSessao() {
  try {
    const resposta = await fetch("/api/sessao", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (resposta.ok) {
      const dados = await resposta.json();
      email = dados.email;
      sessaoAtiva = true;
      mostrarConta();
      return;
    }
  } catch (erro) {
    // cai aqui em vez de seguir para o estado sem sessao
  }

  // Sem D1 (503) ou falha de rede: logado apenas nesta visita.
  email = emailDoToken(idToken);
  sessaoAtiva = false;
  mostrarConta();
}

async function encerrarSessao() {
  try {
    await fetch("/api/sessao", { method: "DELETE" });
  } catch (erro) {
    // ainda assim sai na tela
  }

  try {
    // impede o One Tap de reconectar sozinho
    google.accounts.id.disableAutoSelect();
  } catch (erro) {
    // versoes antigas nao tem essa funcao
  }

  ocultarConta();
}

/* -------------------------------------------------------------------------- *
   Login com o Google
 * -------------------------------------------------------------------------- */

async function carregarClientId() {
  const resposta = await fetch("/api/config", { cache: "no-store" });

  if (!resposta.ok) {
    throw new Error("config: " + resposta.status);
  }

  const dados = await resposta.json();
  return dados.clientId || "";
}

async function receberCredencial(resposta) {
  idToken = resposta.credential;
  await criarSessao();
}

function iniciarGoogle() {
  if (!window.google || !google.accounts) {
    setTimeout(iniciarGoogle, 100);
    return;
  }

  google.accounts.id.initialize({
    client_id: clientId,
    callback: receberCredencial,
  });

  google.accounts.id.renderButton(
    document.getElementById("google-login"),
    {
      theme: "outline",
      size: "large",
    }
  );
}

formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  mensagem.textContent = "";

  const numero = Number(campoNumero.value);

  if (!Number.isInteger(numero) || numero < 1 || numero > 100) {
    mostrarErro("Digite um inteiro entre 1 e 100.");
    return;
  }

  if (idToken === "" && !sessaoAtiva) {
    mostrarErro("Faça login com o Google antes de desenhar.");
    return;
  }

  try {
    const cabecalhos = { "Content-Type": "application/json" };

    // Com sessao o servidor usa o cookie HttpOnly; sem sessao, o id_token.
    if (!sessaoAtiva) {
      cabecalhos.Authorization = `Bearer ${idToken}`;
    }

    const resposta = await fetch("/api/desenho", {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({ numero }),
    });

    if (resposta.status === 400) {
      mostrarErro("Número inválido: envie um inteiro entre 1 e 100.");
      return;
    }

    if (resposta.status === 401) {
      mostrarErro("Não foi possível validar sua conta. Faça login com o Google novamente.");
      ocultarConta();
      return;
    }

    if (resposta.status === 405) {
      mostrarErro("Método não permitido nesta rota.");
      return;
    }

    if (!resposta.ok) {
      mostrarErro("Erro ao gerar o desenho. Tente novamente.");
      return;
    }

    svgAtual = await resposta.text();
    area.innerHTML = svgAtual;
    botaoBaixar.hidden = false;
  } catch (erro) {
    mostrarErro("Falha de conexão com o servidor.");
  }
});

botaoBaixar.addEventListener("click", () => {
  const arquivo = new Blob([svgAtual], { type: "image/svg+xml" });
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");

  link.href = url;
  link.download = "exemplo.svg";
  link.click();

  URL.revokeObjectURL(url);
});

botaoSair.addEventListener("click", encerrarSessao);

// Inicio: recupera a sessao persistida, descobre o Client ID e monta o botao.
carregarSessao();

(async () => {
  try {
    clientId = await carregarClientId();
  } catch (erro) {
    clientId = "";
  }

  if (clientId === "") {
    mostrarErro(
      "O servidor não informou o Client ID do Google. Confira a variável GOOGLE_CLIENT_ID no Cloudflare Pages e faça um novo deploy."
    );
    return;
  }

  iniciarGoogle();
})();
