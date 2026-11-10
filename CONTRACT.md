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

## v2 — não instalados, downloads, armazenamento, ofertas

Backend (`lib`), todos nunca lançam exceção para a UI (retornam vazio/erro amigável):

```js
await lib.getUninstalled()   // UninstalledGame[] — jogos da biblioteca Steam que não estão instalados
// { id: "steam:1245040", source: "steam", name, cover, hero, installed: false }
await lib.install(id)        // { ok, error? } — abre steam://install/<appid> (diálogo de instalação da Steam)
lib.getDownloads()           // Download[] — downloads/atualizações em andamento (Steam, via appmanifest)
// { id, name, cover, state: "downloading"|"paused"|"queued"|"updating", progress: 0..1, bytesDownloaded, bytesTotal }
await lib.getStorage()       // Drive[]
// { drive: "C:", label: "Windows", total, free, gamesBytes, games: [{ id, name, bytes }] }  (bytes = número)
await lib.getOffers({force}) // { fetchedAt, currency: "BRL",
//   steam: [{ appid, name, image, discount, originalPrice, finalPrice, priceText, originalText, url, owned }],
//   epicFree: [{ title, image, url, startDate, endDate, current: true|false }] }   cache de 1 h
await lib.openStore(target)  // { ok, error? } — target: "steam:<appid>" | URL https das lojas Steam/Epic (whitelist)
// Eventos: 'downloads' (Download[]) a cada mudança; 'uninstalled-updated' (UninstalledGame[]);
//          quando um download termina, o jogo entra em getGames() e 'covers-updated' é emitido.
// Game ganha campos: sizeBytes (número|null), drive ("C:"|null).
```

UI (`window.dash`): `getUninstalled() install(id) getDownloads() getStorage() getOffers(force) openStore(target)
onDownloads(cb) onUninstalledUpdated(cb)`.

## v3 — Gaming Wrapped (sessões de jogo + retrospectiva)

Backend:

```js
// Sessões registradas em library.json: sessions: [{ gameId, name, start, end, via: "dash"|"detected" }]  (ms epoch)
// - "dash": jogo aberto pelo Blade Dash; "detected": processo de um jogo conhecido visto rodando
//   (aberto pela Steam/Epic/etc.) — monitor global sempre ligado, 1 checagem a cada ~20 s.
// - sessões < 1 min descartadas; pausas < 3 min do mesmo jogo são unidas; sessão aberta é fechada
//   com o último "visto rodando" se o app/PC fechar no meio (nunca conta tempo com o app fechado).
await lib.getWrappedPeriods()  // [{ key: "2026-11"|"2026", period: "month"|"year", year, month?, label: "novembro de 2026"|"2026",
                               //    minutes, complete: bool (período já acabou), seen: bool }]  (só períodos com dados; mais recente primeiro)
await lib.getWrapped(key)      // Wrapped | { hasData: false, label }
await lib.markWrappedSeen(key)
// Evento 'sessions-updated' quando uma sessão é registrada/fechada.

// Wrapped:
{
  key, period, label, from, to, complete, hasData: true,
  totalMinutes, sessions, daysPlayed, gamesPlayed,
  topGames: [{ id, name, cover, hero, source, minutes, sessions, share /*0..1*/ }],   // até 5
  longestSession: { id, name, cover, hero, minutes, start, end },
  favoriteHour: { hour /*0..23*/, minutes }, hourHistogram: [24 números, minutos],
  favoriteWeekday: { day /*0=domingo*/, label: "sábado", minutes }, weekdayHistogram: [7],
  longestStreakDays,             // maior sequência de dias seguidos jogando
  busiestDay: { date /*ms início do dia*/, minutes },
  lateNightMinutes,              // 0h–5h
  newGames: [{ id, name, cover }],  // jogados pela 1ª vez no período
  previous: { label, totalMinutes, deltaPct } | null,   // comparação com o período anterior
  personality: { key, title, desc }  // ex.: "corujao", "maratonista", "fiel", "explorador", "fim-de-semana", "casual"
}
```

UI (`window.dash`): `getWrappedPeriods() getWrapped(key) markWrappedSeen(key) onSessionsUpdated(cb)`.

Quando `window.dash` não existe (abrir index.html no navegador), a UI usa um mock com jogos de exemplo.
