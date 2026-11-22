(() => {
  'use strict';
  if (customElements.get('ml-date-picker')) return;
  const { PickerField } = globalThis[Symbol.for('material-lib.picker-field.v1')];
  const { CalendarView, dayOf, isoOf, shiftMonth, today, limits, allowed, aligned } =
    globalThis[Symbol.for('material-lib.calendar.v1')];

  class SingleDatePicker extends PickerField {
    #limits;
    #calendar;
    get inputType() { return 'date'; }
    get pickerLabel() { return '日期'; }
    readLimits(field) {
      this.#limits = limits(field);
      return this.#limits.min <= this.#limits.max;
    }
    buildPicker(panel) {
      this.#calendar = new CalendarView(panel, day => allowed(day, this.#limits),
        '<footer><div class="ml-picker-actions">' +
        '<button type="button" data-calendar="today" data-ml-picker-action="quiet">今天</button>' +
        '<button type="button" data-calendar="clear" data-ml-picker-action="quiet">清除</button></div>' +
        '<button type="button" data-ml-picker-cancel data-ml-picker-action>取消</button></footer>');
      panel.querySelector('[data-calendar="prompt"]').textContent = '选择日期';
      panel.addEventListener('click', this.#click);
      panel.addEventListener('keydown', this.#keys);
    }
    updatePicker(panel, opening = false) {
      let day = this.#calendar.cursor;
      if (opening) {
        const initial = dayOf(this.value) ?? today();
        const before = aligned(this.#limits, initial, -1), after = aligned(this.#limits, initial, 1);
        day = after === null || (before !== null && initial - before < after - initial) ? before : after;
      }
      this.#move(day, panel.querySelector('tbody button:focus') !== null);
      panel.querySelector('[data-calendar="today"]').disabled = !allowed(today(), this.#limits);
      panel.querySelector('[data-calendar="clear"]').hidden = this.field.required || !this.value;
    }
    focusPicker() { this.#calendar.focus(); }
    #move(day, focus, direction = 1) {
      this.#calendar.move(day, this.#limits, direction);
      this.#calendar.select(dayOf(this.value));
      if (focus) this.#calendar.focus();
    }
    #click = event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || !this.open) return;
      if (button.dataset.day !== undefined) {
        const day = Number(button.dataset.day);
        if (allowed(day, this.#limits)) this.choose(isoOf(day));
        return;
      }
      const action = button.dataset.calendar;
      if (action === 'today') this.choose(isoOf(today()));
      if (action === 'clear') this.choose('');
      if (action === 'prev' || action === 'next') {
        this.#move(shiftMonth(this.#calendar.cursor, action === 'prev' ? -1 : 1), false);
        if (button.disabled) this.#calendar.focus();
      }
    };
    #keys = event => {
      const move = this.#calendar.keyMove(event);
      if (!move) return;
      const day = move.arrow ? aligned(this.#limits, move.day, move.direction) : move.day;
      if (day !== null) this.#move(day, true, move.direction);
    };
  }
  customElements.define('ml-date-picker', SingleDatePicker);
})();
