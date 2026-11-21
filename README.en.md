# dsh-model-picker

English | [中文](README.md)

A collapsible, searchable **model picker** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI.

![The model picker open in the composer: providers as collapsible groups, search results, and reasoning-effort chips](docs/preview.svg)

When a profile carries a dozen providers and a hundred models, the built-in model menu lays every row out flat — scrolling to find one model is the slowest part of switching. This plugin gives the menu a browser: models are grouped by provider, every provider folds, and one search field matches model names, model ids and provider names.

## Features

- **Grouped by provider** — every provider is a collapsible section with its model count.
- **Opens where you are** — the provider that holds your current model starts expanded.
- **Search** — matches model name, model id and provider name. Several words are ANDed (`gpt 4.1 mini`), a whole-phrase hit always outranks per-word hits, and short single characters do not match everything.
- **Reasoning effort** — switch the current model's effort from the panel footer.
- **Keyboard** — `↑` `↓` move the highlight, `Enter` selects, `Esc` closes, `Tab` stays inside the panel. IME composition is respected, so pinyin candidate paging is not stolen.
- **One source of truth** — every read and write goes through the shipped `modelDirectories` service, so this panel, the `/model` popup and the composer chip always agree.
- **Does not replace the built-in menu** — it extends it. Other plugins keep working, including their per-model labels.

## Install

### From a local checkout

```sh
git clone https://github.com/CamouflageGe/dsh-model-picker.git
```

Then in the DSH Web GUI open **Plugins → Add plugin** and point it at the cloned directory.

### What it adds to the profile

`cordis.patch.yml` inserts one row:

```yaml
- insert:
    - id: dsh-model-picker
      name: 'dsh-model-picker'
```

## How to use it

1. Click the composer's model button — the picker opens **directly**.
2. Fold the providers you do not need, or type to search.
3. Pick a model — the panel closes and the session switches immediately.
4. The footer switches reasoning effort; below it sit the session options other
   plugins inject (the Agent Teams switch, for example).

## What it replaces

This plugin **takes over the composer's model button**
(`conversation.input.model` at `priority: -1`, below the shipped `0`, so the
built-in button stops rendering) — which is what makes one click enough.

The shipped model menu and its effort pane no longer appear; their capabilities
live on here:

| Shipped capability | Where this plugin carries it |
|---|---|
| the model list | the grouped list plus search |
| reasoning effort | the footer chips |
| session options injected by other plugins (Agent Teams switch, …) | relayed one by one under the footer |
| provider badges (load, promotion, …) | relayed in the button and every row |

### Why relaying is required

The built-in model control is a `single` slot that **declares** two child slots
(`conversation.input.model.label` and `conversation.input.model.options`). The
harness slot registry allows exactly one declarer per key:

- a second registration that declares them throws `already declared`;
- one that declares nothing receives no `renderSlot` face.

So after shadowing, this plugin cannot render those two child slots itself.
Instead it reads each slot's winning registration out of the public registry and
renders that component with the same owner props the built-in control used.

Provider labels (`conversation.input.model.label`):

```js
{ provider, model, placement: 'option' | 'menu' | 'trigger', selected }
```

Session options (`conversation.input.model.options`):

```js
{ locked, dismiss, reportFailure, ...inject(sessionId), t }
```

Every relayed component sits in its own error boundary: one broken plugin
disappears on its own instead of blanking the panel.

### Want the built-in menu back?

Delete the `conversation.input.model` registration (`priority: -1`) inside
`apply()`; the shipped button and menu return and nothing else changes.

## Requirements

- DeepSeek Harness with the Web GUI (`@deepseek-ai/dsh-client-ui-model-selection`
  must be active — it is part of the standard web composition).
- No configuration fields.

## Development

The client half is a single plain-JavaScript bundle (`client.js`) written
against the gateway's dynamic module format: no build step, no JSX, React from
the shared module table.

```js
window.__ModuleLoader__.load({ id: 'dsh-model-picker', factory(require) { /* … */ } })
```

After editing `client.js`, toggle the plugin off and on in **Plugins** so the
browser loads the new bundle generation.

## Known limitations

- Visual verification is up to the user; this repository ships no automated
  browser test.
- The panel is a modal dialog; it traps `Tab` and closes on `Esc`.
- Search is substring/subsequence matching, not fuzzy typo correction.
- Because it takes over the model button, the shipped menu's native browsing is
  gone; undo it with "Want the built-in menu back?" above if you need it.

## License

[MIT](LICENSE)
