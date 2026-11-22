(() => {
  'use strict';
  if (customElements.get('ml-date-range')) return;
  const { ValueField, part, ensureId, signal } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const { CalendarView, dayOf, isoOf, shiftMonth, today, limits, allowed, aligned } =
    globalThis[Symbol.for('material-lib.calendar.v1')];
  const orderMessage = '结束日期须等于或晚于开始日期。';

  class DateRange extends ValueField {
    #panel;
    #anchor = null;
    #calendar;
    #ranges;
    #earliest;
    #latest;
    #ownError;
    #openButton;
    get fields() { return [...this.querySelectorAll('input[type="date"]')].slice(0, 2); }
    get value() { const [a, b] = this.fields; return { start: a?.value || '', end: b?.value || '' }; }
    set value({ start = '', end = '' }) {
      const [a, b] = this.fields;
      if (a && b) { a.value = start; b.value = end; this.refresh(); }
    }
    connectedCallback() {
      super.connectedCallback();
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#keys);
      this.addEventListener('pointerover', this.#hover);
      this.addEventListener('pointerout', this.#leave);
    }
    disconnectedCallback() {
      this.closePicker();
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#keys);
      this.removeEventListener('pointerover', this.#hover);
      this.removeEventListener('pointerout', this.#leave);
      super.disconnectedCallback();
    }
    refresh() {
      const [a, b] = this.fields;
      this.toggleAttribute('data-ml-ready', !!b);
      if (this.#ownError && (this.#ownError !== b || !a?.value || !b?.value || a.valueAsNumber <= b.valueAsNumber)) {
        if (this.#ownError.validationMessage === orderMessage) this.#ownError.setCustomValidity('');
        if (this.#ownError.willValidate || !this.#ownError.validity.customError) this.#ownError = null;
      }
      if (!b) { this.closePicker(); return; }
      const reversed = a.valueAsNumber > b.valueAsNumber;
      if (reversed && !b.validity.customError) { b.setCustomValidity(orderMessage); this.#ownError = b; }
      const error = part(this, 'error');
      error.setAttribute('aria-live', 'polite');
      error.hidden = !reversed;
      if (error.textContent !== (reversed ? orderMessage : '')) error.textContent = reversed ? orderMessage : '';
      part(this, 'surface', 'ml-value-surface');
      this.#openButton = part(this, 'open', 'button');
      this.#openButton.setAttribute('aria-label', '打开日期范围日历');
      this.#openButton.setAttribute('aria-haspopup', 'dialog');
      this.#openButton.setAttribute('aria-expanded', String(!!this.#panel?.open));
      this.#ranges = [limits(a), limits(b)];
      const [start, end] = this.#ranges;
      this.#earliest = start.min;
      this.#latest = end.max;
      this.#openButton.disabled = [a, b].some(field => field.matches(':disabled, [readonly]')) ||
        start.min > start.max || end.min > end.max || this.#earliest > this.#latest;
      if (this.#panel?.open) {
        if (this.#openButton.disabled) this.closePicker();
        else {
          if (this.#anchor !== null && !this.#canBegin(this.#anchor)) this.#anchor = null;
          this.#move(this.#calendar.cursor, false);
        }
      }
    }
    #canBegin(day) {
      const [a, b] = this.#ranges;
      return (allowed(day, a) && day <= b.max) || (allowed(day, b) && day >= a.min);
    }
    #canPick(day) {
      if (this.#anchor === null) return this.#canBegin(day);
      const [a, b] = this.#ranges;
      return allowed(Math.min(day, this.#anchor), a) && allowed(Math.max(day, this.#anchor), b);
    }
    #nextDay(day, direction) {
      const [start, end] = this.#ranges, anchor = this.#anchor;
      const choices = [];
      if (anchor === null || allowed(anchor, end)) {
        const limit = { ...start, max: Math.min(start.max, anchor ?? end.max) };
        const candidate = aligned(limit, day, direction);
        if (candidate !== null) choices.push(candidate);
      }
      if (anchor === null || allowed(anchor, start)) {
        const limit = { ...end, min: Math.max(end.min, anchor ?? start.min) };
        const candidate = aligned(limit, day, direction);
        if (candidate !== null) choices.push(candidate);
      }
      if (!choices.length) return null;
      return direction > 0 ? Math.min(...choices) : Math.max(...choices);
    }
    #makePanel() {
      const panel = part(this, 'calendar', 'dialog');
      // A cloned enhanced control may already contain a rendered calendar.
      panel.removeAttribute('open');
      this.#calendar = new CalendarView(panel, day => this.#canPick(day),
        '<footer><span data-calendar="selection"></span><button type="button" data-calendar="cancel">取消</button></footer>');
      panel.setAttribute('aria-label', '选择日期范围');
      this.#openButton.setAttribute('aria-controls', ensureId(panel));
      panel.addEventListener('close', () => {
        if (!panel.open) { this.#anchor = null; this.#openButton.setAttribute('aria-expanded', 'false'); }
      });
      this.#panel = panel;
    }
    openPicker() {
      this.refresh();
      if (!this.hasAttribute('data-ml-ready') || this.#openButton.disabled || this.#panel?.open) return;
      if (!this.#panel) this.#makePanel();
      this.#anchor = null;
      const { start, end } = this.value;
      this.#move(dayOf(start) ?? dayOf(end) ?? today(), false);
      this.#panel.showModal();
      this.#openButton.setAttribute('aria-expanded', 'true');
      this.#calendar.focus();
    }
    closePicker() {
      if (this.#panel?.open) {
        this.#panel.close();
        this.#anchor = null;
        this.#openButton.setAttribute('aria-expanded', 'false');
      }
    }
    #move(day, focus, direction = 1) {
      this.#calendar.move(day, { min: this.#earliest, max: this.#latest }, direction);
      this.#panel.querySelector('[data-calendar="prompt"]').textContent = this.#anchor === null ? '选择第一个日期' : '选择另一端日期';
      const { start, end } = this.value;
      this.#panel.querySelector('[data-calendar="selection"]').textContent = this.#anchor !== null ? '已选 ' + isoOf(this.#anchor)
        : [start, end].filter(Boolean).join(' 至 ') || '可选择同一天';
      this.#paintRange(this.#anchor);
      if (focus) this.#calendar.focus();
    }
    #paintRange(preview) {
      const { start, end } = this.value;
      this.#calendar.select(this.#anchor ?? dayOf(start), this.#anchor === null ? dayOf(end) : preview ?? this.#anchor);
    }
    #pick(day) {
      if (!this.#canPick(day)) return;
      if (this.#anchor === null) {
        this.#anchor = day;
        this.#move(day, true);
      } else {
        const [a, b] = this.fields;
        const start = isoOf(Math.min(this.#anchor, day)), end = isoOf(Math.max(this.#anchor, day));
        const changed = [a.value !== start, b.value !== end];
        this.closePicker();
        a.value = start; b.value = end;
        this.refresh();
        if (changed[0]) signal(a);
        if (changed[1]) signal(b);
      }
    }
    #click = event => {
      const target = event.target.closest('button, dialog');
      if (!target) return;
      if (target === this.#openButton) { this.openPicker(); return; }
      if (!this.#panel?.open) return;
      if (target === this.#panel) {
        if (event.target !== target) return;
        const rect = target.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.closePicker();
      } else if (target.dataset.day !== undefined) this.#pick(Number(target.dataset.day));
      else if (target.dataset.calendar === 'cancel') this.closePicker();
      else if (['prev', 'next'].includes(target.dataset.calendar)) this.#move(shiftMonth(this.#calendar.cursor, target.dataset.calendar === 'prev' ? -1 : 1), false);
    };
    #hover = event => {
      const button = event.target.closest('button[data-day]:enabled');
      if (this.#panel?.open && this.#anchor !== null && button) this.#paintRange(Number(button.dataset.day));
    };
    #leave = event => {
      if (this.#panel?.open && this.#anchor !== null && event.target.closest('tbody') && !event.relatedTarget?.closest?.('tbody')) this.#paintRange(this.#anchor);
    };
    #keys = event => {
      if (!this.#panel?.open) return;
      const move = this.#calendar.keyMove(event);
      if (!move) return;
      const day = move.arrow ? this.#nextDay(move.day, move.direction) : move.day;
      if (day === null) return;
      this.#move(day, true, move.direction);
      if (this.#anchor !== null) this.#paintRange(this.#calendar.cursor);
    };
  }
  customElements.define('ml-date-range', DateRange);
})();
