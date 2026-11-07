# Blade Dash — contrato entre as partes

Launcher de jogos para Windows, estilo dashboard "blades" do console de 2005 (verde, lâminas, orbe brilhante).
Electron 33+, JavaScript puro (CommonJS no main, sem bundler, sem TypeScript). UI em pt-BR.

## Estrutura

```
blade-dash/
  package.json            # "main": "src/main/main.js"
  src/main/main.js        # janela Electron, IPC (INTEGRADOR)
  src/main/preload.js     # expõe window.dash (INTEGRADOR)
  src/main/library/       # BACKEND (subagente A)
    index.js              # exporta API abaixo
    scanners/steam.js epic.js ubisoft.js ea.js xbox.js custom.js
    covers.js             # resolve/baixa/cacheia capas
    launcher.js           # lança jogos e detecta quando fecham
    store.js              # persistência JSON (overrides do usuário, playtime, settings)
  src/renderer/           # UI (subagente B) — index.html, styles/*.css, js/*.js, sem build
```

## Objeto Game (o que a UI recebe)

```js
{
  id: "steam:2669320",          // "<source>:<idNativo>", estável entre scans
  source: "steam" | "epic" | "ubisoft" | "ea" | "xbox" | "custom",
  name: "EA SPORTS FC 26",      // já com customName aplicado; sem ™ ®
  cover: "file:///C:/.../covers/steam_2669320.jpg" | null,  // retrato ~600x900
  hero:  "file:///..." | null,  // imagem larga de fundo (opcional)
  installDir: "D:\\SteamLibrary\\steamapps\\common\\...",
  lastPlayed: 1730900000000 | null,   // ms epoch
  playtimeMinutes: 0,
  favorite: false,
  hidden: false,
  addedAt: 1730900000000
}
```

## API do backend (`src/main/library/index.js`)

```js
const lib = require('./library');
await lib.init({ dataDir })          // dataDir = app.getPath('userData')
await lib.getGames()                 // Game[] (do cache; faz scan se nunca escaneou)
await lib.rescan()                   // Game[] — reescaneia todos os launchers
await lib.launch(id)                 // { ok: true } | { ok: false, error: "mensagem pt-BR" }
await lib.updateGame(id, patch)      // patch: { favorite?, hidden?, customName?, customCover? (caminho de imagem local) }
await lib.addCustomGame({ name, exePath, args })   // Game
await lib.removeCustomGame(id)
lib.getSettings()                    // { autostart, fullscreen, sounds, startView }
await lib.setSettings(patch)
lib.on('game-state', ({ id, running }) => {})        // EventEmitter
lib.on('covers-updated', (games) => {})              // capas baixadas em background
```

## API exposta à UI (`window.dash`, via preload)

```js
dash.getGames()            -> Promise<Game[]>
dash.rescan()              -> Promise<Game[]>
dash.launch(id)            -> Promise<{ok, error?}>
dash.updateGame(id, patch) -> Promise<Game>
dash.addCustomGame()       -> Promise<Game|null>   // abre diálogo de escolher .exe
dash.pickCover(id)         -> Promise<Game|null>   // abre diálogo de escolher imagem
dash.removeCustomGame(id)  -> Promise<void>
dash.getSettings()         -> Promise<Settings>
dash.setSettings(patch)    -> Promise<Settings>
dash.getProfile()          -> Promise<{ name }>    // nome do usuário do Windows
dash.onGameState(cb)       // cb({id, running})
dash.onGamesUpdated(cb)    // cb(Game[])
dash.minimize()  dash.quit()  dash.toggleFullscreen()
dash.shutdownPC()          // desligar o PC (UI SEMPRE confirma antes)
```

Quando `window.dash` não existe (abrir index.html no navegador), a UI usa um mock com jogos de exemplo.
