// script.js
// A pagina: (1) busca em /api/config o Client ID do Google, que o servidor le
// da variavel de ambiente GOOGLE_CLIENT_ID do Cloudflare Pages,
// (2) recebe o id_token do Google Identity Services, (3) envia o numero e o
// token para /api/desenho e (4) exibe o SVG devolvido pelo servidor.
//
// Nenhum valor de configuracao fica escrito neste arquivo: trocar o projeto no
// Google Cloud nao exige mexer no codigo, apenas atualizar a variavel de
// ambiente do Pages.

let idToken = "";
let clientId = "";

const formulario = document.getElementById("formulario");
const campoNumero = document.getElementById("numero");
const area = document.getElementById("desenho");
const mensagem = document.getElementById("mensagem");
const botaoBaixar = document.getElementById("baixar");

let svgAtual = "";

function mostrarErro(texto) {
  mensagem.textContent = texto;
}

// Le o Client ID da rota /api/config, que o serve a partir do ambiente.
async function carregarClientId() {
  const resposta = await fetch("/api/config", { cache: "no-store" });

  if (!resposta.ok) {
    throw new Error("config: " + resposta.status);
  }

  const dados = await resposta.json();
  return dados.clientId || "";
}

function receberCredencial(resposta) {
  idToken = resposta.credential;
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

  if (idToken === "") {
    mostrarErro("Faça login com o Google antes de desenhar.");
    return;
  }

  try {
    const resposta = await fetch("/api/desenho", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ numero }),
    });

    if (resposta.status === 400) {
      mostrarErro("Número inválido: envie um inteiro entre 1 e 100.");
      return;
    }

    if (resposta.status === 401) {
      mostrarErro("Não foi possível validar sua conta. Faça login com o Google novamente.");
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

// Inicio: primeiro descobre o Client ID, depois monta o botao do Google.
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
