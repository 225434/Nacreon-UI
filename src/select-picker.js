(() => {
  'use strict';
  const key = Symbol.for('material-lib.select-picker.v1');
  if (globalThis[key]) return;

  const normalize = text => text.normalize('NFKC').trim().toLocaleLowerCase();

  function renderOptions(select, list, matches) {
    const doc = select.ownerDocument;
    const frag = doc.createDocumentFragment();
    const rows = [];
    let lastGroup, section;
    for (const option of select.options) {
      const group = option.closest('optgroup');
      if (option.hidden || group?.hidden || !matches(option, group)) continue;
      if (group && group !== lastGroup) {
        section = doc.createElement('div');
        section.className = 'ml-select-group';
        section.setAttribute('role', 'group');
        section.setAttribute('aria-label', group.label);
        const heading = doc.createElement('div');
        heading.className = 'ml-select-heading';
        heading.setAttribute('aria-hidden', 'true');
        heading.textContent = group.label;
        section.append(heading);
        frag.append(section);
      }
      lastGroup = group;
      const row = doc.createElement('div');
      row.className = 'ml-select-option';
      row.setAttribute('role', 'option');
      row.id = list.id + '-' + option.index;
      row.setAttribute('aria-selected', String(option.selected));
      if (option.matches(':disabled')) row.setAttribute('aria-disabled', 'true');
      row.textContent = option.label;
      (group ? section : frag).append(row);
      rows.push({ row, option });
    }
    list.replaceChildren(frag);
    return rows;
  }

  function revealOption(row, list) {
    const item = row.getBoundingClientRect(), frame = list.getBoundingClientRect();
    if (item.top < frame.top) list.scrollTop -= frame.top - item.top;
    else if (item.bottom > frame.bottom) list.scrollTop += item.bottom - frame.bottom;
  }

  function placePopup(owner, target, panel, previous, force = false) {
    const doc = owner.ownerDocument;
    const viewport = doc.defaultView.visualViewport;
    const anchor = target.getBoundingClientRect();
    const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0;
    const vw = viewport?.width ?? doc.documentElement.clientWidth;
    const vh = viewport?.height ?? doc.documentElement.clientHeight;
    if (!anchor.width || !anchor.height || anchor.bottom <= vy || anchor.top >= vy + vh ||
        anchor.right <= vx || anchor.left >= vx + vw) return null;
    const geometry = [anchor.x, anchor.y, anchor.width, anchor.height, vx, vy, vw, vh].join('/');
    if (!force && previous === geometry) return geometry;
    const gap = 5, margin = 8;
    const width = Math.min(Math.max(anchor.width, 160), Math.max(1, vw - margin * 2));
    const left = getComputedStyle(owner).direction === 'rtl' ? anchor.right - width : anchor.left;
    panel.style.width = width + 'px';
    panel.style.left = Math.max(vx + margin, Math.min(left, vx + vw - margin - width)) + 'px';
    panel.style.removeProperty('--ml-select-room');
    const below = vy + vh - margin - anchor.bottom - gap;
    const above = anchor.top - vy - margin - gap;
    const up = below < panel.offsetHeight && above > below;
    panel.style.setProperty('--ml-select-room', Math.max(1, up ? above : below) + 'px');
    panel.dataset.side = up ? 'above' : 'below';
    panel.style.top = Math.max(vy + margin, up ? anchor.top - gap - panel.offsetHeight : anchor.bottom + gap) + 'px';
    return geometry;
  }

  globalThis[key] = { normalize, renderOptions, revealOption, placePopup };
})();
