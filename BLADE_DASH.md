# Blade Dash — documentação completa (para integrar com outro projeto)

> Este documento descreve o **Blade Dash**, o launcher de jogos estilo dashboard do Xbox 360 que já está pronto e instalado neste PC.
> Foi escrito para ser colado em outro chat/projeto (ex.: um dashboard pessoal estilo "Jarvis" que pergunta no início
> *"vai jogar ou vai fazer outra coisa?"* e, se for jogar, abre o Blade Dash).

---

## 1. Resumo em uma frase

App desktop (Electron) para Windows que **detecta todos os jogos instalados** (Steam, Epic, Ubisoft Connect, EA app, Xbox/Microsoft Store e jogos adicionados à mão), mostra as **capas** num visual igual ao **dashboard do Xbox 360** (Metro 2011 por padrão, ou Blades 2005), funciona com **controle, teclado e mouse**, e **abre o jogo** escolhido, minimizando enquanto você joga e voltando quando o jogo fecha.

## 2. Onde está tudo

| O quê | Onde |
|---|---|
| Código do projeto | `C:\Users\vitor\OneDrive\Área de Trabalho\Projetos\blade-dash` |
| Repositório | https://github.com/vitorhugoramosd/InterfaceXbox360 (branch `main`) |
| Atalho | `Área de Trabalho\Blade Dash.lnk` |
| Dados do usuário | `%APPDATA%\blade-dash\library.json` |
| Capas baixadas | `%APPDATA%\blade-dash\covers\` |
| Logo/ícone pessoal (Xbox) | `blade-dash\assets\local\` (fora do git, de propósito: marca registrada) |
| Início automático | Registro `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, valor **`Blade Dash`** |

**Stack:** Electron 33.2.1, JavaScript puro (CommonJS no processo principal, ES modules na interface), **sem bundler, sem framework, sem dependências** além do Electron. Node 22 instalado na máquina. Interface toda em pt-BR.

## 3. Como abrir o Blade Dash (o mais importante para a integração)

O app roda em modo desenvolvimento (não é um .exe empacotado). O comando é:

```
"C:\Users\vitor\OneDrive\Área de Trabalho\Projetos\blade-dash\node_modules\electron\dist\electron.exe" "C:\Users\vitor\OneDrive\Área de Trabalho\Projetos\blade-dash"
```

Ou abrir o atalho `Blade Dash.lnk` da Área de Trabalho. Ou, na pasta do projeto: `npm start`.

Comportamentos úteis:
- **Instância única:** se já estiver aberto, abrir de novo só **traz a janela pra frente** (não abre duas). Então o Jarvis pode simplesmente "abrir" o Blade Dash sempre que o usuário escolher jogar.
- **Atalho global** `Ctrl + Alt + Home`: traz o Blade Dash de volta de qualquer lugar.
- Abre em **tela cheia** (configurável).
- Exemplo em Node para o outro projeto abrir o Blade Dash:

```js
const { spawn } = require('child_process');
const DIR = 'C:\\Users\\vitor\\OneDrive\\Área de Trabalho\\Projetos\\blade-dash';
spawn(`${DIR}\\node_modules\\electron\\dist\\electron.exe`, [DIR], { detached: true, stdio: 'ignore' }).unref();
```

> ⚠️ **Os caminhos têm espaços e acento ("Área de Trabalho")**: sempre passe entre aspas / como argumento separado.
> Isso já causou um bug no registro de início automático (corrigido).

### Conflito de início automático (decidir no outro projeto)

Hoje o **Blade Dash abre sozinho quando o Windows liga**. Se o Jarvis passar a ser o app que abre no início e pergunta "jogar ou fazer outra coisa", o Blade Dash **não deve mais abrir sozinho**. Formas de desligar:
1. No próprio Blade Dash: **configurações → Iniciar com o Windows → Desligado** (remove o valor do registro na hora); ou
2. Remover o valor `Blade Dash` de `HKCU\...\Run` e colocar `"autostart": false` em `library.json` → `settings` (senão o Blade Dash recria o registro na próxima vez que abrir).

