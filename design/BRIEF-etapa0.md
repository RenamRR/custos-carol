# Etapa 0 — Mockup visual do Custos Carol v2 (para o Quartzo)

Maestro: Genesis. Plano completo: `C:\Users\Usuario\Desktop\Form\Obsidian\Renam-AI\11 - custos carol\V2-Plano.md` — leia antes.

## Contexto em 4 linhas
App pessoal da Carol (confeiteira, vende brownies por **encomenda no WhatsApp** e em **feiras/porta a porta**).
Ela usa **no celular**, muitas vezes com a mão suja de massa: alvos de toque grandes, poucos campos por tela, números grandes.
O Renam (namorado) também usa, mais no PC. Português do Brasil, R$ com vírgula.
A v1 era uma página de tabelas de desktop — é exatamente o que NÃO queremos repetir.

## Marca (da logo dela: `design/logo-carol.jpeg` — abra a imagem)
"Carol Brownie" em letra cursiva marrom-chocolate, batedor de arame desenhado a traço, coração vermelho,
fundo mostarda dourado com foto de brownie esmaecida. Cores medidas na imagem:

| Papel | Hex |
|---|---|
| Mostarda (fundo da marca) | `#DF9D2D` |
| Chocolate (texto da logo) | `#3B1100` |
| Vermelho do coração | `#A80204` |
| Caramelo claro / escuro (da foto) | `#B48034` / `#9D6D21` |

Direção aprovada pelo Renam: **"confeitaria quente"** — chocolate, creme, caramelo, título com tipografia elegante
(uma script/serif nos títulos combinando com a logo; corpo e números em sans legível com algarismos tabulares).
Mostarda é cor de marca/destaque, não fundo de tudo. Fundo creme. Vermelho do coração só para acento pontual
(ou alerta), nunca como cor de erro genérica em todo lado. Contraste AA de verdade — mostarda com texto branco
provavelmente reprova: confira. Tema escuro é opcional nesta etapa.

## Entrega
Um **HTML único** `design/mockup-v2.html` (sem build, pode usar fonte do Google Fonts), mostrando as telas lado
a lado dentro de molduras de celular (~390px de largura), com dados realistas. Logo pela imagem
`logo-carol.jpeg` (mesma pasta). Telas:

1. **Login** — logo, usuário/senha, entrar.
2. **Início** — resumo do mês (faturamento, lucro, nº vendido), 1–2 alertas ("o creme de avelã subiu 18%:
   margem do Nutella caiu de 52% para 41%"), atalho grande para Vender.
3. **Produtos** — lista de cards: nome, custo por unidade, preço de encomenda e de feira, margem com etiqueta
   (verde ≥50%, âmbar 35–50%, vermelho <35%).
4. **Detalhe do produto** — de onde vem o custo (ingredientes, embalagem, forno, mão de obra, perda) como barra
   ou lista ordenada; preço sugerido por canal.
5. **Vender** — registrar venda em poucos toques: escolher produto (botões grandes), quantidade (+/−), canal
   (Encomenda/Feira), pagamento (Pix/Débito/Crédito/Dinheiro), preço já preenchido, confirmar.
6. **Produzir** — "quantas fornadas de cada" com +/− e a lista de compras resultante, arredondada para o pacote
   ("Cacau 70%: 405 g → 1 pacote de 500 g · R$ 30,00"), total previsto.

Barra inferior: Início · Produtos · **Vender** (botão central em destaque) · Produzir · Mais.

Dados: use os produtos reais — Brownie Tradicional, Redvelvet, Cookie (valores em `src/db/dados-iniciais.ts`)
e Brownie Nutella (invente valores plausíveis, uns R$ 4–5 de custo, venda R$ 14). Nada de lorem ipsum.

## Fora do escopo
Nada de código do app (Next, banco) nesta etapa. Não mexa em `src/`. Não faça commit.

## Ao terminar
Reporte com `maestri ask "Genesis" "<resumo: arquivo, decisões de fonte/cor, contraste conferido, dúvidas>"`.
