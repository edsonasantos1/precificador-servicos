# Precificador de Serviços: como publicar

Esta pasta é o app completo. Ele funciona em qualquer hospedagem de arquivos estáticos com HTTPS, sem servidor nem banco de dados.

## Onde está publicado

O app é publicado pelo GitHub Pages a partir da branch `main` deste repositório:
https://edsonasantos1.github.io/precificador-servicos/

Para atualizar: troque os arquivos na branch `main` e, antes, mude o valor de `VERSAO` no arquivo `sw.js`, para os celulares baixarem a versão nova. O Pages publica sozinho em 1 a 2 minutos.

## Instalar no celular

- Android (Chrome): abra o link, toque no menu ⋮ e em "Instalar app" ou "Adicionar à tela inicial".
- iPhone (Safari): abra o link, toque em Compartilhar e em "Adicionar à Tela de Início".

Depois de aberto uma vez, o app funciona sem internet. Os dados ficam só no aparelho.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| index.html | Telas do app |
| app.js | Interface (orçamento rápido e configuração da empresa) |
| calc.js | Motor de cálculo (regimes, transição 2026–2033, reduções) |
| servicos.json | 200 itens da LC 116 com NBS, cClassTrib e reduções |
| sw.js | Funcionamento offline |
| manifest.webmanifest, icon-*.png | Instalação no celular |

As alíquotas por ano e as tabelas do Simples ficam no topo de `calc.js` (`ANOS` e `SIMPLES`).