## 4. Funcionalidades

- **Detecção automática de jogos** (~3 s):
  - **Steam:** lê `libraryfolders.vdf` + `appmanifest_*.acf` de todas as bibliotecas (C: e D:); lê "jogado por último" e tempo de jogo do próprio Steam. Ignora redistributables/ferramentas.
  - **Epic:** manifests em `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item`.
  - **Ubisoft Connect:** registro `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs`.
  - **EA app:** chaves de desinstalação do registro (jogos que também estão na Steam ficam só como Steam).
  - **Xbox / Microsoft Store:** pacotes Appx com `MicrosoftGame.config` (via PowerShell).
  - **Personalizado:** qualquer .exe/.lnk/.bat/.url adicionado em "Adicionar Jogo".
  - **Pastas de jogos soltos:** toda subpasta de `<disco>:\Games` e `<disco>:\Jogos` (ex.: `D:\Jogos\Marvels SpiderMan Remastered`) vira um jogo; o executável é o maior `.exe` até 2 níveis abaixo (ignora instaladores/redistribuíveis). O nome oficial vem da busca na Steam. Pastas já cobertas por um launcher não duplicam.
- **HD removível (o D: é externo):** jogos de um disco desconectado continuam na lista, apagados com a marca "HD D: desconectado", e não abrem (mensagem pedindo para conectar). O app confere os discos a cada 8 s e **reescaneia sozinho** quando um disco é conectado ou removido.
- **Capas e imagens de fundo automáticas:** cache local da Steam → CDN da Steam → busca por nome na loja da Steam (para jogos de outras lojas e personalizados) → logo do pacote (Xbox) → capa gerada (gradiente + nome). Baixa em segundo plano, 4 por vez; falhas só são tentadas de novo após 24 h. Capa pode ser trocada manualmente.
- **Lançar jogos:** Steam `steam://rungameid/<id>`, Epic `com.epicgames.launcher://apps/...?action=launch&silent=true`, Ubisoft `uplay://launch/<id>/0`, Xbox `explorer.exe shell:AppsFolder\<PFN>!<AppId>`, personalizados executando o arquivo.
- **Detecta quando o jogo está rodando** (processo dentro da pasta do jogo, checagem a cada 3 s): minimiza o dashboard, conta **tempo de jogo**, grava **jogado por último** e restaura a janela quando o jogo fecha.
- **Favoritos, ocultar, renomear, trocar capa, remover** (personalizados).
- **Configurações:** iniciar com o Windows, tela cheia, sons da interface, visual (Metro/Blades), jogos ocultos, minimizar, sair, desligar o PC (com confirmação).
- **Sons** sintetizados (WebAudio) — nenhum som original do console.
- **Não instalados (Steam):** lista os jogos da biblioteca Steam que não estão no PC (lidos de `appcache\librarycache` + `appinfo.vdf` binário, só `type: game`; hoje 19). Botão **Baixar** abre `steam://install/<appid>` (a Steam pergunta o disco). Epic não guarda a biblioteca localmente, então não entra.
- **Downloads:** acompanha downloads/atualizações da Steam pelos `appmanifest_*.acf` (progresso, fila, pausado); mostra barra no início, nos blocos e no topo; avisa "pronto para jogar!".
- **Armazenamento:** espaço livre/total de cada disco e quanto os jogos ocupam (maiores jogos por disco). Em configurações → Armazenamento.
- **Loja:** aba "loja" com ofertas da Steam (desconto, preço em R$, marca "na biblioteca") e jogos grátis da Epic (atuais e "em breve"); cache de 1 h. Abre a página no app da Steam (`steam://store/<appid>`) ou no navegador (só domínios das lojas Steam/Epic).

## 5. Visual

