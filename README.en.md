# dsh-model-picker

English | [中文](README.md)

Makes the provider groups in DeepSeek Harness's **built-in model menu** collapsible: only the provider holding your current model starts open, everything else folds away.

![Only the current provider is expanded in the model menu; the rest are folded](docs/preview.svg)

---

## Install

### Option 1: from the UI (recommended)

1. Open the DSH Web UI.
2. Click **Plugins** in the left sidebar.
3. Click **Add plugin**.
4. Paste this line:

   ```
   github:CamouflageGe/dsh-model-picker
   ```

5. Confirm the installation, then **reload the page**.

> Installation uses `git` and `pnpm`. If `pnpm` is not found, install it first or point the
> plugin manager's `pnpmCommand` at its path.

### Option 2: command line

```sh
dsh plugin install github:CamouflageGe/dsh-model-picker
```

Restart or reload the UI afterwards.

### After installing

Open the model menu (click the model button in the composer). The provider holding your current
model is expanded; the others are folded and show their model counts.

### Uninstall

In **Plugins**, find `dsh-model-picker` and click **Remove**, or:

```sh
dsh plugin remove dsh-model-picker
```

The menu returns to its original behaviour immediately; this plugin stores nothing.

---

## What it solves

The built-in model menu **already groups models by provider** and **already has a search field**
(shown once a catalog holds more than four models, with fuzzy ranking). The only thing it lacks is
that a **provider heading cannot be clicked to fold its rows** — with a dozen providers and a hundred
models everything stays laid out flat.

This plugin adds exactly that, inside the existing menu:

- **only the provider holding the current model starts open**; every other provider is folded, so the
  menu opens on the model you are using instead of a hundred rows;
- every provider heading becomes a disclosure control (`role="button"` and `aria-expanded`) with an
  open/closed chevron;
- groups you open or close by hand keep that state for the page's lifetime;
- while a search query is active every group expands, so results are never hidden;
- keyboard support: `Tab` to a heading, then `Enter` or `Space` to toggle.

## How to use it

1. Click the composer's model button to open the built-in model menu.
2. The provider holding your current model is expanded; the rest are folded with their model counts.
3. Click any provider heading to expand it; click again to fold it.
4. The search field keeps working (a built-in feature) and expands every match.

Only the model menu is affected; the command popup's groups are left alone.

## How it works, and why this way

The built-in menu ships prebuilt inside `app.asar` as
`@deepseek-ai/dsh-client-ui-model-selection`. Its `MenuGroup` is an ordinary component, not a slot,
so there is **no extension point that could register a disclosure control**, and patching it
directly would mean editing DSH itself (lost on every DSH upgrade). This plugin therefore enhances
the rendered menu from the outside:

1. it injects one scoped stylesheet that only applies inside the model menu;
2. it listens for clicks and keys on provider headings;
3. it toggles the group's displayed state through an attribute.

The menu is React-rendered, so a later render can re-create rows and drop a hand-applied attribute.
A `MutationObserver` re-applies the folded state after any DOM change, so no React code is patched.

"The current provider" is located through the menu's own `aria-checked="true"` row, so it does not
depend on provider order or display names.

## Known limitations and risk

- **This is a DOM-level enhancement.** If a future DSH release renames the group markup
  (`[data-menu-group]`, `[data-menu-group-heading]`) the plugin stops working silently — it never
  breaks the menu, it simply stops folding. Those selectors are the sticky-heading contract
  `observeStickyMenuGroups` itself depends on, so they are as stable as that contract.
- Folding is remembered by a group's position in the menu; if the provider order changes, a
  remembered slot may land on a different group.
- No configuration fields.

## What it does not touch

This plugin **registers no slots** and replaces no built-in component, so the Agent Teams switch,
provider badges, price hints and every other existing contribution keep working exactly as before.
Uninstalling restores the original menu immediately.

## Requirements

- DeepSeek Harness with the Web UI.
- `git` and `pnpm` available for installation (both the UI and the CLI path).

## Development

The client half is one plain-JavaScript bundle (`client.js`) written against the gateway's dynamic
module format: no build step and no React dependency, since it only enhances the DOM.

```js
window.__ModuleLoader__.load({ id: 'dsh-model-picker', factory() { /* … */ } })
```

After editing, toggle the plugin off and on in **Plugins** so the browser loads the new bundle
generation.

```sh
git clone https://github.com/CamouflageGe/dsh-model-picker.git
```

## License

[MIT](LICENSE)
