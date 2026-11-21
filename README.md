# dsh-model-picker

English | [中文](README.zh.md)

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

1. Open the model menu from the composer's model button.
2. Pick the first row, **All models (grouped by provider)**.
3. Fold the providers you do not need, or type to search.
4. Pick a model — the panel closes and the session switches immediately.

## Why it extends instead of replacing the built-in menu

The built-in model control is a `single` slot that **declares** two child slots
(`conversation.input.model.label` and `conversation.input.model.options`). The
harness slot registry allows exactly one declarer per key:

- a second registration that declares them throws `already declared`;
- one that declares nothing receives no `renderSlot` face.

So a plugin that shadows the model control cannot re-host other plugins'
contributions — the Agent Teams switch, provider badges and price tooltips
would all disappear. This plugin therefore contributes two things instead:

| Slot | id | order | Purpose |
|---|---|---|---|
| `conversation.input.model.options` | `model-picker` | `-10` | the entry row inside the built-in menu |
| `conversation.input.overlay` | `model-picker` | `90` | the picker panel (portaled to `document.body`) |

### Provider labels still work

Per-model badges are registered by other plugins into the child slot
`conversation.input.model.label`. Only that slot's declarer may render it, so a
replacement picker would drop every badge. This plugin reads the winning
registration out of the public registry and renders that component with the
same owner props the built-in control uses:

```js
{ provider, model, placement: 'option' | 'menu' | 'trigger', selected }
```

A failing provider component is contained by an error boundary and degrades to
the plain catalog name, so one broken plugin can never blank the panel.

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

## License

[MIT](LICENSE)
