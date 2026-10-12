// functions/api/config.js
// Entrega ao navegador apenas o que a pagina precisa para iniciar o login: o
// Client ID do Google, lido da variavel de ambiente GOOGLE_CLIENT_ID do
// Cloudflare Pages.
//
// O Client ID nao e segredo: ele viaja em toda requisicao do Google Identity
// Services feita pelo navegador. O que este arquivo resolve e o valor deixar de
// estar escrito no codigo — ele passa a existir em um unico lugar, a variavel
// de ambiente do projeto.
//
//   GET /api/config -> 200 {"clientId":"....apps.googleusercontent.com"}
//                      outros metodos -> 405

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return new Response("Metodo nao permitido. Use GET.", {
      status: 405,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const clientId = env.GOOGLE_CLIENT_ID || "";

  return new Response(JSON.stringify({ clientId }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