### Metro (2011) — padrão
Fundo cinza claro, abas em minúsculas no topo, blocos (tiles) retos, foco com borda branca. As abas vizinhas "espiam" nas bordas da tela.
- **início:** coluna esquerda (Jogar <último jogo>, Meus Favoritos, Recentes); bloco grande central com a arte do jogo em destaque (troca a cada 8 s entre recentes/favoritos); dois blocos largos embaixo; coluna direita (outro jogo, Adicionar Jogo, Atualizar Biblioteca).
- **jogos:** todas as capas em 2 fileiras com rolagem horizontal.
- **recentes:** blocos largos dos últimos jogados.
- **plataformas:** um bloco por loja com contagem; abre a lista só daquela loja.
- **configurações:** cartão do jogador + blocos de configuração.

### Blades (2005) — opcional
Lâminas coloridas (jogos verde, recentes azul, sistema prata, perfil laranja) que deslizam como páginas, orbe brilhante no fundo.

### Abertura
Se existir `assets/local/logo.png`, mostra a **esfera do Xbox** girando com brilho (~2,4 s, qualquer botão pula). Sem ela, usa a animação própria (orbe verde).

## 6. Controles

| Ação | Controle | Teclado |
|---|---|---|
| Mover | D-pad / analógico | Setas / WASD |
| Selecionar / Jogar | A | Enter / Espaço |
| Voltar | B | Esc / Backspace |
| Opções do jogo | X / Start | X / Tab |
| Favoritar | Y | Y / F |
| Trocar aba | LB / RB | Q / E, PageUp / PageDown |
| Grade ⇄ fileira (Blades) | Back | G |
| Guia | Guide | Home / F1 |

Mouse: passar por cima foca, clique seleciona, botão direito volta, roda rola. Cursor some após 3 s parado.

## 7. Dados salvos — `%APPDATA%\blade-dash\library.json`

O outro projeto pode **ler** este arquivo (somente leitura; o Blade Dash grava de forma atômica) para, por exemplo, mostrar "último jogo jogado" ou um botão "continuar jogando" direto no Jarvis.

```jsonc
{
  "version": 1,
  "settings": { "autostart": true, "fullscreen": true, "sounds": true, "startView": "games", "theme": "metro" },
  "overrides": { "<id>": { "favorite": true, "hidden": false, "customName": "...", "customCover": "C:\\...jpg" } },
  "custom":   [ { "id": "custom:3d835ecdc0b0", "name": "The Last of Us Part I", "exePath": "D:\\Games\\The Last of Us - Part I\\tlou-i.exe", "args": "", "addedAt": 1794067331757 } ],
  "stats":    { "<id>": { "lastPlayed": 1730900000000, "playtimeMinutes": 0, "addedAt": 1794067322017 } },
  "cache": [  // resultado bruto do último scan (nomes SEM customName aplicado)
    {
      "id": "steam:3405690", "source": "steam", "nativeId": "3405690",
      "name": "EA SPORTS FC 26",
      "installDir": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\FC 26",
      "launch": { "type": "uri", "target": "steam://rungameid/3405690", "args": "" },
      "lastPlayed": 1793555808000, "playtimeMinutes": 1056
    }
  ],
  "cacheAt": 1794067333310
}
```

- **IDs:** `<fonte>:<id nativo>` — ex.: `steam:3405690`, `epic:Turkey`, `ubisoft:13504`, `xbox:Microsoft.FlightSimulator_8wekyb3d8bbwe`, `custom:<hash>`.
- **Último jogado / tempo de jogo:** o maior entre `cache[i]` (vem do Steam) e `stats[id]` (contado pelo Blade Dash).
- **Capas:** `%APPDATA%\blade-dash\covers\<fonte>_<idNativo>.jpg` e `..._hero.jpg` (personalizada: `..._custom.<ext>`). Ex.: `steam_3405690.jpg`, `custom_3d835ecdc0b0_hero.jpg`.
- **`launch.type`:** `uri` (abrir com o protocolo), `appx` (`explorer.exe <target>`), `exe` (executar o arquivo).

## 8. Arquitetura do código

