(() => {
  'use strict';

  window.createPreviewPages = function (factories) {
    const controllers = new Map();
    const slots = [...document.querySelectorAll('[data-preview-page]')].map(host => {
      const content = document.createDocumentFragment();
      const source = host.querySelector(':scope > template[data-preview-content]');
      if (source) {
        content.append(source.content);
        source.remove();
      }
      return { host, content, pages: host.dataset.previewPage.split(' '), mounted: !source };
    });
    let current, controller;

    function park(slot) {
      // An upload in the demo keeps its native input and AbortSignal until it settles.
      if (!slot.mounted || slot.pages.includes(current)) return;
      const uploads = slot.host.querySelectorAll('ml-file-upload');
      if ([...uploads].some(upload => upload.entries.some(item => item.state === 'uploading'))) return;
      slot.mounted = false;
      slot.content.append(...slot.host.childNodes);
    }
    function afterUpload(event) {
      const slot = slots.find(item => item.host.contains(event.target));
      if (slot && !slot.pages.includes(current)) queueMicrotask(() => park(slot));
    }
    document.addEventListener('ml-upload-state', afterUpload);
    document.addEventListener('ml-files-change', afterUpload);

    return {
      select(next) {
        if (next === current) return controller;
        controller?.select(false);
        current = next;
        for (const slot of slots) {
          if (!slot.pages.includes(next)) park(slot);
          else if (!slot.mounted) {
            slot.mounted = true;
            slot.host.append(slot.content);
          }
        }
        if (!controllers.has(next) && Object.hasOwn(factories, next)) controllers.set(next, factories[next]());
        controller = controllers.get(next);
        controller?.select(true);
        return controller;
      },
    };
  };
})();
