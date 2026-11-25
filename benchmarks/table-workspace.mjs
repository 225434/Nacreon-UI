import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const components = ['button', 'input', 'select', 'data-table', 'drawer'];
export const files = ['design/global.css', ...components.flatMap(name =>
  ['css', 'js'].map(ext => `components/${name}/${name}.${ext}`))];

export function workspace(dist, theme, motion = 'high') {
  const url = file => pathToFileURL(join(dist, file)).href;
  const assets = files.map(file => file.endsWith('.css') ? `<link rel="stylesheet" href="${url(file)}">`
    : `<script defer src="${url(file)}"></script>`).join('');
  const rows = Array.from({ length: 1000 }, (_, i) =>
    `<tr><td>${String(i + 1).padStart(4, '0')}</td><td>山间湖泊 · ${i + 1}</td><td data-align="end">${(10 + i / 12).toFixed(2)} MB</td></tr>`).join('');
  return '<!doctype html><html lang="zh-CN" data-ml-theme="' + theme + '" data-ml-material="high" data-ml-motion="' + motion + '">' +
    '<meta charset="utf-8">' + assets + '<style>body{margin:0;padding:24px}main{max-width:1040px;margin:auto}' +
    'header{display:flex;align-items:end;gap:12px;margin-bottom:16px}ml-input{width:240px}ml-select{width:160px}' +
    '#rows{height:360px;overflow:auto}</style><main><h1>素材记录</h1><header>' +
    '<ml-input><label>搜索记录</label><input type="search" placeholder="文件名或编号"></ml-input>' +
    '<ml-select><select aria-label="筛选"><option>所有状态</option><option>待复核</option></select></ml-select>' +
    '<ml-button><button>导出记录</button></ml-button></header><div id="rows"><ml-data-table><table><thead><tr>' +
    '<th>编号</th><th>素材名称</th><th data-align="end">文件大小</th></tr></thead><tbody>' + rows +
    '</tbody></table></ml-data-table></div></main></html>';
}
