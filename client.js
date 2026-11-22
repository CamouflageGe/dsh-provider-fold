/**
 * Provider fold — collapsible provider groups for the BUILT-IN model menu.
 *
 * WHAT THIS IS
 * ------------
 * The shipped model menu already groups models by provider and already has a
 * search field. It lacks one thing: a provider heading cannot be clicked to fold
 * its rows, so a profile with a dozen providers shows a hundred rows at once.
 *
 * This plugin adds exactly that, in place. It builds no second picker and
 * registers no slot, so every other plugin's contribution keeps working.
 *
 * DEFAULT: only the provider holding the session's current model is open.
 *
 * FAIL-SAFE RULES (learned the hard way)
 * --------------------------------------
 *   - Folded rows are hidden with `display: none`, never removed: the shipped
 *     menu queries rows with querySelectorAll and focuses them, so the rows must
 *     stay in the DOM exactly as React owns them.
 *   - The plugin ALWAYS leaves at least one group open.
 *   - A click is never swallowed: no preventDefault on rows or headings, and
 *     the handler only acts when the target really is a provider heading.
 *   - When the current model cannot be located, NOTHING is folded: a menu of
 *     bare headings with no open group would be unusable.
 *   - Search always wins: while a query is present every group is open, so a
 *     match can never hide inside a folded provider.
 *
 * WHY IT LOOKED BROKEN: THE KEYBOARD DEADLOCK
 * -------------------------------------------
 * The shipped ArrowUp/ArrowDown handler calls `moveFocus`, which queries every
 * row button and calls `.focus()` on the next one. It never checks visibility.
 * Once groups are folded that walk keeps landing on rows whose ancestors are
 * `display: none`; `focus()` there is a silent no-op, so the arrows appear
 * frozen inside the one open provider and the others cannot be reached at all.
 * The plugin therefore takes over exactly those two keys and steps through
 * VISIBLE rows, opening the provider owning the target row as it goes. Every
 * other key stays with the shipped menu.
 *
 * WHY DOM-LEVEL
 * -------------
 * The menu lives prebuilt in app.asar; its MenuGroup is an ordinary component,
 * not a slot, so there is no registration point for a disclosure control. The
 * selectors used here ([data-menu-group], [data-menu-group-heading]) are the
 * sticky-heading contract DSH's own observeStickyMenuGroups relies on.
 */
