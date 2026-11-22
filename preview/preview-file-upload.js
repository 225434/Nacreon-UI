(() => {
  'use strict';

  function simulateUpload(file, { signal, onProgress }) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      let percent = 0;
      const cancel = () => { clearInterval(timer); reject(signal.reason); };
      const timer = setInterval(() => {
        percent = Math.min(100, percent + 8);
        onProgress(percent, 100);
        if (percent === 100) {
          clearInterval(timer);
          signal.removeEventListener('abort', cancel);
          resolve();
        }
      }, file.name.endsWith('.csv') ? 155 : 115);
      signal.addEventListener('abort', cancel, { once: true });
    });
  }

  window.createFileUploadPreview = function () {
    const kinds = document.querySelector('#file-upload-kinds');
    const tools = document.querySelector('#file-upload-tools');
    const specimen = document.querySelector('#file-upload-specimen');
    const source = document.querySelector('#file-upload-template').content.firstElementChild;
    const examples = document.querySelector('#file-upload-examples');
    const uploader = source.cloneNode(true);
    specimen.append(uploader);
    uploader.upload = simulateUpload;
    const compact = () => kinds.querySelector(':checked').value === 'compact';
    const pixel = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XtdsAAAAASUVORK5CYII='), char => char.charCodeAt(0));
    const photo = name => new File([pixel], name, { type: 'image/png', lastModified: 0 });

    function show() {
      if (specimen.hidden) return;
      const { entries } = uploader;
      const active = entries.filter(item => item.state === 'uploading').length;
      const completed = entries.filter(item => item.state === 'complete').length;
      const message = active ? active + ' 个文件正在模拟上传' : completed ? '已完成 ' + completed + ' / ' + entries.length + ' 个'
        : entries.length ? '已选 ' + entries.length + ' 个文件' : '等待选择文件';
      const status = document.querySelector('#stage-state');
      if (status.textContent !== message) status.textContent = message;
      document.querySelector('#state-dot').className = entries.length ? 'state-dot' : 'state-dot off';
      const shortcut = document.querySelector('#shortcut');
      shortcut.hidden = false;
      shortcut.querySelector('kbd').textContent = 'Space';
      shortcut.querySelector('span').textContent = '选择文件';
      shortcut.title = '将键盘焦点移到文件选择框后操作';
    }
    kinds.addEventListener('change', () => uploader.toggleAttribute('compact', compact()));
    uploader.addEventListener('ml-files-change', show);
    uploader.addEventListener('ml-upload-state', show);
    tools.querySelector('button').addEventListener('click', () => uploader.addFiles([
      photo('湖岸细节.png'),
      new File(['相册,照片数量\n山间湖泊,96\n'], '素材记录.csv', { type: 'text/csv', lastModified: 0 }),
    ]));

    const form = document.querySelector('#file-attachment-form');
    const formResult = document.querySelector('#file-attachment-result');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const files = new FormData(form).getAll('attachments');
      formResult.textContent = '表单文件 ' + files.map(file => file.name).join('、');
    });
    form.addEventListener('reset', () => { formResult.textContent = ''; });
    const single = document.querySelector('#file-single-photo');
    let sampleIndex = 0;
    document.querySelector('#file-photo-sample').addEventListener('click', () => {
      single.addFiles([photo(sampleIndex++ % 2 ? '岸边特写.png' : '湖面全景.png')]);
    });

    function select(enabled) {
      kinds.hidden = tools.hidden = specimen.hidden = examples.hidden = !enabled;
    }
    function code(head, lines) {
      const copy = source.cloneNode(true);
      copy.id = 'file-upload-sample';
      copy.toggleAttribute('compact', compact());
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      return head.concat(lines, '  ' + copy.outerHTML, '</div>', '', '<script>',
        '  customElements.whenDefined("ml-file-upload").then(() => {',
        '    document.getElementById("file-upload-sample").upload = ' + simulateUpload.toString() + ';', '  });',
        '</script>').join('\n');
    }
    return { select, show, code };
  };
})();
