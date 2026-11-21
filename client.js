/**
 * Model picker — collapsible provider groups for the BUILT-IN model menu.
 *
 * WHAT THIS PLUGIN IS NOT
 * -----------------------
 * An earlier revision shipped a second, standalone picker panel. That was a
 * mistake: the built-in menu already groups models by provider AND already has
 * a search field (`showSearch`, `rankByName` in ui-model-selection). The only
 * thing it lacks is that a provider heading cannot be clicked to fold its rows
 * away — with a dozen providers and a hundred models every row is laid out flat.
 *
 * So this plugin adds exactly that one missing behaviour, in place, to the
 * shipped menu. Nothing is replaced and no parallel UI exists:
 *
 *   - every provider heading in the built-in model menu becomes a disclosure
 *     button (role="button", aria-expanded) that folds its rows;
 *   - folding is remembered per provider for the page's lifetime;
 *   - while a search query is active every group stays open, so search results
 *     are never hidden behind a stale fold;
 *   - the collapsed state survives the menu closing and reopening.
 *
 * HOW (and why it is done this way)
 * ---------------------------------
 * The shipped menu lives in `@deepseek-ai/dsh-client-ui-model-selection`, which
 * is prebuilt inside `app.asar`. Its `MenuGroup` is an ordinary component, not a
 * slot, so there is no registration point that could add a disclosure there and
 * the installed package cannot be patched without editing DSH itself. This
 * plugin therefore enhances the rendered menu from the outside:
 *
 *   - injects one scoped stylesheet (only under `[data-dsh-model-picker]`);
 *   - listens for clicks on headings inside the model menu's group container;
 *   - toggles a data attribute plus `hidden` on the provider's rows.
 *
 * The menu is React-rendered, so rows it re-creates on a later render would lose
 * a `hidden` attribute applied by hand. A MutationObserver re-applies the folded
 * state whenever the menu's DOM changes, which keeps the visual state correct
 * without patching React.
 *
 * RISK: this is DOM-level enhancement. A future DSH release that renames the
 * group markup (`[data-menu-group]`, `[data-menu-group-heading]`) makes the
 * enhancement silently do nothing — it never breaks the menu, it just stops
 * helping. The selectors are the documented sticky-heading contract that
 * `observeStickyMenuGroups` itself relies on, so they are as stable as that.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-picker',
  factory() {
    /** Attributes owned by this plugin; all scoped under the model menu. */
    const MARK = 'data-dsh-model-picker';
    const COLLAPSED = 'data-dmp-collapsed';

    /** Providers the user folded away, by provider id (page-lifetime memory). */
    const folded = new Set();

    /** Stylesheet: heading affordance + the folded state. Scoped to the model menu. */
    const CSS = `
/* A provider heading becomes a disclosure control. The shipped heading is a
   plain <div> inside the group section; padding keeps the hit area generous
   without moving the rows. */
[${MARK}] [data-menu-group-heading] {
  position: relative;
  cursor: pointer;
  user-select: none;
  padding-right: 20px;
  outline: none;
}
[${MARK}] [data-menu-group-heading]:hover {
  color: var(--dsw-alias-label-primary);
}
[${MARK}] [data-menu-group-heading]:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary);
  border-radius: var(--dsw-radius-sm, 6px);
}
/* The chevron: drawn with borders so it needs no extra DOM node. */
[${MARK}] [data-menu-group-heading]::after {
  content: '';
  position: absolute;
  right: 6px;
  top: 50%;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid var(--dsw-alias-label-caption);
  border-bottom: 1.5px solid var(--dsw-alias-label-caption);
  transform: translateY(-70%) rotate(45deg);
  transition: transform 120ms ease;
}
[${MARK}] [${COLLAPSED}] [data-menu-group-heading]::after {
  transform: translateY(-30%) rotate(-135deg);
}
/* Folded rows are hidden without removing them, so React keeps its own DOM. */
[${MARK}] [${COLLAPSED}] > *:not([data-menu-group-heading]):not([data-menu-group-start]) {
  display: none !important;
}
/* A folded group is dimmed slightly so the open one reads as the active one. */
[${MARK}] [${COLLAPSED}] > [data-menu-group-heading] {
  color: var(--dsw-alias-label-tertiary);
}
`;

    /** Attach: the grouping container inside the built-in model menu. */
    const MENU_GROUP_SELECTOR = '[data-menu-group]';
    const HEADING_SELECTOR = ':scope > [data-menu-group-heading]';

    /** The scroll container the shipped menu marks with these groups. */
    function groupContainerOf(heading) {
      const section = heading === null ? null : heading.closest(MENU_GROUP_SELECTOR);
      return section === null ? null : section.parentElement;
    }

    /** Read the stable key a section folds under (its position in the container). */
    function providerKeyOf(container, section) {
      const sections = [...container.querySelectorAll(MENU_GROUP_SELECTOR)];
      return 'group-' + sections.indexOf(section);
    }

    /**
     * Re-apply the folded state to every group in the container.
     *
     * Called after any DOM mutation, because React re-creates rows when the
     * catalog refreshes and a freshly created section carries no attribute.
     *
     * @param container - the model menu's group container.
     * @param searching - whether a search query is active; search wins over folds.
     */
    function sync(container, searching) {
      const sections = container.querySelectorAll(MENU_GROUP_SELECTOR);
      sections.forEach((section) => {
        const heading = section.querySelector(HEADING_SELECTOR);
        if (heading === null) return;
        const key = providerKeyOf(container, section);
        const isFolded = !searching && folded.has(key);
        if (isFolded) section.setAttribute(COLLAPSED, '');
        else {
          // Start collapsed only when the plugin actually wants it folded;
          // otherwise a stale attribute must go (e.g. the query was cleared).
          if (section.hasAttribute(COLLAPSED)) section.removeAttribute(COLLAPSED);
        }
        // Expose the disclosure semantics the shipped markup does not carry.
        heading.setAttribute('role', 'button');
        heading.setAttribute('tabindex', '0');
        heading.setAttribute('aria-expanded', isFolded ? 'false' : 'true');
      });
    }

    /** Whether the menu currently shows a search query (the shipped menu does). */
    function isSearching(container) {
      const root = container.closest('[data-menu-group]') === null
        ? container.parentElement
        : container.parentElement;
      const input = root === null ? null : root.querySelector('input[role="searchbox"]');
      if (input === null) return false;
      const value = input.value;
      return typeof value === 'string' && value.trim() !== '';
    }

    /**
     * Install the enhancement.
     * @param {object} ctx - client root context.
     */
    function apply(ctx) {
      const style = document.createElement('style');
      style.setAttribute(MARK, '');
      style.textContent = CSS;
      document.head.appendChild(style);
      ctx.effect(() => () => { style.remove() }, 'model-picker: stylesheet');

      /** Containers already wired, so one mutation observer serves each menu. */
      const observed = new WeakSet();
      let observer;

      /** Wire one group container: click + keyboard toggling, and the observer. */
      const wire = (container) => {
        if (container === null || observed.has(container)) return;
        observed.add(container);
        container.setAttribute(MARK, '');

        const toggle = (section) => {
          const heading = section.querySelector(HEADING_SELECTOR);
          if (heading === null) return;
          const key = providerKeyOf(container, section);
          if (folded.has(key)) folded.delete(key);
          else folded.add(key);
          sync(container, isSearching(container));
        };

        container.addEventListener('click', (event) => {
          const heading = event.target instanceof Element ? event.target.closest('[data-menu-group-heading]') : null;
          if (heading === null || !container.contains(heading)) return;
          const section = heading.closest(MENU_GROUP_SELECTOR);
          if (section === null) return;
          // The heading is not a control in the shipped markup; make the whole
          // heading a target but never swallow clicks that land on a row.
          event.preventDefault();
          toggle(section);
        }, true);

        container.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          const heading = event.target instanceof Element ? event.target.closest('[data-menu-group-heading]') : null;
          if (heading === null) return;
          const section = heading.closest(MENU_GROUP_SELECTOR);
          if (section === null) return;
          event.preventDefault();
          toggle(section);
        });

        observer = new MutationObserver(() => {
          // Re-assert after React writes; cheap because the menu is small.
          sync(container, isSearching(container));
        });
        observer.observe(container, { childList: true, subtree: true, characterData: true });
        sync(container, isSearching(container));
      };

      /**
       * The menu mounts and unmounts as the composer opens it, so wait for a
       * group container to appear rather than assuming it exists at apply time.
       */
      const scan = () => {
        const headings = document.querySelectorAll('[data-menu-group-heading]');
        for (const heading of headings) {
          const container = groupContainerOf(heading);
          // Only the model menu: its groups are radio rows (menuitemradio).
          if (container === null) continue;
          if (container.querySelector('[role="menuitemradio"]') === null) continue;
          wire(container);
        }
      };

      scan();
      const watcher = new MutationObserver(scan);
      watcher.observe(document.body, { childList: true, subtree: true });
      ctx.effect(() => () => {
        watcher.disconnect();
        if (observer !== undefined) observer.disconnect();
      }, 'model-picker: watch for the model menu');
    }

    return { apply };
  },
});
