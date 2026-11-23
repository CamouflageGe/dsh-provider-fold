/** Add disclosure controls to the stock composer model pane, without replacing it. */
window.__ModuleLoader__.load({
  id: 'dsh-provider-fold',
  factory() {
    const PANE = '[role="group"][id$="-menu"] > [role="menu"][id$="-models"]';
    const GROUP = '[data-menu-group]';
    const HEADING = '[data-menu-group-heading]';
    const ROW = 'button[role="menuitemradio"]';
    const MARK = 'data-dsh-provider-fold';
    const DISCLOSURE = 'data-dmp-heading';
    const COLLAPSED = 'data-dmp-collapsed';

    const CSS = `
      [${MARK}] > ${GROUP} > [${DISCLOSURE}] {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
      }
      [${MARK}] > ${GROUP} > [${DISCLOSURE}]:hover {
        color: var(--dsw-alias-label-primary);
      }
      [${MARK}] > ${GROUP} > [${DISCLOSURE}]:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: -2px;
      }
      [${MARK}] > ${GROUP} > [${DISCLOSURE}]::after {
        content: '';
        flex: none;
        margin-inline-start: auto;
        margin-inline-end: 4px;
        width: 6px;
        height: 6px;
        border-right: 1.5px solid currentColor;
        border-bottom: 1.5px solid currentColor;
        transform: translateY(-2px) rotate(45deg);
      }
      [${MARK}] > [${COLLAPSED}] > [${DISCLOSURE}]::after {
        transform: rotate(-45deg);
      }
      [${MARK}] > [${COLLAPSED}] > ${ROW} {
        display: none !important;
      }
    `;

    function expanded(searching, current, provider, override) {
      return searching || (override ?? (current === null || current === provider));
    }

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute(MARK, '');
        style.textContent = CSS;
        document.head.appendChild(style);

        const panes = new Map();
        let scanFrame = null;

        function wire(container) {
          const surface = container.parentElement;
          const paneId = container.id.slice(0, -'-models'.length);
          if (surface.id !== `${paneId}-menu`) return;

          // Manual choices are for this opening only. On reopen, start from
          // the checked provider again, not another session's old choices.
          const overrides = new Map();
          const touchedHeadings = new Map();
          const touchedSections = new Set();
          let knownCurrent = null;
          let frame = null;
          const isLive = () => container.isConnected && container.parentElement === surface && container.matches(PANE);

          function searchbox() {
            const input = surface.querySelector('input[role="searchbox"]');
            return input?.getAttribute('aria-controls') === container.id ? input : null;
          }

          function groups() {
            const items = [];
            for (const section of container.children) {
              if (!section.matches(GROUP)) return [];
              const children = Array.from(section.children);
              const heading = children.find(child => child.matches(HEADING));
              const rows = children.filter(child => child.matches(ROW));
              const provider = rows[0]?.querySelector('[data-provider-id]')?.getAttribute('data-provider-id');
              // If the structure changes, do not hide rows or take over keys.
              if (!heading || !provider || !rows[0].id.startsWith(`${paneId}-model-`)) return [];
              items.push({ section, heading, rows, provider });
            }
            return items;
          }

          function restoreHeading(heading) {
            const previous = touchedHeadings.get(heading);
            if (!previous) return;
            heading.removeAttribute(DISCLOSURE);
            for (const [name, value] of previous) {
              if (value === null) heading.removeAttribute(name);
              else heading.setAttribute(name, value);
            }
            touchedHeadings.delete(heading);
          }

          function sync() {
            const items = groups();
            const searching = Boolean(searchbox()?.value.trim());
            const checked = items.find(item => item.rows.some(row => row.getAttribute('aria-checked') === 'true'));
            if (!searching && checked && checked.provider !== knownCurrent) {
              if (knownCurrent !== null) overrides.clear();
              knownCurrent = checked.provider;
            }
            const headings = new Set(items.map(item => item.heading));
            const sections = new Set(items.map(item => item.section));
            for (const heading of touchedHeadings.keys()) {
              if (searching || !headings.has(heading)) restoreHeading(heading);
            }
            for (const section of touchedSections) {
              if (sections.has(section)) continue;
              section.removeAttribute(COLLAPSED);
              touchedSections.delete(section);
            }
            container.toggleAttribute(MARK, items.length !== 0);
            for (const { section, heading, provider, rows } of items) {
              const open = expanded(searching, checked?.provider ?? null, provider, overrides.get(provider));
              if (!searching) {
                if (!touchedHeadings.has(heading)) {
                  touchedHeadings.set(heading, ['role', 'tabindex', 'aria-expanded'].map(name => [name, heading.getAttribute(name)]));
                }
                heading.setAttribute(DISCLOSURE, '');
                heading.setAttribute('role', 'button');
                heading.setAttribute('tabindex', '0');
                heading.setAttribute('aria-expanded', String(open));
                // Do not hide the currently focused row under an async update.
                if (!open && rows.includes(document.activeElement)) heading.focus();
              }
              section.toggleAttribute(COLLAPSED, !open);
              touchedSections.add(section);
            }
            return { items, searching };
          }

          function toggle(item) {
            overrides.set(item.provider, item.section.hasAttribute(COLLAPSED));
            sync();
          }

          function onClick(event) {
            if (!(event.target instanceof Element)) return;
            const heading = event.target.closest(`[${DISCLOSURE}]`);
            if (!heading) return;
            const { items, searching } = sync();
            const item = items.find(group => group.heading === heading);
            if (item && !searching) toggle(item);
          }

          function onKeyDown(event) {
            if (!isLive() || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
                event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const key = event.key;
            if (!['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Tab'].includes(key)) return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            const input = searchbox();
            const trigger = target.matches('button[aria-haspopup="menu"]') && target.getAttribute('aria-controls') === surface.id;
            if (!trigger && !surface.contains(target)) return;
            const { items, searching } = sync();
            if (searching || items.length === 0) return;
            const heading = items.find(item => item.heading === target);
            const row = target.closest(ROW);
            const belongsToRows = row !== null && items.some(item => item.rows.includes(row));
            const activeId = input?.getAttribute('aria-activedescendant');
            const active = activeId ? document.getElementById(activeId) : null;
            const visible = element => element.getClientRects().length > 0;
            let destination = null;

            if (heading && (key === 'Enter' || key === ' ')) {
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat) toggle(heading);
              return;
            }
            const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
            if (step !== 0 && (heading || belongsToRows || target === input || trigger)) {
              // The native walker includes hidden radios; its search walker can
              // also highlight a hidden row. Walk only usable rows, plus every
              // disclosure and the search box, while the query is empty.
              const stops = [input, ...items.flatMap(item => [
                item.heading,
                ...item.rows.filter(button => !button.disabled && !item.section.hasAttribute(COLLAPSED)),
              ])].filter(element => element && visible(element));
              const offset = key === 'ArrowDown' ? 1 : -1;
              if (target === input) {
                // Entering the list lands on a model, like the shipped walker;
                // headings are reached by stepping past a group's last row.
                const rows = items.flatMap(item => item.rows.filter(button =>
                  !button.disabled && !item.section.hasAttribute(COLLAPSED)));
                destination = offset > 0 ? rows[0] : rows[rows.length - 1];
                if (!destination) {
                  const headings = items.map(item => item.heading);
                  destination = offset > 0 ? headings[0] : headings[headings.length - 1];
                }
              } else {
                const start = stops.indexOf(row ?? target);
                destination = start < 0
                  ? stops[offset > 0 ? 0 : stops.length - 1]
                  : stops[(start + offset + stops.length) % stops.length];
              }
            } else if (target === input && (key === 'Enter' || key === 'Tab')) {
              // Clearing a search can leave the built-in highlight on a folded
              // result. Do not let Enter/Tab silently choose that hidden model.
              destination = items.find(item => item.rows.includes(active) && item.section.hasAttribute(COLLAPSED))?.heading;
            } else if (trigger && key === 'Tab' && !input) {
              const rows = items.flatMap(item => item.rows).filter(button => !button.disabled);
              const nativeTarget = rows.find(button => button.getAttribute('aria-checked') === 'true') ?? rows[0];
              if (nativeTarget && !visible(nativeTarget)) {
                destination = items.find(item => item.rows.includes(nativeTarget))?.heading;
              }
            }
            if (!destination) return;
            event.preventDefault();
            event.stopPropagation();
            destination.focus();
          }

          function scheduleSync() {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => {
              frame = null;
              if (isLive()) sync();
            });
          }
          function onInput(event) {
            if (event.target === searchbox()) scheduleSync();
          }

          // Clear-button commits update the controlled input without firing an
          // input event. Observe its value and the checked row as well as rows.
          const observer = new MutationObserver(scheduleSync);
          observer.observe(surface, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'value'] });
          container.addEventListener('click', onClick);
          surface.addEventListener('input', onInput);
          // Capture also sees keys from the trigger, outside the body portal.
          document.addEventListener('keydown', onKeyDown, true);
          panes.set(container, () => {
            observer.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
            document.removeEventListener('keydown', onKeyDown, true);
            surface.removeEventListener('input', onInput);
            container.removeEventListener('click', onClick);
            for (const heading of touchedHeadings.keys()) restoreHeading(heading);
            for (const section of touchedSections) section.removeAttribute(COLLAPSED);
            container.removeAttribute(MARK);
          });
          sync();
        }

        function scan() {
          for (const [container, dispose] of panes) {
            if (container.isConnected && container.matches(PANE)) continue;
            dispose();
            panes.delete(container);
          }
          for (const container of document.querySelectorAll(PANE)) {
            if (!panes.has(container)) wire(container);
          }
        }

        const finder = new MutationObserver(() => {
          if (scanFrame !== null) return;
          scanFrame = requestAnimationFrame(() => {
            scanFrame = null;
            scan();
          });
        });
        finder.observe(document.body, { childList: true, subtree: true });
        scan();
        return () => {
          finder.disconnect();
          if (scanFrame !== null) cancelAnimationFrame(scanFrame);
          for (const dispose of panes.values()) dispose();
          panes.clear();
          style.remove();
        };
      }, 'dsh-provider-fold: enhance the stock model pane');
    }

    return { apply };
  },
});
