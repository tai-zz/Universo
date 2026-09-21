# Universo ✦

Um mapa estelar navegável para guardar tudo que você descobre sobre alguém.
Cada galáxia é um campo de conhecimento, cada planeta um gosto, cada lua um detalhe.

## Como abrir

Dê **dois cliques em `index.html`**. É só isso — não precisa instalar nada.

Se preferir abrir por um endereço local (útil para acessar do celular na mesma rede):

```bash
node serve.js
```

E abra `http://localhost:4173`.

## A entrada

A tela começa preta, com um único ponto branco no meio.
**Clique no ponto** → aparece o campo de senha → digite **R15** → Big Bang →
o universo nasce em volta de você.

A senha não diferencia maiúscula de minúscula, e o navegador lembra dela: quem
já entrou uma vez vai direto para o Big Bang. Para trocar a senha, mude a linha
`var SENHA = 'R15';` no começo do `js/ui.js`.

> **A senha é um portão, não um cofre.** Ela segura quem chegar sem querer, mas
> não segura quem for olhar o código: a senha está escrita no `js/ui.js` e o
> `universo.json` pode ser lido direto no repositório, que é público. Para
> privacidade de verdade, o caminho é repositório privado + Netlify ou Vercel.

## Como se navega

O universo mostra **um nível de cada vez**.

No começo você vê só o centro e as **galáxias** em volta dele. Cada astro que
tem coisas dentro aparece com um **aro tracejado** e um aviso embaixo do nome
(“3 ASTROS”).

**Clique na galáxia** → você entra nela: a galáxia vai para o centro da tela e
os astros daquele sistema aparecem orbitando. Clique de novo num planeta e você
entra nele, vendo as luas. E assim por diante, sem limite de profundidade.

Para voltar: botão **← Voltar**, tecla `esc`, clique duplo no vazio, ou o
caminho “dentro de Ela › Animes › …” no topo, que leva direto a qualquer nível.

## Cada astro reage do jeito dele

Clicar num astro dispara uma animação que combina com o que ele é:

| Astro | O que acontece |
|---|---|
| Galáxia | os braços aceleram, o núcleo brilha e saem ondas |
| Supernova | explode: onda de choque + estilhaços de luz |
| Buraco negro | suga tudo em volta numa espiral, o anel de luz se fecha |
| Estrela / Estrela-mãe | as pontas de difração se esticam e saem raios |
| Lua | a sombra atravessa: as fases da lua em segundos |
| Cometa | dispara e deixa rastro, a cauda estica |
| Pulsar | dispara pulsos em sequência |
| Quasar | os jatos disparam para longe |
| Constelação | as linhas se desenham traço a traço |
| Nebulosa | a nuvem respira e solta faíscas |
| Asteroide | treme, gira e lasca pedaços |
| Planeta anelado | os anéis se soltam e se abrem |
| Planeta / tipos novos | anel de luz limpo saindo do corpo |

Quando o astro tem um sistema dentro, a animação toca e **depois** a câmera
mergulha nele — clique, reação, entrada.

## A estrutura

O universo começa **vazio**: só a estrela-mãe, sozinha no escuro. Tudo o que
vier depois é você que cria, com **+ Criar astro**. A ideia é mais ou menos
esta:

```
Ela  (estrela-mãe, o centro de tudo)
 ├── Animes            ← galáxia  (campo de conhecimento)
 │    └── Jujutsu Kaisen   ← planeta (um gosto específico)
 │         ├── Nanami          ← lua (personagem, detalhe)
 │         └── Trilha sonora   ← lua
 ├── Comidas           ← galáxia
 ├── O que ela não gosta   ← buraco negro
 ├── Momentos marcantes    ← supernova
 └── Sonhos e planos       ← cometa
```

Nada disso é obrigatório: qualquer astro pode orbitar qualquer outro, em qualquer
profundidade. E além da hierarquia existem as **conexões livres** (linhas
pontilhadas) para ligar coisas de galáxias diferentes — tipo "ela descobriu essa
música por causa desse anime".

## Como usar

| Ação | O que faz |
|---|---|
| Clique num astro com coisas dentro | entra nele (não abre painel) |
| Clique num astro sem nada dentro | abre o painel com tudo que ele guarda |
| Clique no astro do centro | abre o painel dele (o “sobre” da galáxia) |
| ← Voltar / `esc` | sobe um nível |
| Clique duplo no vazio | sobe um nível |
| Arrastar um astro | muda a órbita dele |
| Arrastar o fundo | navega pelo nível |
| Roda do mouse / pinça | zoom |
| `N` | criar um astro novo |
| `espaço` | pausar as órbitas |