```
blade-dash/
  package.json              "main": "src/main/main.js"; scripts: start, scan
  CONTRACT.md               contrato original entre backend e interface
  src/main/main.js          janela, IPC, início automático, atalho global, minimizar/restaurar ao jogar
  src/main/preload.js       expõe window.dash para a interface
  src/main/library/
    index.js                API: init, getGames, rescan, launch, updateGame, addCustomGame, removeCustomGame,
                            getSettings, setSettings; eventos 'game-state' e 'covers-updated'
    scanners/               steam.js epic.js ubisoft.js ea.js xbox.js custom.js
    covers.js               resolve/baixa/cacheia capas
    launcher.js             abre jogos e detecta quando estão rodando
    store.js                library.json (gravação atômica)
    vdf.js util.js          parser VDF da Steam, utilitários
  src/renderer/
    index.html
    styles/                 base.css blades.css screens.css overlays.css metro.css
    js/main.js              inicialização, escolhe tema, roteia entradas
    js/input.js             controle/teclado/mouse → ações (up/down/a/b/x/y/lb/rb/guide)
    js/sound.js             sons WebAudio
    js/api.js mock.js       window.dash ou mock (abrir index.html no navegador funciona com jogos de exemplo)
    js/store.js app.js      estado e eventos
    js/ui/                  tema Blades + peças comuns (actions, modal, cover, toast, hints, boot...)
    js/metro/               tema Metro (shell, page, tiles, pivots)
  scripts/
    scan-test.js            testa a detecção sem interface (node scripts/scan-test.js [--fresh])
    smoke-main.js           abre o app real, navega e salva prints (npx electron scripts/smoke-main.js <pasta>)
    make-icon.js            gera a orbe verde (assets/icon.ico)
    make-logo.js            recorta a esfera de uma imagem de logo → assets/local/logo.png + icon.ico
```

**API exposta à interface (`window.dash`):** `getGames, rescan, launch(id), updateGame(id, patch), addCustomGame(), pickCover(id), removeCustomGame(id), getSettings, setSettings(patch), getProfile, onGameState(cb), onGamesUpdated(cb), minimize, quit, toggleFullscreen, shutdownPC`,
e na v2: `getUninstalled, install(id), getDownloads, getStorage, getOffers(force), openStore(target), onDownloads(cb), onUninstalledUpdated(cb)` (detalhes em `CONTRACT.md`).
Abas do visual Metro: início, jogos, recentes, plataformas, **loja**, configurações.

## 9. Jogos detectados hoje (13)

Steam: EA SPORTS FC 26, Poly Bridge, LEGO Star Wars: The Skywalker Saga, STAR WARS Jedi: Survivor ·
Epic: Borderlands: The Pre-Sequel · Ubisoft: Assassin's Creed Valhalla, Scott Pilgrim ·
Xbox: Microsoft Flight Simulator, Minecraft for Windows, Minecraft Launcher, Minecraft Preview, Minecraft: Java Edition ·
Personalizado: The Last of Us Part I (`D:\Games\The Last of Us - Part I\tlou-i.exe`).

## 10. Limitações conhecidas / não testado

- **Controle físico não foi testado** (só teclado/mouse). O botão **Guide** costuma não chegar ao app no Windows — por isso o guia também abre com Home/F1.
- Fluidez das animações não foi medida.
- Capas imperfeitas: Scott Pilgrim pegou a do "Scott Pilgrim EX"; Flight Simulator pegou a da versão 2024 (trocáveis em X → Trocar capa).
- A pasta do Scott Pilgrim informada pela Ubisoft (`D:\Games\Scott Pilgrim`) não existe no disco.
- App não é empacotado (.exe próprio); roda via `electron.exe` + pasta do projeto.

## 11. Ideias de integração com o "Jarvis"

1. Jarvis abre no início do Windows e pergunta **"Vai jogar ou vai fazer outra coisa?"**.
2. **Jogar** → executa o comando da seção 3 (o Blade Dash abre em tela cheia ou vem pra frente se já estiver aberto).
3. Bônus: ler `library.json` para mostrar no Jarvis o **último jogo jogado** com a capa (`covers/`), e um botão "Continuar <jogo>" que lança direto pelo `launch.target`, sem passar pelo Blade Dash.
4. Desligar o início automático do Blade Dash (seção 3) para não abrirem os dois juntos.
