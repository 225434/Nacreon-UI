(() => {
  'use strict';
  const key = Symbol.for('material-lib.calendar.v1');
  if (globalThis[key]) return;
  const { part, ensureId, stepStride } = globalThis[Symbol.for('material-lib.value-controls.v1')];

  const dayLength = 86400000;
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  const asDate = day => new Date(day * dayLength);
  const padTwo = number => String(number).padStart(2, '0');
  function isoOf(day) {
    const date = asDate(day);
    return String(date.getUTCFullYear()).padStart(4, '0') + '-' + padTwo(date.getUTCMonth() + 1) + '-' + padTwo(date.getUTCDate());
  }

  // Keep civil days separate from local time zones and daylight-saving transitions.
  function dayOf(iso) {
    const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), date = Number(match[3]);
    if (year < 1 || year > 275760) return null;
    const value = new Date(0);
    value.setUTCFullYear(year, month - 1, date);
    return value.getUTCFullYear() === year && value.getUTCMonth() + 1 === month && value.getUTCDate() === date
      ? +value / dayLength : null;
  }
  const firstDay = dayOf('0001-01-01'), lastDay = dayOf('275760-09-13');
  const weekIndex = day => (asDate(day).getUTCDay() + 6) % 7;
  const monthStart = day => day - asDate(day).getUTCDate() + 1;
  function shiftMonth(day, count) {
    const first = asDate(monthStart(day));
    first.setUTCMonth(first.getUTCMonth() + count);
    if (!Number.isFinite(+first)) return count > 0 ? lastDay + 1 : firstDay - 1;
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return Math.min(+first / dayLength + asDate(day).getUTCDate() - 1,
      Number.isFinite(+next) ? +next / dayLength - 1 : lastDay);
  }
  function today() {
    const now = new Date();
    return dayOf(String(now.getFullYear()).padStart(4, '0') + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate()));
  }
  function dateStride(input) {
    const fallback = stepStride(input.step, 1);
    const step = parseFloat(input.step);
    if (!Number.isFinite(step) || step <= 0 || Number.isInteger(step)) return fallback;
    // Native date controls can round fractional steps to whole days. Keep the
    // calendar's choices on the same grid as the editable field.
    const probe = input.ownerDocument.createElement('input');
    probe.type = 'date';
    probe.step = input.step;
    probe.value = '1970-01-01';
    if (probe.type !== 'date') return fallback;
    probe.stepUp();
    const stride = probe.valueAsNumber / dayLength;
    return Number.isInteger(stride) && stride > 0 && probe.validity.valid ? stride : fallback;
  }
  function limits(input) {
    const min = dayOf(input.min), max = dayOf(input.max);
    const range = { min: min ?? firstDay, max: max ?? lastDay,
      base: min ?? dayOf(input.defaultValue) ?? 0, step: dateStride(input) };
    const first = aligned(range, range.min, 1), last = aligned(range, range.max, -1);
    range.min = first ?? lastDay + 1; range.max = last ?? firstDay - 1;
    return range;
  }
  function allowed(day, limit) {
    return day >= limit.min && day <= limit.max && (day - limit.base) % limit.step === 0;
  }
  function aligned(range, day, direction) {
    day = direction > 0 ? Math.max(day, range.min) : Math.min(day, range.max);
    const steps = (day - range.base) / range.step;
    day = range.base + (direction > 0 ? Math.ceil(steps) : Math.floor(steps)) * range.step;
    return day >= range.min && day <= range.max ? day : null;
  }
  function fullDate(day) {
    const d = asDate(day);
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日，星期' + weekdays[weekIndex(day)];
  }

  class CalendarView {
    #panel;
    #grid;
    #canPick;
    cursor;

    constructor(panel, canPick, footer) {
      this.#panel = panel;
      this.#canPick = canPick;
      panel.classList.add('ml-calendar');
      panel.innerHTML = '<header><div><span data-calendar="prompt" aria-live="polite"></span><h2 data-calendar="month" aria-live="polite"></h2></div>' +
        '<div class="ml-month-nav"><button type="button" data-calendar="prev" aria-label="上个月"></button><button type="button" data-calendar="next" aria-label="下个月"></button></div></header>' +
        '<table role="grid"><thead><tr></tr></thead><tbody></tbody></table>' + footer;
      part(panel, 'sheet', 'ml-value-surface');
      this.#grid = panel.querySelector('table');
      this.#grid.setAttribute('aria-labelledby', ensureId(panel.querySelector('h2')));
      const week = this.#grid.tHead.rows[0];
      for (const name of weekdays) {
        const th = panel.ownerDocument.createElement('th');
        th.scope = 'col'; th.textContent = name; th.setAttribute('aria-label', '星期' + name); week.append(th);
      }
    }

    move(day, { min, max }, direction = 1) {
      day = Math.min(max, Math.max(min, day));
      const month = monthStart(day), next = shiftMonth(month, 1);
      const start = Math.max(min, month), end = Math.min(max, next - 1);
      this.cursor = day;
      for (let distance = 0; distance <= end - start; distance++) {
        const near = [day + distance * direction, day - distance * direction]
          .find(candidate => candidate >= start && candidate <= end && this.#canPick(candidate));
        if (near !== undefined) { this.cursor = near; break; }
      }

      const d = asDate(month), panel = this.#panel;
      panel.querySelector('[data-calendar="month"]').textContent = d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月';
      panel.querySelector('[data-calendar="prev"]').disabled = month <= min;
      panel.querySelector('[data-calendar="next"]').disabled = next > max;
      const body = this.#grid.tBodies[0];
      body.replaceChildren();
      const current = today();
      for (let week = month - weekIndex(month); week < next; week += 7) {
        const row = body.insertRow();
        for (let date = week; date < week + 7; date++) {
          const cell = row.insertCell();
          if (date < month || date >= next) continue;
          const button = panel.ownerDocument.createElement('button');
          button.type = 'button'; button.dataset.day = String(date);
          button.textContent = String(asDate(date).getUTCDate());
          button.setAttribute('aria-label', fullDate(date));
          if (date === current) button.setAttribute('aria-current', 'date');
          button.disabled = !this.#canPick(date);
          button.tabIndex = date === this.cursor && !button.disabled ? 0 : -1;
          cell.append(button);
        }
      }
    }

    select(first, last = null) {
      for (const button of this.#grid.querySelectorAll('button[data-day]')) {
        const day = Number(button.dataset.day), cell = button.parentElement;
        const edge = day === first || day === last;
        const inside = first !== null && last !== null &&
          day >= Math.min(first, last) && day <= Math.max(first, last);
        cell.toggleAttribute('data-in-range', inside);
        cell.toggleAttribute('data-edge', edge);
        cell.setAttribute('aria-selected', String(edge || inside));
      }
    }

    focus() {
      const target = this.#grid.querySelector('button[tabindex="0"]') ||
        this.#panel.querySelector('.ml-month-nav button:enabled, footer button:enabled:not([hidden])');
      target?.focus({ preventScroll: true });
      if (target && this.#panel.scrollHeight > this.#panel.clientHeight) target.scrollIntoView({ block: 'nearest' });
    }

    keyMove(event) {
      if (!event.target.matches('button[data-day]') || !this.#grid.contains(event.target) ||
          event.altKey || event.ctrlKey || event.metaKey) return null;
      const day = Number(event.target.dataset.day);
      const forward = getComputedStyle(this.#panel).direction === 'rtl' ? -1 : 1;
      const offsets = { ArrowLeft: -forward, ArrowRight: forward, ArrowUp: -7, ArrowDown: 7, Home: -weekIndex(day), End: 6 - weekIndex(day) };
      let next;
      if (Object.hasOwn(offsets, event.key)) next = day + offsets[event.key];
      else if (event.key === 'PageUp' || event.key === 'PageDown') {
        next = shiftMonth(day, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
      } else return null;
      event.preventDefault();
      return { day: next, direction: next < day ? -1 : 1, arrow: event.key.startsWith('Arrow') };
    }
  }

  globalThis[key] = { CalendarView, dayOf, isoOf, shiftMonth, today, limits, allowed, aligned };
})();
