# Blade Dash

Launcher de jogos para Windows com visual inspirado no dashboard clássico de "blades" dos consoles de 2005.
Liga o PC, abre o dashboard, escolhe o jogo com o controle e joga.

- Detecta jogos da **Steam**, **Epic Games**, **Ubisoft Connect**, **EA app** e **Xbox / Microsoft Store**
- Jogos instalados por fora podem ser adicionados em **Jogos → Adicionar Jogo**
- Baixa capas e imagens de fundo automaticamente (capa trocável em **X → Trocar capa**)
- Controla tudo pelo controle (Xbox/XInput), teclado ou mouse
- Conta tempo de jogo e "jogado por último"; minimiza ao abrir um jogo e volta quando ele fecha
- Inicia junto com o Windows em tela cheia (configurável em **Sistema**)

## Rodando

```bash
npm install
npm start
```

Atalho global para trazer o dashboard de volta: **Ctrl + Alt + Home**.

## Controles

| Ação | Controle | Teclado |
|---|---|---|
| Mover | D-pad / analógico | Setas / WASD |
| Selecionar / Jogar | A | Enter / Espaço |
| Voltar | B | Esc / Backspace |
| Opções do jogo | X / Start | X / Tab |
| Favoritar | Y | Y / F |
| Trocar blade | LB / RB | Q / E |
| Grade ⇄ fileira | Back | G |
| Guia | Guide | Home / F1 |

## Estrutura

- `src/main/` — processo principal do Electron (janela, IPC)
- `src/main/library/` — scanners dos launchers, capas, lançamento e persistência
- `src/renderer/` — interface (HTML/CSS/JS puro, sem build)
- `scripts/scan-test.js` — testa a detecção de jogos sem abrir a interface
- `scripts/smoke-main.js` — abre o app, navega e salva prints

Os dados ficam em `%APPDATA%\blade-dash\` (`library.json` e `covers/`).
