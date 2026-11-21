# dsh-model-picker

English | [中文](README.md)

Makes the provider groups in DeepSeek Harness's **built-in model menu** collapsible.

![Provider groups in the model menu fold on click](docs/preview.svg)

## What it solves

The built-in model menu **already groups models by provider** and **already has a search field** (shown once a catalog holds more than four models, with fuzzy ranking). The only thing it lacks is that a **provider heading cannot be clicked to fold its rows** — with a dozen providers and a hundred models everything stays laid out flat.

This plugin adds exactly that, inside the existing menu:

- **only the provider holding the current model starts open**; every other provider is folded, so the menu opens on the model you are using instead of a hundred rows;
- every provider heading becomes a disclosure control (`role="button"` and `aria-expanded`) with an open/closed chevron;
- groups you open or close by hand keep that state for the page's lifetime, so closing and reopening the menu preserves it;
- while a search query is active every group expands, so results are never hidden;
- keyboard support: `Tab` to a heading, then `Enter` or `Space` to toggle.

## How to use it

1. Click the composer's model button to open the built-in model menu.
2. The provider holding your current model is expanded; the rest are folded with their model counts shown.
3. Click any provider heading to expand it; click again to fold it.
4. The search field keeps working (a built-in feature) and expands every match.

Only the model menu is affected; the command popup's groups are left alone.

## How it works, and why this way

The built-in menu ships prebuilt inside `app.asar` as
`@deepseek-ai/dsh-client-ui-model-selection`. Its `MenuGroup` is an ordinary
component, not a slot, so there is **no extension point that could register a
disclosure control**, and patching it directly would mean editing DSH itself
(lost on every DSH upgrade). This plugin therefore enhances the rendered menu
from the outside:

1. it injects one scoped stylesheet that only applies inside the model menu;
2. it listens for clicks and keys on provider headings;
3. it toggles the group's displayed state through an attribute.

The menu is React-rendered, so a later render can re-create rows and drop a
hand-applied attribute. A `MutationObserver` re-applies the folded state after
any DOM change, so no React code is patched.

## Known limitations and risk

- **This is a DOM-level enhancement.** If a future DSH release renames the group
  markup (`[data-menu-group]`, `[data-menu-group-heading]`) the plugin stops
  working silently — it never breaks the menu, it simply stops folding. Those
  selectors are the sticky-heading contract `observeStickyMenuGroups` itself
  depends on, so they are as stable as that contract.
- Folding is remembered by a group's position in the menu; if the provider order
  changes, a remembered slot may land on a different group.
- No configuration fields.

## What it does not touch

This plugin **registers no slots** and replaces no built-in component, so the
Agent Teams switch, provider badges, price hints and every other existing
contribution keep working exactly as before. Uninstalling restores the original
menu immediately.

## Development

The client half is one plain-JavaScript bundle (`client.js`) written against the
gateway's dynamic module format: no build step and no React dependency, since it
only enhances the DOM.

After editing, toggle the plugin off and on in **Plugins** so the browser loads
the new bundle generation.

## License

[MIT](LICENSE)