window.__ModuleLoader__.load({
  id: 'dsh-provider-fold',
  factory() {
    const MARK = 'data-dsh-provider-fold';
    const COLLAPSED = 'data-dmp-collapsed';
    const CURRENT = 'data-dmp-current';

    const GROUP = '[data-menu-group]';
    const HEADING = ':scope > [data-menu-group-heading]';
    const ROW = 'button[role="menuitemradio"]:not([disabled])';

    /** Providers the user opened by hand, keyed by provider heading text. */
    const opened = new Set();
    /** Providers the user closed by hand, keyed by provider heading text. */
    const closed = new Set();

    const CSS = [
      '[' + MARK + '] [data-menu-group-heading] {',
      '  position: relative;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  padding-right: 20px;',
      '  outline: none;',
      '}',
      '[' + MARK + '] [data-menu-group-heading]:hover {',
      '  color: var(--dsw-alias-label-primary);',
      '}',
      '[' + MARK + '] [data-menu-group-heading]:focus-visible {',
      '  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary);',
      '  border-radius: var(--dsw-radius-sm, 6px);',
      '}',
      '[' + MARK + '] [data-menu-group-heading]::after {',
      "  content: '';",
      '  position: absolute;',
      '  right: 6px;',
      '  top: 50%;',
      '  width: 6px;',
      '  height: 6px;',
      '  border-right: 1.5px solid var(--dsw-alias-label-caption);',
      '  border-bottom: 1.5px solid var(--dsw-alias-label-caption);',
      '  transform: translateY(-70%) rotate(45deg);',
      '  transition: transform 120ms ease;',
      '}',
      '[' + MARK + '] [' + COLLAPSED + '] [data-menu-group-heading]::after {',
      '  transform: translateY(-30%) rotate(-135deg);',
      '}',
      '[' + MARK + '] [' + COLLAPSED + '] > *:not([data-menu-group-heading]):not([data-menu-group-start]) {',
      '  display: none !important;',
      '}',
      '[' + MARK + '] [' + COLLAPSED + '] > [data-menu-group-heading] {',
      '  color: var(--dsw-alias-label-tertiary);',
      '}',
      '[' + MARK + '] [' + CURRENT + '] > [data-menu-group-heading] {',
      '  color: var(--dsw-alias-label-primary);',
      '  font-weight: 500;',
      '}',
    ].join('\n');

    /** Stable identity of a provider group: its heading text. */
    function keyOf(section) {
      const heading = section.querySelector(HEADING);
      return heading === null ? '' : (heading.textContent || '').trim();
    }

    /**
     * Whether a search query is active. The search box is a sibling of the
     * groups container inside the menu surface.
     * @param {HTMLElement} container - group container.
     */
    function isSearching(container) {
      const surface = container.parentElement;
      if (surface === null) return false;
      const input = surface.querySelector('input[role="searchbox"]');
      return input !== null && typeof input.value === 'string' && input.value.trim() !== '';
    }

    /** Whether a row can actually take focus: no folded ancestor. */
    function visible(row) {
      return row.getClientRects().length > 0;
    }

    /** The section holding the currently selected model, or null. */
    function currentSectionOf(container) {
      const checked = container.querySelector('[role="menuitemradio"][aria-checked="true"]');
      return checked === null ? null : checked.closest(GROUP);
    }

    /** Remove every fold marker: the always-usable fallback state. */
    function unfoldAll(container) {
      for (const section of container.querySelectorAll(GROUP)) {
        section.removeAttribute(COLLAPSED);
        section.removeAttribute(CURRENT);
      }
    }

    /**
     * Apply the fold state. Never throws: on any problem the menu is left fully
     * unfolded, which is always usable.
     *
     * The "keep one provider open" safety net only applies while the state is
     * still purely automatic. Once the user has folded or unfolded anything by
     * hand, their choices win outright — otherwise closing the current provider
     * would silently re-open it and the heading would look dead.
     *
     * @param {HTMLElement} container - the menu's group container.
     */
    function sync(container) {
      try {
        const sections = Array.from(container.querySelectorAll(GROUP));
        if (sections.length === 0) return;
        const current = currentSectionOf(container);
        const searching = isSearching(container);

        // Folding is anchored on the current model. Without one, everything
        // stays open unless the user closed a provider by hand.
        const anchored = current !== null;

        const plans = sections.map(function (section) {
          const key = keyOf(section);
          const isCurrent = section === current;
          let open;
          if (searching) open = true;
          else if (isCurrent) open = !closed.has(key);
          else if (opened.has(key)) open = true;
          else if (closed.has(key)) open = false;
          else open = !anchored;
          return { section: section, key: key, isCurrent: isCurrent, open: open };
        });

        // Keep at least one group open so the menu always offers rows, because
        // the shipped ArrowDown traversal only walks rows and cannot recover
        // from a menu with nothing visible.
        //
        // A provider the user closed by hand is the last resort, never the
        // first choice: re-opening the very heading that was just clicked makes
        // it look dead. Opening a neighbour is a visible answer to the click.
        //
        // The fallback also corrects the remembered state, otherwise the next
        // pass would fold it again and the menu would flicker.
        let anyOpen = false;
        for (const plan of plans) if (plan.open) { anyOpen = true; break; }
        if (!anyOpen) {
          let fallback = null;
          for (const plan of plans) if (!closed.has(plan.key)) { fallback = plan; break; }
          if (fallback === null) {
            for (const plan of plans) if (plan.isCurrent) { fallback = plan; break; }
          }
          if (fallback === null) fallback = plans[0];
          fallback.open = true;
          closed.delete(fallback.key);
          opened.add(fallback.key);
        }

        for (const plan of plans) {
          const heading = plan.section.querySelector(HEADING);
          if (heading === null) continue;
          plan.section.toggleAttribute(CURRENT, plan.isCurrent);
          plan.section.toggleAttribute(COLLAPSED, !plan.open);
          heading.setAttribute('role', 'button');
          heading.setAttribute('tabindex', '0');
          heading.setAttribute('aria-expanded', plan.open ? 'true' : 'false');
        }
      } catch (error) {
        unfoldAll(container);
      }
    }

    /** Open or close one group in the DOM without recording a preference. */
    function setOpen(section, open) {
      if (open) section.removeAttribute(COLLAPSED);
      else section.setAttribute(COLLAPSED, '');
    }

    /**
     * Fold or unfold one group and remember it as a deliberate choice.
     *
     * When this closes the last open provider, `sync` opens a neighbour so the
     * menu still offers rows — but never the heading that was just clicked,
     * which would look like a dead control.
     *
     * @param {HTMLElement} container - group container.
     * @param {HTMLElement} section - the provider group.
     */
    function toggle(container, section) {
      const open = section.hasAttribute(COLLAPSED);
      const key = keyOf(section);
      if (open) {
        opened.add(key);
        closed.delete(key);
      } else {
        closed.add(key);
        opened.delete(key);
      }
      setOpen(section, open);
      sync(container);
    }

    /** True when the event target is one of this menu's provider headings. */
    function headingOf(container, target) {
      if (!(target instanceof Element)) return null;
      const heading = target.closest('[data-menu-group-heading]');
      if (heading === null) return null;
      const section = heading.closest(GROUP);
      if (section === null || section.parentElement !== container) return null;
      return heading;
    }

    /**
     * Move focus across VISIBLE rows only, opening the provider that owns the
     * target row so a folded group can still be entered.
     *
     * Entering a folded provider records it as opened: a later `sync` must not
     * fold it back under the focused row, which would drop focus to <body> and
     * leave the menu looking frozen.
     *
     * @param {HTMLElement} container - group container.
     * @param {number} offset - +1 or -1.
     * @returns {boolean} whether focus moved.
     */
    function step(container, offset) {
      const rows = Array.from(container.querySelectorAll(ROW));
      if (rows.length === 0) return false;

      const from = rows.indexOf(document.activeElement);
      // Start just outside the list so the first iteration lands on the entry
      // row: the last one when stepping backwards, the first one forwards.
      let index = from === -1 ? (offset > 0 ? -1 : 0) : from;

      for (let guard = 0; guard < rows.length; guard += 1) {
        index = (index + offset + rows.length) % rows.length;
        const row = rows[index];
        const section = row.closest(GROUP);
        if (section !== null && section.hasAttribute(COLLAPSED)) {
          const key = keyOf(section);
          opened.add(key);
          closed.delete(key);
          setOpen(section, true);
        }
        if (!visible(row)) continue;
        row.focus();
        sync(container);
        return true;
      }
      return false;
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
      ctx.effect(function () { return function () { style.remove(); }; }, 'dsh-provider-fold: stylesheet');

      const wired = new Set();
      const observers = new Map();
      let scanTimer;

      /** Wire one menu. Idempotent. */
      function wire(container) {
        if (wired.has(container)) {
          sync(container);
          return;
        }
        wired.add(container);
        container.setAttribute(MARK, '');

        // Bubble phase and no preventDefault: the shipped menu still owns every
        // row click. Only a provider heading is ours.
        container.addEventListener('click', function (event) {
          const heading = headingOf(container, event.target);
          if (heading === null) return;
          toggle(container, heading.closest(GROUP));
        });

        // Capture phase so the deadlocked traversal below never sees these keys.
        container.addEventListener('keydown', function (event) {
          if (event.isComposing || event.keyCode === 229) return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

          const heading = headingOf(container, event.target);

          if (heading !== null) {
            const section = heading.closest(GROUP);
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              toggle(container, section);
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              // Open provider: hand the keyboard to its first/last row.
              if (!section.hasAttribute(COLLAPSED)) {
                const rows = Array.from(section.querySelectorAll(ROW));
                const target = event.key === 'ArrowDown' ? rows[0] : rows[rows.length - 1];
                if (target !== undefined && visible(target)) { target.focus(); return; }
              }
              // Folded or empty provider: jump to the neighbouring heading.
              const headings = Array.from(container.querySelectorAll(HEADING));
              const at = headings.indexOf(heading);
              if (at === -1) return;
              const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + headings.length) % headings.length;
              headings[next].focus();
            }
            return;
          }

          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          if (!(event.target instanceof Element)) return;
          if (event.target.closest(GROUP) === null) return;
          event.preventDefault();
          event.stopPropagation();
          step(container, event.key === 'ArrowDown' ? 1 : -1);
        }, true);

        // Scoped to this menu, coalesced to one frame, and self-releasing.
        // Only childList is observed, so the attributes this plugin writes can
        // never retrigger the observer.
        let queued = false;
        const observer = new MutationObserver(function () {
          if (queued) return;
          queued = true;
          requestAnimationFrame(function () {
            queued = false;
            if (!container.isConnected) {
              observer.disconnect();
              observers.delete(container);
              wired.delete(container);
              return;
            }
            sync(container);
          });
        });
        observer.observe(container, { childList: true, subtree: true });
        observers.set(container, observer);
        sync(container);
      }

      /** Find model menus in the document and wire them. */
      function scan() {
        const headings = document.querySelectorAll('[data-menu-group-heading]');
        for (const heading of headings) {
          const section = heading.closest(GROUP);
          const container = section === null ? null : section.parentElement;
          // Only the model menu: its provider groups hold radio rows. Command
          // and popup menus share the MenuGroup markup and must be left alone.
          if (container === null) continue;
          if (container.querySelector('[role="menuitemradio"]') === null) continue;
          wire(container);
        }
      }

      function scheduleScan() {
        if (scanTimer !== undefined) return;
        scanTimer = requestAnimationFrame(function () {
          scanTimer = undefined;
          scan();
        });
      }

      // The search field is a SIBLING of the groups container, so the container
      // observer cannot see the query change. Without this listener, clearing a
      // search would leave every provider open until React happened to re-render.
      function onQueryChange(event) {
        if (!(event.target instanceof Element)) return;
        if (event.target.getAttribute('role') !== 'searchbox') return;
        wired.forEach(function (container) { sync(container); });
      }
      document.addEventListener('input', onQueryChange);

      // One throttled document observer only FINDS the menu; each menu then has
      // its own container observer. Watching every mutation of the whole app was
      // what made the menu feel dead.
      const finder = new MutationObserver(scheduleScan);
      finder.observe(document.body, { childList: true, subtree: true });
      scheduleScan();

      ctx.effect(function () {
        return function () {
          finder.disconnect();
          document.removeEventListener('input', onQueryChange);
          if (scanTimer !== undefined) cancelAnimationFrame(scanTimer);
          observers.forEach(function (observer) { observer.disconnect(); });
          observers.clear();
          wired.clear();
        };
      }, 'dsh-provider-fold: watch for the model menu');
    }

    return { apply: apply };
  },
});
