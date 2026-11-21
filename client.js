/**
 * Model picker — a collapsible, searchable model chooser for the composer.
 *
 * WHY THIS EXTENDS THE SHIPPED MENU INSTEAD OF REPLACING IT
 * -------------------------------------------------------
 * Replacing the shipped `conversation.input.model` seat is the obvious move,
 * but that seat DECLARES two child slots (`conversation.input.model.label` and
 * `conversation.input.model.options`) and the Slot Registry allows exactly one
 * declarer per key: a second registration declaring them throws "already
 * declared", and one declaring nothing gets no `renderSlot` face. Shadowing
 * therefore cannot re-host other plugins' contributions — the Agent Teams
 * switch, provider badges and price tooltips would all disappear.
 *
 * So this plugin extends instead of replacing:
 *   1. a row inside the shipped model menu    (`conversation.input.model.options`)
 *   2. the picker overlay on the float layer  (`conversation.input.overlay`)
 * Every read and every write goes through the SHIPPED `modelDirectories`
 * service, so this panel, the `/model` popup and the composer chip are one
 * piece of state: pick here and the shipped UI updates, and vice versa.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-picker',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'model-picker';

    const zh = {
      'row.label': '全部模型（按提供商折叠）',
      'row.hint': '可搜索',
      'row.title': '打开可搜索、可按提供商折叠的模型选择器',
      'panel.title': '选择模型',
      'panel.search': '搜索模型或提供商…',
      'panel.close': '关闭',
      'panel.empty': '没有匹配的模型',
      'panel.noModels': '暂无可用模型',
      'panel.loading': '正在加载模型…',
      'panel.retry': '重试',
      'panel.count': '{count} 个',
      'panel.current': '当前模型',
      'panel.effort': '推理强度',
      'panel.failed': '切换失败：{message}',
      'panel.groupFailed': '{name} 加载失败：{message}',
      'panel.expandAll': '全部展开',
      'panel.collapseAll': '全部折叠',
      'panel.unavailable': '此会话无法切换模型',
      'panel.switching': '切换中…',
      'panel.busy': '切换中：{name}',
      'panel.hint': '用 ↑↓ 选择，Enter 确认，Esc 关闭',
      'panel.openOne': '先展开一个提供商，才能用 ↑↓ 选择',
      'panel.sessionInUse': '当前会话被其他实例占用，请退出其他正在运行的 DSH 后重试',
      'panel.found': '找到 {count} 个模型',
      'provider.account': 'DeepSeek 账号',
    };
    const en = {
      'row.label': 'All models (grouped by provider)',
      'row.hint': 'Searchable',
      'row.title': 'Open a searchable model picker grouped by provider',
      'panel.title': 'Select model',
      'panel.search': 'Search models or providers…',
      'panel.close': 'Close',
      'panel.empty': 'No matching model',
      'panel.noModels': 'No model available',
      'panel.loading': 'Loading models…',
      'panel.retry': 'Retry',
      'panel.count': '{count}',
      'panel.current': 'Current model',
      'panel.effort': 'Reasoning effort',
      'panel.failed': 'Could not switch: {message}',
      'panel.groupFailed': '{name} failed to load: {message}',
      'panel.expandAll': 'Expand all',
      'panel.collapseAll': 'Collapse all',
      'panel.unavailable': 'This session cannot switch models',
      'panel.switching': 'Switching…',
      'panel.busy': 'Switching to {name}',
      'panel.hint': 'Use ↑↓ to choose, Enter to confirm, Esc to close',
      'panel.openOne': 'Expand a provider first to choose with ↑↓',
      'panel.sessionInUse': 'Another DSH instance owns this session — quit it and retry',
      'panel.found': '{count} models found',
      'provider.account': 'DeepSeek Account',
    };

    /** Tiny observable store: the menu row pokes it, the overlay renders it. */
    function createStore(initial) {
      let state = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener) };
        },
        set(patch) {
          state = { ...state, ...patch };
          for (const listener of [...listeners]) listener();
        },
      };
    }

    /** Whether the picker overlay is open. */
    const ui = createStore({ open: false });

    /** Stable close handle: the same identity for every render, so effects do not rebind. */
    const closePicker = () => { ui.set({ open: false }) };

    /** Plugin root context, captured by apply for the lazy service lookup. */
    let rootCtx;

    /**
     * Bumped whenever `conversation.input.model.label` registrations change, so
     * the panel re-reads provider badges even if a provider plugin loads (or
     * unloads) while the panel is already open.
     */
    const labelUi = createStore({ version: 0 });

    /**
     * The live winner of the `conversation.input.model.label` seat.
     *
     * That slot is a CHILD of the built-in model seat, so only the seat's own
     * declarer may `renderSlot` it — which is why a replacement picker shows no
     * badges. The registrations themselves are public registry data, though:
     * this reads the winning entry and renders its component with the exact
     * props the built-in seat passes, so provider plugins (WorkBuddy's load and
     * promotion chips, DeepSeek account styling, …) keep working here too.
     * @param providerId - the provider whose label seat is being drawn.
     * @returns the winning entry, or undefined when no plugin claims it.
     */
    function labelEntryFor(providerId) {
      const slots = rootCtx === undefined ? undefined : rootCtx.get('slots');
      if (slots === undefined || slots === null) return undefined;
      let entries;
      try { entries = slots.entriesOfSlot('conversation.input.model.label') } catch { return undefined }
      if (!Array.isArray(entries)) return undefined;
      // The host declares this slot `single`, so a keyed lookup only matters if
      // a future host switches it to `keyed`; both shapes are honored.
      const keyed = entries.find((entry) => entry.options !== undefined && entry.options.key === providerId);
      if (keyed !== undefined) return keyed;
      return entries.find((entry) => entry.options === undefined || entry.options.key === undefined);
    }

    /** Resolve a catalog badge's provider-authored text for the active locale. */
    function resolveBadgeText(text) {
      const locale = rootCtx === undefined ? undefined : rootCtx.get('locale');
      if (locale === undefined || locale === null || typeof locale.resolveText !== 'function') {
        return typeof text === 'string' ? text : '';
      }
      try { return locale.resolveText(text) ?? '' } catch { return '' }
    }

    /** The host's own fallback: the catalog name, followed by its catalog badge. */
    function plainModelLabel(model) {
      const name = h('span', { className: 'dmp-modelName' }, model.name);
      if (model.badge === undefined || model.badge === null) return name;
      const text = resolveBadgeText(model.badge.text);
      if (text === '') return name;
      return h('span', { className: 'dmp-badged' },
        name,
        h('span', { className: 'dmp-badgeChip' }, text));
    }

    /**
     * Contain a badge component's failure: a provider plugin that throws must
     * degrade to the plain name here, never blank this panel.
     */
    class LabelBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }

      static getDerivedStateFromError() { return { failed: true } }

      componentDidCatch() { /* the panel keeps the plain label */ }

      render() { return this.state.failed ? this.props.fallback : this.props.children }
    }

    /**
     * One model row's label, honoring whichever provider plugin owns the seat.
     * @param props - provider identity, catalog model, and where it is drawn.
     */
    function ModelLabel({ provider, model, placement, selected }) {
      // Re-read when a provider plugin registers or drops its label seat.
      React.useSyncExternalStore(labelUi.subscribe, labelUi.getSnapshot);
      const fallback = plainModelLabel(model);
      const entry = labelEntryFor(provider.id);
      if (entry === undefined) return fallback;

      const extra = entry.locale === undefined || rootCtx === undefined
        ? {}
        : { t: rootCtx.get('locale').bind(entry.locale) };
      return h(LabelBoundary, { fallback },
        h(entry.component, { provider, model, placement, selected, ...extra }));
    }

    /** Same provider order the shipped pickers use: account, official, then the rest. */
    function orderProviders(groups) {
      const rank = (id) => (id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2);
      return groups.slice().sort((left, right) => rank(left.id) - rank(right.id));
    }

    /** Case-insensitive ordered-subsequence test — the shipped search's matching idea. */
    function subsequence(text, query) {
      if (query.length < 2) return false;
      const hay = text.toLowerCase();
      let at = 0;
      for (const character of query) {
        at = hay.indexOf(character, at);
        if (at < 0) return false;
        at += 1;
      }
      return true;
    }

    /** Rank one model against ONE lowercase term; 0 is best, -1 means no match. */
    function rankTerm(name, id, term) {
      const lowerName = name.toLowerCase();
      if (lowerName.startsWith(term)) return 0;
      if (lowerName.includes(term)) return 1;
      if (id.toLowerCase().includes(term)) return 2;
      if (subsequence(name, term) || subsequence(id, term)) return 3;
      return -1;
    }

    /**
     * Rank one model against every whitespace-separated term (AND semantics).
     * A whole-phrase hit still wins over per-term hits, so "gpt 4.1 mini"
     * finds the exact name before falling back to independent terms.
     */
    function rankModel(name, id, needle, terms) {
      if (needle === '') return 0;
      const phrase = rankTerm(name, id, needle);
      if (phrase >= 0) return phrase;
      let worst = 0;
      for (const term of terms) {
        const rank = rankTerm(name, id, term);
        if (rank < 0) return -1;
        if (rank > worst) worst = rank;
      }
      return worst + 1;
    }

    /** Localized provider label: the account route has its own name in the shipped pickers. */
    function providerLabel(group, t) {
      return group.id === 'deepseek-account' ? t('provider.account') : group.name;
    }

    /** Resolve the session's shared directory from the shipped service, or undefined. */
    function directoryOf(sessionId) {
      const models = rootCtx === undefined ? undefined : rootCtx.get('modelDirectories');
      if (models === undefined || models === null) return undefined;
      try {
        return models.directoryFor(sessionId);
      } catch {
        return undefined;
      }
    }

    function Chevron({ open }) {
      return h('svg', {
        viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true,
        className: 'dmp-chevron', style: { transform: open ? 'rotate(90deg)' : 'none' },
      }, h('path', {
        d: 'M6 3.5 10.5 8 6 12.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    function Magnifier({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
      }, h('circle', { cx: 7, cy: 7, r: 4.5 }), h('path', { d: 'M10.5 10.5 14 14' }));
    }

    /** Grouped-list glyph: this row opens a provider-grouped browser, not a plain search. */
    function GroupedList() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
      },
        h('path', { d: 'M2.5 3.5h11' }),
        h('path', { d: 'M4.5 7h9' }),
        h('path', { d: 'M4.5 10.5h9' }),
        h('path', { d: 'M2.5 14h11' }),
        h('path', { d: 'M2.5 6v9', opacity: 0.45 }));
    }

    function Check() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, h('path', { d: 'M3 8.5 6.5 12 13 4.5' }));
    }

    /**
     * A row inside the shipped model menu. `dismiss()` is the shipped seat's own
     * documented handoff (close the menu, focus the trigger) before another
     * overlay opens, so focus never fights between the two surfaces.
     */
    function PickerMenuRow(props) {
      return h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dmp-row',
        disabled: props.locked,
        title: props.t('row.title'),
        onClick: () => {
          props.dismiss();
          ui.set({ open: true });
        },
      },
        h('span', { className: 'dmp-rowIcon' }, h(GroupedList)),
        h('span', { className: 'dmp-rowLabel' }, props.t('row.label')),
        h('span', { className: 'dmp-rowHint' }, props.t('row.hint')));
    }

    /** The picker itself: one shared directory store, the same writes the chip uses. */
    function PickerPanel({ sessionId, t, close, directory }) {
      const subscribe = React.useCallback(
        (listener) => (directory === undefined ? () => {} : directory.store.subscribe(listener)),
        [directory],
      );
      const read = React.useCallback(
        () => (directory === undefined ? undefined : directory.store.getSnapshot()),
        [directory],
      );
      const state = React.useSyncExternalStore(subscribe, read);

      const [query, setQuery] = React.useState('');
      const [expanded, setExpanded] = React.useState(() => new Set());
      const [active, setActive] = React.useState(0);
      const [failure, setFailure] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const panelRef = React.useRef(null);
      const searchRef = React.useRef(null);
      const rowRefs = React.useRef({});
      const seeded = React.useRef(false);
      // Synchronous guards: setState is async, so a same-frame double Enter
      // could otherwise fire two select() calls.
      const busyRef = React.useRef(false);
      // Which action produced the store's error: only a LOAD error has a
      // working retry, a rejected SELECTION is reported in the bar instead.
      const lastAction = React.useRef('load');
      const listId = `${NS}-list`;

      // Load the shared directory once; the store carries loading and failure
      // states, so nothing local can drift from the shipped view.
      React.useEffect(() => {
        if (directory === undefined) return;
        try { directory.load().catch(() => { /* the shared store carries the failure */ }) } catch { /* same */ }
      }, [directory]);

      React.useEffect(() => {
        const timer = setTimeout(() => { searchRef.current?.focus() }, 0);
        return () => { clearTimeout(timer) };
      }, []);

      // Hand focus back where it came from on close. By now the shipped menu has
      // already dismissed and focused its trigger, so `document.activeElement`
      // is the model chip — exactly the element the user expects to keep.
      //
      // Two paths, deliberately not unified behind one delay:
      //  - same session: the trigger is still mounted, so focus it synchronously.
      //    Deferring would leave focus on <body> for a frame, and a quick second
      //    Escape or keystroke would land nowhere.
      //  - session switched: the trigger unmounted with the old composer while
      //    the new composer is not committed yet at cleanup time, so wait one
      //    frame and land in the new composer's editor instead of `<body>`.
      React.useEffect(() => {
        const previous = document.activeElement;
        return () => {
          if (previous instanceof HTMLElement && previous.isConnected) {
            previous.focus();
            return;
          }
          requestAnimationFrame(() => {
            // Never steal focus from whatever the user just clicked.
            const current = document.activeElement;
            if (current !== null && current !== document.body) return;
            const card = document.querySelector('[data-composer-card]');
            const editor = card === null ? null : card.querySelector('[contenteditable="true"]');
            (editor ?? card)?.focus?.();
          });
        };
      }, []);

      // Escape closes from anywhere inside the panel, including the footer chips.
      // `close` is a module-level stable handler, so this binds once per open.
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          close();
        };
        document.addEventListener('keydown', onKey, true);
        return () => { document.removeEventListener('keydown', onKey, true) };
      }, [close]);

      const groups = React.useMemo(() => orderProviders(state?.groups ?? []), [state?.groups]);
      const current = state?.current ?? null;
      const pending = state?.pending ?? null;

      // Open on the provider that holds the current model; without a current
      // model, open the first one so the keyboard has somewhere to go.
      React.useEffect(() => {
        if (seeded.current || groups.length === 0) return;
        seeded.current = true;
        const first = current === null ? groups[0].id : current.provider;
        setExpanded((previous) => (previous.size > 0 ? previous : new Set([first])));
      }, [current, groups]);

      const needle = query.trim().toLowerCase();
      const terms = React.useMemo(() => needle.split(/\s+/).filter(Boolean), [needle]);

      const filtered = React.useMemo(() => {
        if (needle === '') return groups.map((group) => ({ group, models: group.models }));
        return groups.map((group) => {
          const providerHit = providerLabel(group, t).toLowerCase().includes(needle)
            || group.name.toLowerCase().includes(needle)
            || group.id.toLowerCase().includes(needle);
          const scored = group.models
            .map((model) => ({ model, rank: rankModel(model.name, model.id, needle, terms) }))
            .filter((entry) => providerHit || entry.rank >= 0);
          // A provider-name hit releases the whole group, but sorted by model
          // rank so exact name matches still float to the top.
          if (providerHit) scored.sort((left, right) => left.rank - right.rank);
          return { group, models: scored.map((entry) => entry.model) };
        }).filter((entry) => entry.models.length > 0);
      }, [groups, needle, terms, t]);

      const visible = React.useMemo(() => filtered.flatMap((entry) => (
        needle === '' && !expanded.has(entry.group.id)
          ? []
          : entry.models.map((model) => ({ group: entry.group, model }))
      )), [filtered, expanded, needle]);

      // Index the visible rows by a stable `<provider>/<model>` key instead of a
      // render-order counter, so collapsing a provider or editing the query can
      // never leave a stale, unmounted row at a live index.
      const rowKeys = React.useMemo(() => visible.map((entry) => `${entry.group.id}/${entry.model.id}`), [visible]);
      const rowIndexByKey = React.useMemo(() => {
        const index = new Map();
        rowKeys.forEach((key, at) => { index.set(key, at) });
        return index;
      }, [rowKeys]);

      React.useEffect(() => { setActive(0) }, [needle]);

      React.useEffect(() => {
        if (active < 0) return;
        const key = rowKeys[active];
        if (key === undefined) return;
        rowRefs.current[key]?.scrollIntoView({ block: 'nearest' });
      }, [active, rowKeys]);

      const toggle = (providerId) => {
        setExpanded((previous) => {
          const next = new Set(previous);
          if (next.has(providerId)) next.delete(providerId);
          else next.add(providerId);
          return next;
        });
      };

      const reload = () => {
        lastAction.current = 'load';
        try { directory?.load().catch(() => { /* surfaced on the store */ }) } catch { /* same */ }
      };

      /** Report a rejected selection inside the panel; true means it went through. */
      const settle = (result, modelName) => {
        if (result === undefined || result.ok !== false) return true;
        const { code, message } = result.error;
        setFailure(t('panel.failed', {
          message: code === 'session/writer-held' ? t('panel.sessionInUse') : `${code}: ${message}`,
        }));
        if (modelName !== undefined) setActive((index) => index);
        return false;
      };

      const runSelect = async (selection) => {
        busyRef.current = true;
        setBusy(true);
        setFailure(null);
        lastAction.current = 'select';
        try {
          return settle(await directory.select(selection));
        } catch (error) {
          setFailure(t('panel.failed', { message: error instanceof Error ? error.message : String(error) }));
          return false;
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      };

      const choose = async (entry) => {
        if (directory === undefined || busyRef.current) return;
        const selection = { provider: entry.group.id, model: entry.model.id };
        const effort = entry.model.reasoning?.defaultEffort;
        if (effort !== undefined) selection.reasoningEffort = effort;
        if (await runSelect(selection)) close();
      };

      const chooseEffort = async (effort) => {
        if (directory === undefined || current === null || busyRef.current) return;
        const selection = { provider: current.provider, model: current.model };
        if (effort !== undefined) selection.reasoningEffort = effort;
        await runSelect(selection);
      };

      const onKeyDown = (event) => {
        // An IME composition owns every key, including ↑↓ (pinyin candidate
        // paging) and Enter. Leave the event completely alone while composing.
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;

        if (event.key === 'Tab') {
          // role="dialog" + aria-modal promises a focus trap; deliver one.
          const nodes = panelRef.current === null ? null
            : panelRef.current.querySelectorAll('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
          if (nodes !== null && nodes.length > 0) {
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
          return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          // Keep the caret inside the search field; only the highlight moves.
          event.stopPropagation();
          if (visible.length === 0) return;
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setActive((index) => (index + step + visible.length) % visible.length);
          return;
        }

        if (event.key === 'Enter') {
          const entry = visible[active];
          if (entry === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          void choose(entry);
        }
      };

      const currentModel = current === null
        ? undefined
        : (groups.find((group) => group.id === current.provider)?.models ?? [])
          .find((model) => model.id === current.model);
      const efforts = currentModel?.reasoning?.efforts ?? [];
      const effectiveEffort = current?.reasoningEffort ?? currentModel?.reasoning?.defaultEffort;
      // `idle` before the first load also counts as loading: otherwise the first
      // paint flashes "no models" before the catalog arrives.
      const loading = state === undefined || (state.status !== 'ready' && groups.length === 0);
      const unavailable = directory === undefined;
      const loadError = lastAction.current === 'load' && state?.error ? state.error : null;
      const searched = needle !== '';

      return h('div', {
        className: 'dmp-backdrop',
        onMouseDown: (event) => { if (event.target === event.currentTarget) close() },
      },
        h('div', {
          ref: panelRef,
          className: 'dmp-panel',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('panel.title'),
          'aria-busy': busy,
          onKeyDown,
        },
          h('div', { className: 'dmp-head' },
            h('span', { className: 'dmp-headIcon' }, h(Magnifier)),
            h('input', {
              ref: searchRef,
              className: 'dmp-search',
              type: 'text',
              role: 'searchbox',
              placeholder: t('panel.search'),
              'aria-label': t('panel.search'),
              'aria-controls': listId,
              'aria-activedescendant': visible[active] === undefined ? undefined : `${listId}-opt-${active}`,
              autoComplete: 'off',
              spellCheck: false,
              value: query,
              onChange: (event) => { setQuery(event.target.value) },
            }),
            h('button', {
              type: 'button',
              className: 'dmp-tool',
              title: t('panel.close'),
              'aria-label': t('panel.close'),
              onClick: () => { close() },
            }, '✕')),

          h('div', { className: 'dmp-actions' },
            searched
              // Expand/collapse do nothing while searching (every group is open),
              // so show the match count instead of two dead buttons.
              ? h('span', { className: 'dmp-link dmp-static' },
                t('panel.found', { count: visible.length }))
              : [
                h('button', {
                  key: 'expand',
                  type: 'button', className: 'dmp-link',
                  onClick: () => { setExpanded(new Set(filtered.map((entry) => entry.group.id))) },
                }, t('panel.expandAll')),
                h('button', {
                  key: 'collapse',
                  type: 'button', className: 'dmp-link',
                  onClick: () => { setExpanded(new Set()) },
                }, t('panel.collapseAll')),
              ],
            busy
              ? h('span', { className: 'dmp-busy', role: 'status', 'aria-live': 'polite' }, t('panel.switching'))
              : null),

          h('div', { className: 'dmp-list', role: 'listbox', id: listId, 'aria-label': t('panel.title') },
            unavailable ? h('div', { className: 'dmp-status' }, t('panel.unavailable')) : null,
            !unavailable && loading ? h('div', { className: 'dmp-status' }, t('panel.loading')) : null,
            // Only a LOAD failure has a working retry; a rejected selection is
            // reported in the bar below, so the retry a user clicks is real.
            loadError !== null ? h('div', { className: 'dmp-error' },
              h('span', { className: 'dmp-errorText' }, loadError),
              h('button', { type: 'button', className: 'dmp-link', onClick: reload }, t('panel.retry'))) : null,
            (state?.failures ?? []).map((row) => h('div', { className: 'dmp-warn', key: `failure:${row.id}` },
              t('panel.groupFailed', { name: row.name, message: row.message }))),
            !unavailable && !loading && groups.length === 0
              ? h('div', { className: 'dmp-status' }, t('panel.noModels'))
              : null,
            !unavailable && groups.length > 0 && filtered.length === 0
              ? h('div', { className: 'dmp-status' }, t('panel.empty'))
              : null,
            !unavailable && groups.length > 0 && filtered.length > 0 && visible.length === 0
              ? h('div', { className: 'dmp-status' }, t('panel.openOne'))
              : null,

            filtered.map((entry) => {
              const open = needle !== '' || expanded.has(entry.group.id);
              const isCurrent = current !== null && current.provider === entry.group.id;
              return h('section', { className: 'dmp-group', key: entry.group.id },
                h('button', {
                  type: 'button',
                  className: isCurrent ? 'dmp-provider dmp-providerCurrent' : 'dmp-provider',
                  'aria-expanded': open,
                  onClick: () => { toggle(entry.group.id) },
                },
                  h(Chevron, { open }),
                  h('span', { className: 'dmp-providerName' }, providerLabel(entry.group, t)),
                  h('span', { className: 'dmp-providerCount' },
                    t('panel.count', { count: entry.models.length }))),
                open ? entry.models.map((model) => {
                  const at = rowIndexByKey.get(`${entry.group.id}/${model.id}`) ?? -1;
                  const selected = current !== null
                    && current.provider === entry.group.id
                    && current.model === model.id;
                  return h('button', {
                    key: model.id,
                    id: at < 0 ? undefined : `${listId}-opt-${at}`,
                    ref: (node) => {
                      const key = `${entry.group.id}/${model.id}`;
                      if (node === null) delete rowRefs.current[key];
                      else rowRefs.current[key] = node;
                    },
                    type: 'button',
                    role: 'option',
                    'aria-selected': selected,
                    'aria-busy': pending !== null
                      && pending.provider === entry.group.id && pending.model === model.id,
                    className: selected ? 'dmp-model dmp-selected' : 'dmp-model',
                    'data-active': at >= 0 && at === active ? '' : undefined,
                    title: model.description ?? model.name,
                    onMouseMove: () => { if (at >= 0 && at !== active) setActive(at) },
                    onClick: () => { void choose({ group: entry.group, model }) },
                  },
                    h(ModelLabel, {
                      provider: entry.group,
                      model,
                      placement: 'option',
                      selected,
                    }),
                    h('span', { className: 'dmp-check' },
                      pending !== null && pending.provider === entry.group.id && pending.model === model.id
                        ? h('span', { className: 'dmp-dot' })
                        : selected ? h(Check) : null));
                }) : null);
            })),

          failure === null ? null : h('div', { className: 'dmp-error dmp-errorBar', role: 'status' },
            h('span', { className: 'dmp-errorText' }, failure),
            h('button', {
              type: 'button',
              className: 'dmp-tool dmp-errorClose',
              title: t('panel.close'),
              'aria-label': t('panel.close'),
              onClick: () => { setFailure(null) },
            }, '✕')),

          current === null ? null : h('div', { className: 'dmp-foot' },
            h('span', { className: 'dmp-footLabel' }, t('panel.current')),
            h('span', { className: 'dmp-footValue', title: currentModel?.name ?? current.model },
              currentModel === undefined
                ? current.model
                : h(ModelLabel, {
                  provider: groups.find((group) => group.id === current.provider) ?? { id: current.provider, name: current.provider },
                  model: currentModel,
                  placement: 'menu',
                  selected: true,
                })),
            efforts.length === 0 ? null : h('div', { className: 'dmp-efforts' },
              h('span', { className: 'dmp-footLabel' }, t('panel.effort')),
              efforts.map((effort) => h('button', {
                key: effort.id,
                type: 'button',
                className: effectiveEffort === effort.id ? 'dmp-chip dmp-chipOn' : 'dmp-chip',
                title: effort.description ?? effort.name,
                onClick: () => { void chooseEffort(effort.id) },
              }, effort.name))))));
    }

    /**
     * Overlay seat: portals to the body because the docked composer would clip it.
     * Open state is module-level, so an unmount (panel switch, session switch)
     * must retire it — otherwise the panel pops back up unasked on return.
     */
    function PickerOverlay(props) {
      const state = React.useSyncExternalStore(ui.subscribe, ui.getSnapshot);
      React.useEffect(() => () => { if (ui.getSnapshot().open) ui.set({ open: false }) }, []);
      if (!state.open) return null;
      const directory = directoryOf(props.sessionId);
      return createPortal(
        h(PickerPanel, { ...props, close: closePicker, directory }),
        document.body,
      );
    }

    /** Inline stylesheet, owned by this plugin's fiber. */
    const CSS = `
.dmp-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;
  padding:16px;background:var(--dsw-alias-bg-mask-1);}
.dmp-panel{box-sizing:border-box;display:flex;flex-direction:column;width:min(520px,100%);
  max-height:min(72vh,660px);overflow:hidden;border-radius:var(--dsw-radius-lg,14px);border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);
  box-shadow:var(--dsw-shadow-lv2);font-size:13px;line-height:20px;}
.dmp-head{display:flex;align-items:center;gap:6px;padding:10px 10px 4px;}
.dmp-headIcon{display:inline-flex;flex:0 0 auto;color:var(--dsw-alias-label-caption);}
.dmp-search{flex:1;min-width:0;height:28px;border:none;outline:none;background:transparent;
  color:var(--dsw-alias-label-primary);font:inherit;}
.dmp-search::placeholder{color:var(--dsw-alias-label-caption);}
.dmp-tool{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;
  padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);
  font-size:12px;line-height:1;cursor:pointer;}
.dmp-tool:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dmp-actions{display:flex;align-items:center;gap:12px;padding:0 12px 8px;
  border-bottom:1px solid var(--dsw-alias-border-l1);}
.dmp-link{padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);
  font:inherit;font-size:12px;cursor:pointer;}
.dmp-link:hover{color:var(--dsw-alias-label-primary);}
.dmp-static{cursor:default;color:var(--dsw-alias-label-secondary);}
.dmp-static:hover{color:var(--dsw-alias-label-secondary);}
.dmp-busy{margin-left:auto;color:var(--dsw-alias-label-caption);font-size:11px;}
.dmp-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 6px 8px;
  --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);}
.dmp-group{margin-top:2px;}
.dmp-provider{display:flex;align-items:center;gap:6px;width:100%;padding:7px 6px;border:none;border-radius:var(--dsw-radius-md,8px);
  background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-weight:500;
  text-align:left;cursor:pointer;}
.dmp-provider:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dmp-providerCurrent{color:var(--dsw-alias-label-primary);}
.dmp-chevron{flex:0 0 auto;color:var(--dsw-alias-label-caption);transition:transform 120ms ease;}
.dmp-providerName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dmp-providerCount{flex:0 0 auto;color:var(--dsw-alias-label-caption);font-size:11px;font-weight:400;}
.dmp-model{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px 6px 26px;border:none;
  border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;
  text-align:left;cursor:pointer;}
.dmp-model:hover,.dmp-model[data-active]{background:var(--dsw-alias-interactive-bg-hover);}
.dmp-selected{font-weight:500;}
.dmp-modelName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* A provider plugin's own label may return any inline content; keep it inside
   the row without letting it stretch the row or clip its own chips. */
.dmp-model > :first-child{flex:1;min-width:0;display:flex;align-items:center;gap:4px;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.dmp-model > :first-child *{min-width:0;}
.dmp-badged{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:100%;}
.dmp-badgeChip{flex:none;padding:0 5px;border-radius:var(--dsw-radius-sm,6px);
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);
  font-size:10px;line-height:15px;font-weight:500;}
.dmp-check{display:grid;place-items:center;flex:0 0 14px;color:var(--dsw-alias-state-business-primary);}
.dmp-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-business-primary);}
.dmp-status{padding:10px 8px;color:var(--dsw-alias-label-tertiary);font-size:12px;}
.dmp-error{display:flex;gap:8px;align-items:flex-start;margin:4px 6px;padding:6px 8px;border-radius:var(--dsw-radius-md,8px);
  background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);
  font-size:11px;line-height:16px;}
.dmp-errorText{flex:1;min-width:0;word-break:break-word;}
.dmp-errorBar{margin:4px 10px 0;}
.dmp-errorClose{flex:0 0 auto;width:18px;height:18px;font-size:10px;color:inherit;}
.dmp-warn{margin:4px 6px;padding:6px 8px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-module-platform);
  color:var(--dsw-alias-state-warn-label);font-size:11px;line-height:16px;}
.dmp-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;
  border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px;}
.dmp-footLabel{flex:0 0 auto;color:var(--dsw-alias-label-caption);}
.dmp-footValue{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  display:flex;align-items:center;gap:4px;color:var(--dsw-alias-label-primary);}
.dmp-efforts{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-left:auto;}
.dmp-chip{padding:2px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;
  background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;}
.dmp-chip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);}
.dmp-chipOn{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary);}
.dmp-row{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;padding:7px 8px;border:none;
  border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;
  font-size:13px;line-height:20px;text-align:left;cursor:pointer;}
.dmp-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);}
.dmp-row:disabled{color:var(--dsw-alias-label-dimmed);cursor:default;}
.dmp-rowIcon{display:inline-flex;flex:0 0 auto;color:var(--dsw-alias-label-caption);}
.dmp-rowLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dmp-rowHint{flex:0 0 auto;color:var(--dsw-alias-label-caption);font-size:11px;}
@media (max-width:520px){.dmp-panel{max-height:min(80vh,660px);border-radius:var(--dsw-radius-lg,12px);}}
`;

    /**
     * `modelDirectories` is the SHIPPED per-session model service this plugin
     * reads and writes through, so it is a real dependency rather than a lazy
     * `ctx.get()` that would leave the panel permanently "unavailable" if it
     * happened to be missing on first render.
     */
    const inject = ['slots', 'locale', 'modelDirectories'];

    /**
     * Register the picker's two surfaces.
     * @param {object} ctx - client root context.
     */
    function apply(ctx) {
      rootCtx = ctx;

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'model-picker: dictionaries');

      const style = document.createElement('style');
      style.setAttribute('data-dsh-model-picker', '');
      style.textContent = CSS;
      document.head.appendChild(style);
      ctx.effect(() => () => { style.remove() }, 'model-picker: stylesheet');

      // 1. A row inside the shipped model menu, above the other session options.
      ctx.slots.inject('conversation.input.model.options', () => ctx.slots.register({
        name: 'conversation.input.model.options',
        id: 'model-picker',
        order: -10,
        locale: NS,
      }, PickerMenuRow));

      // 2. The picker overlay on the composer's floating layer.
      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'model-picker',
        order: 90,
        locale: NS,
      }, PickerOverlay));

      // Never leave the panel open across an unload.
      ctx.effect(() => () => { ui.set({ open: false }) }, 'model-picker: close on unload');

      // Re-render open rows when a provider plugin claims or drops its model
      // label seat (badges, promotion chips): the seat's own version stream is
      // the only notification the registry offers for it.
      ctx.slots.inject('conversation.input.model.label', () => {
        labelUi.set({ version: labelUi.getSnapshot().version + 1 });
        let dropped = false;
        return () => {
          if (dropped) return;
          dropped = true;
          labelUi.set({ version: labelUi.getSnapshot().version + 1 });
        };
      });
    }

    return { inject, apply };
  },
});
