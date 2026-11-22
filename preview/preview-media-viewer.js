(() => {
  'use strict';

  window.createMediaViewerPreview = function () {
    const specimen = document.querySelector('#media-viewer-specimen');
    const examples = document.querySelector('#media-viewer-examples');
    const source = document.querySelector('#media-viewer-template').content.firstElementChild;
    const status = document.querySelector('#stage-state');
    const shortcut = document.querySelector('#shortcut');
    let viewer;

    function show() {
      if (specimen.hidden || !viewer) return;
      const text = '本地素材 · ' + viewer.querySelectorAll('a[data-media]').length + ' 项';
      if (status.textContent !== text) status.textContent = text;
      document.querySelector('#state-dot').className = 'state-dot';
      shortcut.hidden = false;
      shortcut.querySelector('kbd').textContent = '← →';
      shortcut.querySelector('span').textContent = '切换素材';
      shortcut.title = '将焦点移到预览器内操作。放大图片后，在画布内使用方向键平移。';
    }

    function select(enabled) {
      specimen.hidden = examples.hidden = !enabled;
      if (enabled && !viewer) {
        viewer = source.cloneNode(true);
        specimen.append(viewer);
      } else if (!enabled && viewer) {
        viewer.close(false);
        viewer.pause();
      }
    }

    function code(head, lines) {
      const sample = source.cloneNode(true);
      if (viewer?.value) sample.setAttribute('value', viewer.value);
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      return head.concat(lines, '  ' + sample.outerHTML, '</div>').join('\n');
    }

    return { select, show, code };
  };
})();
