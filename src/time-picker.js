(() => {
  'use strict';
  if (customElements.get('ml-time-picker')) return;
  const { PickerField } = globalThis[Symbol.for('material-lib.picker-field.v1')];
  const { ensureId, stepStride } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const second = 1000, minute = 60 * second, hour = 60 * minute, day = 24 * hour;
  const units = [
    { label: '小时', scale: hour, size: 24 },
    { label: '分钟', scale: minute, size: 60 },
    { label: '秒', scale: second, size: 60 },
  ];
  const two = value => String(value).padStart(2, '0');
  const partOf = (time, unit) => Math.floor(time / unit.scale) % unit.size;
  function timeOf(value) {
    const valid = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(value);
    if (!valid) return null;
    const [, h, m, s = '0', ms = ''] = valid;
    return Number(h) * hour + Number(m) * minute + Number(s) * second + Number(ms.padEnd(3, '0'));
  }
  function timeString(value, withSeconds = false) {
    const h = partOf(value, units[0]), m = partOf(value, units[1]), s = partOf(value, units[2]);
    const ms = value % second;
    const digits = two(h) + ':' + two(m);
    if (!s && !ms && !withSeconds) return digits;
    return digits + ':' + two(s) + (ms ? '.' + String(ms).padStart(3, '0').replace(/0+$/, '') : '');
  }

  function limits(input) {
    const min = timeOf(input.min) ?? 0, max = timeOf(input.max) ?? day - 1;
    const intervals = min > max ? [[0, max], [min, day - 1]] : [[min, max]];
    return { intervals, firstHour: min > max ? Math.floor(min / hour) : 0,
      base: timeOf(input.min) ?? timeOf(input.defaultValue) ?? 0, step: Math.min(day, stepStride(input.step, minute, 3)) };
  }
  function closestTime({ intervals, base, step }, target, start = 0, end = day - 1) {
    let selected = null;
    for (const [min, max] of intervals) {
      const first = Math.ceil((Math.max(start, min) - base) / step);
      const last = Math.floor((Math.min(end, max) - base) / step);
      if (first > last) continue;
      const index = Math.max(first, Math.min(last, Math.round((target - base) / step)));
      const value = base + index * step;
      if (selected === null || Math.abs(target - value) < Math.abs(target - selected)) selected = value;
    }
    return selected;
  }

  class TimePicker extends PickerField {
    #limits;
    #draft;
    #columns;
    #reading;
    #clear;
    get inputType() { return 'time'; }
    get pickerLabel() { return '时间'; }
    readLimits(input) {
      this.#limits = limits(input);
      return closestTime(this.#limits, 0) !== null;
    }
    buildPicker(panel) {
      panel.classList.add('ml-time-panel');
      panel.innerHTML = '<header><h2>选择时间</h2><div class="ml-time-reading" dir="ltr" role="status" aria-atomic="true"></div></header>' +
        '<div class="ml-time-columns"></div><footer>' +
        '<div class="ml-picker-actions"><button type="button" data-time-action="clear" data-ml-picker-action="quiet">清除</button></div>' +
        '<div class="ml-picker-actions"><button type="button" data-ml-picker-cancel data-ml-picker-action>取消</button>' +
        '<button type="button" data-time-action="confirm" data-ml-picker-action="primary">确定</button></div></footer>';
      this.#reading = panel.querySelector('.ml-time-reading');
      this.#clear = panel.querySelector('[data-time-action="clear"]');
      const container = panel.querySelector('.ml-time-columns');
      this.#columns = units.map(unit => this.#createColumn(container, unit));
      panel.addEventListener('click', this.#click);
      panel.addEventListener('keydown', this.#keys);
    }
    #createColumn(container, unit) {
      const doc = this.ownerDocument;
      const column = doc.createElement('div');
      const label = doc.createElement('span');
      label.className = 'ml-time-label';
      label.textContent = unit.label;
      const list = doc.createElement('div');
      list.className = 'ml-time-list';
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', unit.label);
      list.tabIndex = 0;
      const id = ensureId(list);
      const items = [];
      for (let index = 0; index < unit.size; index++) {
        const item = doc.createElement('div');
        item.id = id + '-' + index;
        item.dataset.time = String(index);
        item.setAttribute('role', 'option');
        item.textContent = two(index);
        items.push(item);
      }
      list.append(...items);
      column.append(label, list);
      container.append(column);
      return { ...unit, column, list, items, first: 0 };
    }

    updatePicker(panel, opening = false) {
      const now = new Date();
      const preferred = opening ? timeOf(this.value) ?? (now.getHours() * hour + now.getMinutes() * minute) : this.#draft;
      this.#draft = closestTime(this.#limits, preferred);
      this.#clear.hidden = this.field.required || !this.value;
      this.#draw();
    }
    focusPicker() {
      this.#columns[0].list.focus({ preventScroll: true });
      for (const column of this.#columns) this.#reveal(column);
    }
    #partStart(column, index) {
      const span = column.scale * column.size;
      return Math.floor(this.#draft / span) * span + column.scale * index;
    }
    #draw() {
      const showSeconds = this.#limits.step % minute !== 0 || this.#limits.base % minute !== 0;
      this.#columns[2].column.hidden = !showSeconds;
      this.#reading.textContent = timeString(this.#draft, showSeconds);
      const hours = this.#columns[0], first = this.#limits.firstHour;
      if (first !== hours.first) {
        hours.list.append(...hours.items.slice(first), ...hours.items.slice(0, first));
        hours.first = first;
      }
      for (const column of this.#columns) {
        if (column.column.hidden) continue;
        const selected = partOf(this.#draft, column);
        column.items.forEach((item, index) => {
          const start = this.#partStart(column, index);
          item.hidden = closestTime(this.#limits, start, start, start + column.scale - 1) === null;
          item.setAttribute('aria-selected', String(index === selected));
        });
        column.list.setAttribute('aria-activedescendant', column.items[selected].id);
        this.#reveal(column);
      }
    }
    #reveal(column) {
      const { list, items } = column;
      const row = items[partOf(this.#draft, column)];
      if (!list.clientHeight) return;
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
      }
    }
    #select(column, index) {
      const start = this.#partStart(column, index);
      const proposed = start + this.#draft % column.scale;
      const value = closestTime(this.#limits, proposed, start, start + column.scale - 1);
      if (value !== null && value !== this.#draft) {
        this.#draft = value;
        this.#draw();
      }
    }
    #confirm() {
      this.choose(timeOf(this.value) === this.#draft ? this.value : timeString(this.#draft));
    }
    #click = event => {
      if (!this.open) return;
      const item = event.target.closest('[data-time]');
      if (item && !item.hidden) {
        const column = this.#columns.find(c => c.list === item.parentElement);
        if (column) {
          this.#select(column, Number(item.dataset.time));
          column.list.focus({ preventScroll: true });
        }
      } else if (event.target.dataset.timeAction === 'confirm') this.#confirm();
      else if (event.target.dataset.timeAction === 'clear' && !this.#clear.hidden) this.choose('');
    };
    #keys = event => {
      if (!this.open || event.altKey || event.ctrlKey || event.metaKey) return;
      const column = this.#columns.find(c => c.list === event.target);
      if (!column) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (event.key === 'Enter') this.#confirm();
        return;
      }
      const shifts = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5, Home: -column.size, End: column.size };
      if (!Object.hasOwn(shifts, event.key)) return;
      event.preventDefault();
      const items = Array.from(column.list.children).filter(item => !item.hidden);
      const index = items.indexOf(column.items[partOf(this.#draft, column)]);
      const next = items[Math.max(0, Math.min(items.length - 1, index + shifts[event.key]))];
      if (next) this.#select(column, Number(next.dataset.time));
    };
  }
  customElements.define('ml-time-picker', TimePicker);
})();