- **+ Criar astro** — cria qualquer corpo celeste e escolhe em volta de quem ele orbita.
  Já vem apontado para o nível em que você está.
- **⇄ Conectar** (dentro do painel) — liga dois astros com uma linha e um rótulo.
- **Clique no nome do universo** (canto superior esquerdo) — abre o menu discreto
  com *Renomear universo*, *Tipos de astro*, *Backup dos dados* e *Como funciona*.
- **Tipos de astro** — 15 tipos prontos (galáxia, planeta, lua, buraco negro,
  supernova, quasar, pulsar, cometa, asteroide, nebulosa, constelação, estrela
  binária…) e você cria **quantos quiser**, escolhendo forma, cor e tamanho.
  Também dá para criar um tipo novo na hora, pelo próprio formulário do astro.

## No celular

Em telas de até 760px o universo fica em **modo passeio**: dá para navegar
pelos níveis, ver as animações e entrar nos astros, mas o botão **+ Criar
astro** some e o painel lateral (o “sobre”) não abre — ele tomaria a tela
inteira. O astro clicado responde com a animação e o anel de seleção.

Escrever, editar e ler as anotações é coisa de tela grande. O corte é só de
largura: girar o celular ou abrir no computador libera tudo de novo, na hora.

## Como mandar o universo para ela

O que você escreve fica no **seu** navegador. Mandar o link, sozinho, manda uma
estrela vazia. Para ela ver o que você construiu, o universo precisa ser
**publicado junto com o site**:

1. No site, clique em **Ela** (canto superior esquerdo) → **Backup dos dados**
2. Clique em **★ Gerar universo.json**
3. Mova o arquivo baixado para a pasta do projeto (ao lado do `index.html`)
4. Envie para o GitHub:

```bash
git add universo.json && git commit -m "Publica o universo" && git push
```

Em 1 ou 2 minutos o site no ar já mostra tudo. Quem abrir o link vê o universo
que você publicou, mesmo que nunca tenha escrito nada.

**Para atualizar depois:** repita os 4 passos. O navegador de quem já abriu
detecta que o arquivo mudou e troca pela versão nova sozinho.

Enquanto o arquivo não muda, nada é sobrescrito — você pode continuar editando
no site à vontade que o seu trabalho não se perde ao recarregar a página.

> **Atenção:** o repositório é público. Tudo que entrar no `universo.json` fica
> visível para quem achar o link, e fica no histórico do Git. Se quiser algo
> só entre vocês dois, é melhor deixar o repositório privado e publicar o site
> pelo Netlify ou Vercel, que fazem isso de graça a partir de repositório privado.

O arquivo `universo-AAAA-MM-DD.json` do botão **Exportar backup** é diferente:
ele é o seu backup privado e está bloqueado no `.gitignore`, então nunca vai
para o GitHub por acidente. Só o `universo.json` é publicado.

## Onde os dados ficam

Tudo é salvo **automaticamente no seu próprio navegador** (localStorage), neste
computador. Nada vai para a internet, nada é enviado para lugar nenhum.

Por isso, duas coisas importantes:

1. **Faça backup de vez em quando**: clique no nome do universo →
   `Backup dos dados → Exportar backup (.json)`.
2. Para abrir o mesmo universo em outro aparelho (ou outro navegador), copie a
   pasta e use `Backup dos dados → Importar backup`.

Limpar os dados do navegador apaga o universo — o backup `.json` é a sua
garantia.

## Ao mexer no código

O `index.html` carrega os arquivos com `?v=2` no fim:

```html
<link rel="stylesheet" href="style.css?v=2">
<script src="js/scene.js?v=2"></script>
```

Esse número existe porque o navegador guarda css e js em cache por vários
minutos. Sem ele, quem já abriu o site continuaria rodando a versão antiga
mesmo depois da correção ir para o ar. **Ao mudar qualquer css ou js, suba o
número em todos eles** (v=2 → v=3) antes de publicar. Trocar só o
`universo.json` não precisa: ele já é buscado sem cache.

## Arquivos

```
index.html      estrutura da página
style.css       todo o visual
js/data.js      modelo de dados, órbitas e salvamento
js/scene.js     canvas: céu de fundo, câmera, órbitas, desenho dos astros, Big Bang
js/ui.js        painéis, formulários, menu, importar/exportar
serve.js        servidor local opcional
```

Quer um corpo celeste novo com um desenho que ainda não existe (um wormhole, um
anel de asteroides)? As formas ficam em `js/scene.js`, na função `drawBody` —
cada `case` é uma forma.
