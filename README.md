# Nacreon UI

**[在线预览](https://ycloud-y.github.io/Nacreon-UI/)** · [English](README.en.md)

Nacreon UI 是一套 Web 自适应组件与设计资源库。在浏览器中打开[本地素材库](index.html)即可离线试用。点顶部的「组件目录」直接浏览当前分类，也可以切换到其他分类。输入中文名、英文名或用途可搜索全部组件与设计资源。用 ↑ 和 ↓ 浏览结果，Enter 打开选中项，Esc 返回顶栏。切换组件时会保留外观设置。「应用示例」和「示例代码」可直接打开当前组件的示例和 HTML。

## 文件与构建

| 位置 | 内容 |
| --- | --- |
| [index.html](index.html) | 离线组件目录与实时预览入口 |
| [dist/components](dist/components/) | 按组件分目录存放的独立 CSS 和 JS |
| [dist/design](dist/design/) | 全局样式、色彩、图标、材质、动效、排版、令牌和主题 |
| [src](src/) | 组件源文件与共享设计资源 |
| [preview](preview/) | 预览页面的脚本、样式和离线素材 |
| [tests](tests/) | 浏览器回归测试 |

从 v0.2.0 起，使用时请将引用指向 `dist/components/<组件名>/` 或 `dist/design/`。离线预览入口仍是根目录的 `index.html`。

预览和业务页面直接使用已构建的文件。维护源码时使用 Node.js 22 或更新版本，随后安装测试依赖、构建并运行 Chromium 回归。

```sh
npm ci
npx playwright install chromium
npm run build
npm test
```

## 页签与内容面板

引入 [tabs.css](dist/components/tabs/tabs.css) 和 [tabs.js](dist/components/tabs/tabs.js) 后即可离线使用。在 `data-ml-tablist` 上给出页签组名称，按钮的 `data-tab` 和同组面板的 `data-panel` 使用相同且唯一的键。[预览页签与内容面板](index.html#tabs)

```html
<link rel="stylesheet" href="./dist/components/tabs/tabs.css">
<script defer src="./dist/components/tabs/tabs.js"></script>

<ml-tabs value="overview">
  <div data-ml-tablist aria-label="素材记录">
    <button type="button" data-tab="overview">概览</button>
    <button type="button" data-tab="notes">备注</button>
  </div>
  <section data-panel="overview"><p>素材记录 DEMO-101，已完成复核。</p></section>
  <section data-panel="notes" hidden>
    <label>交接备注 <textarea rows="2"></textarea></label>
  </section>
</ml-tabs>
```

- 默认是横排底线样式。用 `variant="pill"` 切到胶囊样式，用 `orientation="vertical"` 请求侧边布局。组件可用宽度小于 480 CSS 像素时自动使用横排，页签超出可见范围时可滚动浏览。用 `--ml-tabs-accent`、`--ml-tabs-radius` 和 `--ml-tabs-panel-padding` 调整强调色、面板圆角和内边距。
- Tab 进入当前页签，方向键和 Home / End 浏览可用页签。横排用左右键，侧边用上下键。默认焦点移动后自动切换，`activation="manual"` 时按 Enter 或空格确认。使用 `disabled` 禁用页签。组件补齐页签与面板的语义、关联 ID 和焦点顺序。纯文字面板默认可以聚焦，可在面板上设置自己的 `tabindex`。[W3C Tabs 键盘与语义规范](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- `value` 属性可指定初始页签，脚本可读写 `tabs.value`，用 `tabs.panel` 读取当前面板。用户切换或调用 `tabs.select(key)` 变更时，会发出 `ml-tab-change`，其中 `detail` 包含 `value`、`previousValue`、`tab` 和 `panel`。切换时保留面板节点，返回时可继续编辑之前的输入。
- 页签和内容面板继承三种主题与四档材质、动效。高档材质使用实心流体玻璃，高档动效开启指针光照与弹性指示条。系统「减少动态效果」开启时，指示条与内容直接就位。

## 面包屑导航

引入 [breadcrumb.css](dist/components/breadcrumb/breadcrumb.css) 和 [breadcrumb.js](dist/components/breadcrumb/breadcrumb.js) 后即可离线使用。[预览面包屑导航](index.html#breadcrumb)

```html
<link rel="stylesheet" href="./dist/components/breadcrumb/breadcrumb.css">
<script defer src="./dist/components/breadcrumb/breadcrumb.js"></script>

<ml-breadcrumb>
  <nav aria-label="当前位置">
    <ol role="list">
      <li><a href="/gallery" data-home>素材档案</a></li>
      <li><a href="/gallery/collections">主题目录</a></li>
      <li><a href="/gallery/collections/landscapes">风景合集</a></li>
      <li><span aria-current="page">拍摄照片</span></li>
    </ol>
  </nav>
</ml-breadcrumb>
```

- 路径从起点按顺序写入 `nav > ol`。上级用原生链接，当前位置用 `aria-current="page"` 标记。可在首个链接上加 `data-home` 显示首页图标。[W3C 面包屑模式](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/)
- 按容器宽度和标签实际长度计算折叠。空间不足时保留起点和当前位置，其余层级从中间逐步收进「更多层级」，优先保留靠近当前页的上级。浮层中的条目仍使用原有链接。可用 Tab 浏览，Enter 打开，Esc 关闭。
- 可以用 `ol.replaceChildren(...items)` 更新整条路径。组件会随路径和容器尺寸变化重新计算，也可主动调用 `breadcrumb.refresh()`。浏览器缺少浮层功能时，完整路径会换行显示。
- 外观沿用三套主题及四档材质、动效。可用 `--ml-breadcrumb-accent` 调整当前位置和交互强调色。

## 步骤条

引入 [steps.css](dist/components/steps/steps.css) 和 [steps.js](dist/components/steps/steps.js) 后即可离线使用。预览包含可校验的素材记录表单，以及可浏览节点的审批流程。[预览步骤条](index.html#steps)

```html
<link rel="stylesheet" href="./dist/components/steps/steps.css">
<script defer src="./dist/components/steps/steps.js"></script>

<ml-steps id="record-steps" current="sampling">
  <ol role="list" aria-label="素材记录填写步骤">
    <li data-step="record" data-complete>
      <button type="button"><span class="ml-step-label">基本信息</span></button>
    </li>
    <li data-step="sampling">
      <span><span class="ml-step-label">相册设置</span></span>
    </li>
    <li data-step="review">
      <span><span class="ml-step-label">核对提交</span></span>
    </li>
  </ol>
</ml-steps>
```

- 用唯一的 `data-step` 标识步骤。设置 `steps.current` 或 `current` 属性更新当前项，组件同步 `aria-current="step"`。用 `data-complete` 标记已完成，用 `data-error` 标记有错误，其余非当前项为待开始。流程结束后可在组件上加 `finished`，清除当前项标记。[W3C 多步骤表单指南](https://www.w3.org/WAI/tutorials/forms/multi-page/)
- 步骤内可用原生链接跳到对应页面，也可用 `type="button"` 的按钮请求切换。按钮会发出 `ml-step-request`，其 `event.detail` 提供目标 `step` 和原步骤 `from`。应用接收请求后可校验当前表单，再更新 `current`。按钮用原生 `disabled` 表示暂不可进入的步骤。纯展示时使用文本容器。
- 默认按容器宽度与步骤数量在横向和纵向之间切换。可设 `orientation="horizontal"` 或 `orientation="vertical"` 固定方向。可用 `--ml-steps-accent` 调整强调色。组件共用三种主题和四档材质、动效。

## 树形导航

引入 [tree.css](dist/components/tree/tree.css) 和 [tree.js](dist/components/tree/tree.js) 后即可离线使用。使用嵌套的 `ul` 和 `li` 表达层级。[预览树形导航](index.html#tree)

```html
<link rel="stylesheet" href="./dist/components/tree/tree.css">
<script defer src="./dist/components/tree/tree.js"></script>

<ml-tree value="demo-101">
  <ul aria-label="素材档案目录">
    <li data-node="mountains" data-open>
      <div class="ml-tree-row"><span class="ml-tree-label">山野相册</span></div>
      <ul>
        <li data-node="demo-101">
          <div class="ml-tree-row"><span class="ml-tree-label">素材记录 DEMO-101</span></div>
        </li>
      </ul>
    </li>
  </ul>
</ml-tree>
```

- 每个节点使用唯一的 `data-node`。在父节点上加 `data-open` 设为展开，可用 `aria-disabled="true"` 禁用节点和其分支。组件支持单选，收起目录时保留选择及嵌套目录的展开状态。
- 点击箭头展开或折叠，点击名称选择。键盘用上下键浏览、左右键展开和折叠或在父子节点间移动，按 Enter 或空格选择。Home、End 跳到首尾，输入名称前缀可定位到可见节点。[W3C 树视图模式](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)
- 通过 `value` 和 `selectedItem` 读取选择。使用 `select(key)` 选择节点并打开它的上级路径，`setExpanded(key, flag)` 控制单个分支，`setAllExpanded(flag)` 控制全部分支。监听 `ml-tree-change` 取得 `value`、`previousValue` 和 `item`，监听 `ml-tree-toggle` 取得单个分支的 `value`、`expanded` 和 `item`。
- 节点层级缩进会随容器宽度收紧。可用 `--ml-tree-max-height` 限制列表高度、用 `--ml-tree-accent` 调整选择强调色，也可用 `data-kind="folder"` 或 `data-kind="image"` 指定节点图标。组件共用三套主题及四档材质、动效。

## 图片与视频预览器

引入 [media-viewer.css](dist/components/media-viewer/media-viewer.css) 和 [media-viewer.js](dist/components/media-viewer/media-viewer.js) 后即可离线使用。[打开预览](index.html#media-viewer)

```html
<link rel="stylesheet" href="./dist/components/media-viewer/media-viewer.css">
<script defer src="./dist/components/media-viewer/media-viewer.js"></script>

<ml-media-viewer value="lake" role="region" aria-label="风景预览">
  <ul role="list" aria-label="切换素材">
    <li><a data-media="lake" href="./preview/assets/media/alpine-lake.jpg"
        data-alt="雪峰倒映在高山湖面">山间湖泊</a></li>
    <li><a data-media="clip" data-kind="video" href="./preview/assets/media/landscape-slideshow.webm"
        data-poster="./preview/assets/media/alpine-lake.jpg">风景短片</a></li>
  </ul>
</ml-media-viewer>
```

- 素材是列表内带唯一 `data-media` 的链接。默认按图片读取，视频加 `data-kind="video"`，可选择填写 `data-poster` 和 `data-captions`。视频使用浏览器的原生播放控件。图片用 `data-alt` 提供描述。如需显示缩略图，可在链接内使用 `.ml-media-thumb` 包裹图片，再用 `.ml-media-name` 标注名称。[HTML 媒体元素规范](https://html.spec.whatwg.org/multipage/media.html)
- 图片支持缩放至适应大小的 400%、恢复适应、放大后拖动，以及触屏双指缩放。键盘可用左右键切换素材，`+`、`-` 和 `0` 操作缩放。在放大的图片画布内，方向键用于平移。焦点在图片画布内时，也可用滚轮缩放。放大预览支持 Esc 关闭。
- 用 `viewer.select(key)` 或 `viewer.value` 切换，监听 `ml-media-change` 获取选择结果。组件提供 `show()`、`close()`、`pause()`，并沿用主题、材质和动效。切换素材时会停止上一段视频。
- 示例使用三张生成的风景照和由它们拼接的 12 秒无声 WebM。复制示例时可保留 `preview/assets/media/` 的相对位置。[素材来源与制作说明](preview/assets/media/README.md)

## 工具栏、侧栏与详情抽屉

三个组件可以单独使用。将所用组件的同名 CSS 和 JS 放在页面旁，与其他组件共用主题、材质和动态档位。预览页的「素材记录工作区」可以切换分组、按日期排序、收藏记录和查看详情。[工具栏](index.html#toolbar) · [侧栏](index.html#sidebar) · [详情抽屉](index.html#drawer) · [联动示例](index.html#toolbar-examples)

### 工具栏

`ml-toolbar` 使用带 `data-action` 的原生按钮或链接。相邻操作可以放入带名称的 `role="group"`。Tab 进入工具栏，同向方向键移动焦点，Home / End 到达首末项。按钮保留原生的 Enter 和空格操作。可切换的命令添加 `aria-pressed`，每次触发会更新该状态。

```html
<link rel="stylesheet" href="./dist/components/toolbar/toolbar.css">
<script defer src="./dist/components/toolbar/toolbar.js"></script>
<ml-toolbar aria-label="记录操作">
  <button type="button" data-action="previous">上一条</button>
  <button type="button" data-action="next">下一条</button>
  <button type="button" data-action="save" aria-pressed="false">收藏</button>
</ml-toolbar>
```

监听 `ml-toolbar-action`，从 `event.detail` 读取 `action`、原生控件 `item` 和切换状态 `pressed`。普通命令的 `pressed` 为 `null`。设置 `orientation="vertical"` 可纵向排列。设置 `icons-only` 时，按钮内并列放置 SVG 或 `ml-icon` 与 `<span class="ml-tool-label">收藏</span>`，即可保留图标按钮的无障碍名称。

### 侧栏

用原生 `nav`、标题与链接或按钮组成分组。每个可选项使用唯一的非空 `data-value`。组件的 `value` 与当前项的 `aria-current="page"` 同步。监听 `ml-sidebar-change` 取得 `value`、`previousValue` 和 `item`，可用它们切换业务内容。使用 `a href` 时保留原生链接导航。

```html
<link rel="stylesheet" href="./dist/components/sidebar/sidebar.css">
<script defer src="./dist/components/sidebar/sidebar.js"></script>
<div data-ml-sidebar-layout>
  <ml-sidebar value="all" label="记录导航">
    <nav aria-label="素材记录">
      <section><h3>资料库</h3>
        <button type="button" data-value="all"><span class="ml-side-label">全部记录</span></button>
        <button type="button" data-value="pending"><span class="ml-side-label">待复核</span></button>
      </section>
    </nav>
  </ml-sidebar>
</div>
```

默认按最近的 `data-ml-sidebar-layout` 容器宽度适配，未标记容器时按视口适配。宽度 ≤ 560px 时变为折叠导航，选择一项或按 Esc 会收起。宽屏可通过顶部按钮或 `collapsed` 收成窄栏。在文字旁放置 SVG 或 `ml-icon` 就能以图标呈现。也可用 `layout="inline"` 固定侧栏布局，或用 `layout="disclosure"` 固定折叠导航。`--ml-sidebar-width` 控制展开宽度。

### 详情抽屉

`ml-drawer` 保留原生 `dialog`。默认沿阅读方向的末端停靠，视口宽度 ≤ 38rem 时从底部打开。设置 `placement="start|end|bottom"` 可固定位置。正文按内容滚动，标题与底部操作保持可见。宽度分别由 `--ml-drawer-width` 和 `--ml-drawer-sheet-width` 控制。

```html
<link rel="stylesheet" href="./dist/components/drawer/drawer.css">
<script defer src="./dist/components/drawer/drawer.js"></script>
<ml-drawer id="record-detail" placement="auto">
  <button type="button" data-ml-drawer-open>查看详情</button>
  <dialog>
    <header class="ml-drawer-header"><h2>山间湖泊</h2></header>
    <div class="ml-drawer-body">记录 DEMO-101，已完成复核。</div>
    <footer class="ml-drawer-footer">
      <button type="button" data-ml-drawer-close value="done">完成</button>
    </footer>
  </dialog>
</ml-drawer>
```

组件自动补上标题区的关闭按钮。用 Esc、点按遮罩、关闭按钮或原生 `form method="dialog"` 可关闭抽屉，焦点回到打开它的控件。外部记录行可先更新正文，再调用 `drawer.showModal(rowButton)`。可读取 `drawer.open`、`drawer.returnValue`，也可监听 `ml-drawer-open` 和 `ml-drawer-close`。关闭事件提供 `detail.returnValue` 和 `detail.trigger`。需要阻止 Esc 或遮罩关闭时，在原生 `dialog` 的 `cancel` 事件中调用 `preventDefault()`。

## 数据表格

将原生 `table` 放进 `ml-data-table`，每条记录占一行。加上 `selectable` 可跨页勾选，加上 `density="compact"` 可减小行距。窄容器中表格可横向滚动。需要分页时，将 `ml-pagination` 放在表格后面作为同一组件的直接子元素，总条数随数据自动更新。表格的两个文件已包含分页。[预览数据表格](index.html#data-table)

```html
<link rel="stylesheet" href="./dist/components/data-table/data-table.css">
<script defer src="./dist/components/data-table/data-table.js"></script>

<ml-data-table selectable empty-text="暂无选片记录">
  <table>
    <caption>选片记录</caption>
    <thead><tr>
      <th scope="col" data-key="site" data-sort="text">相册</th>
      <th scope="col" data-key="frames" data-sort="number" data-align="end">照片数量</th>
    </tr></thead>
    <tbody>
      <tr data-key="DEMO-101"><th scope="row">山间湖泊</th><td data-align="end">96</td></tr>
      <tr data-key="DEMO-104"><th scope="row">城市夜色</th><td data-align="end">128</td></tr>
      <tr data-key="DEMO-105"><th scope="row">山林晨雾</th><td data-align="end">8</td></tr>
    </tbody>
  </table>
  <ml-pagination page-size="2" page-sizes="2,5,10" label="选片记录分页"></ml-pagination>
</ml-data-table>
```

- 在列标题上设置 `data-sort="text"`、`"number"` 或 `"date"`。点击或用 Enter、空格依次切换升序、降序、原始顺序。每次排序后回到第一页。多个 `tbody` 保留分组，各组内分别排序。
- 带单位的数字可在数据单元格设置 `data-sort-value="98"`，日期可写为 `<time datetime="2030-11-18">11 月 18 日</time>`。空值和无法解析的数值、日期都排在末尾，同值保留原始先后。
- 给列设置 `data-key`，可通过 `sortBy('frames', 'descending')` 排序，或用 `sort-by="frames" sort-direction="descending"` 指定初始顺序。操作表头或调用 `sortBy()` 会发出 `ml-sort-change`，其中 `detail` 包含 `key` 和 `direction`。
- 表头复选框操作当前页。可用 `selectedRows` 读取所有页的勾选行，或监听 `ml-selection-change`，从 `detail.rows` 和 `detail.keys` 读取行和对应的 `tr[data-key]`。用 `data-selected` 标记初始选择。
- 可通过 `table` 访问原生表格，`visibleRows` 返回当前页的记录。插入、移除、修改记录或设置行的 `hidden` 后会自动更新排序和页数。需要在同一段脚本里立即读取更新结果时，可调用 `refresh()`。
- 可将 `ml-empty-state` 作为表格组件的直接子元素，并引入空状态的 CSS 和 JS。无可显示记录时，表格自动展示它。有记录时收起空状态。只需一行提示时，可以继续设置 `empty-text`。

## 通用空状态

将 [empty-state.css](dist/components/empty-state/empty-state.css) 和 [empty-state.js](dist/components/empty-state/empty-state.js) 放在页面旁即可离线使用。图标、标题、说明和操作可分别提供，标题用页面结构中合适的原生标题元素。[预览通用空状态](index.html#empty-state)

```html
<link rel="stylesheet" href="./dist/components/empty-state/empty-state.css">
<script defer src="./dist/components/empty-state/empty-state.js"></script>

<ml-empty-state kind="search" variant="panel">
  <div class="ml-empty-content">
    <span class="ml-empty-icon" aria-hidden="true"></span>
    <div class="ml-empty-copy">
      <h2 class="ml-empty-title">没有匹配的记录</h2>
      <p class="ml-empty-description">可以换一个关键词，或查看全部记录。</p>
    </div>
    <div class="ml-empty-actions">
      <a href="./records.html">查看全部记录</a>
    </div>
  </div>
</ml-empty-state>
```

- `kind="empty|search|error|restricted"` 分别提供无数据、无结果、加载失败和无权限的预设图标与颜色。预设图标来自图标库。可在 `.ml-empty-icon` 中放入 SVG、图片或 `ml-icon`，使用 `ml-icon` 时引入 `icons.js`。省略图标容器即可只显示文字。
- 独立区域可使用 `variant="panel"`，默认透明样式可嵌入表格、列表或卡片。加上 `density="compact"` 后在宽度足够时图标和文字横向排列，空间收窄时自动换成纵向。用 `--ml-empty-color`、`--ml-empty-radius` 和 `--ml-empty-title-size` 调整图标色、面板圆角和标题字号。
- 操作用原生链接或 `<ml-button><button type="button">重试</button></ml-button>`，两个文件已包含按钮组件。业务代码监听按钮的 `click`，可用 `hidden` 在空状态和真实内容之间切换。预览页可试用清除查询与收藏操作。
- 组件继承三种主题及四档材质、动效。高档面板使用实心流体玻璃，高档动效会让面板光照随指针移动。开启系统的「减少动态效果」时，空状态直接出现，玻璃使用固定光源。

## 分页

独立分页适用于文件列表、目录或服务端返回的记录。上一页、下一页和页码均可通过键盘操作。焦点在页码导航内时，左右方向键可翻页，Home / End 可到首页或末页。窄容器自动显示当前页和总页数，也可用 `compact` 固定为精简样式。[预览分页](index.html#pagination)

```html
<link rel="stylesheet" href="./dist/components/pagination/pagination.css">
<script defer src="./dist/components/pagination/pagination.js"></script>
<ml-pagination id="reports-pager" total="238" page="1" page-size="10"
  page-sizes="5,10,20,50" jump label="归档报告分页"></ml-pagination>
```

- `total` 是总条数。`page` 从 1 开始，`page-size` 默认为 10。可选的 `page-sizes` 显示条数选择框，`jump` 显示跳页输入框，`disabled` 可锁定所有操作。
- 通过 `page`、`pageSize`、`total` 属性更新组件。改变每页条数后保留原首条记录所在的页。总数缩小时自动回到有效页，空数据时关闭翻页。
- 用 `state` 读取初始范围，监听 `ml-page-change` 取得更新后的 `detail`，其中包含 `page`、`pageSize`、`pageCount`、`total`、`start`、`end`。起止序号从 1 开始且包含两端，可用 `items.slice(start - 1, end)` 取当前页。空数据时 `page`、`start`、`end` 均为 0。

## 滑块、步进器与日期范围选择器

每种组件可单独引入同名 CSS 和 JS。三者都使用原生输入框，可按字段的 `name` 提交表单，支持表单重置和 `disabled`。在外层设置 `data-ml-theme`、`data-ml-material`、`data-ml-motion` 即可切换外观。高材质提供玻璃表面，高动态下光源跟随指针。系统开启减少动态时，光照固定。

### 滑块

拖动、轻点轨道或用方向键调节数值。原生 `min`、`max` 和 `step` 控制范围和精度，`unit` 指定显示单位。添加 `ticks` 可在不超过 24 个间隔的小范围内显示刻度。[预览滑块](index.html#slider)

```html
<link rel="stylesheet" href="./dist/components/slider/slider.css">
<script defer src="./dist/components/slider/slider.js"></script>
<ml-slider ticks unit="×">
  <label for="speed">回放速度</label>
  <input id="speed" name="speed" type="range" min="0.5" max="2" step="0.25" value="1">
</ml-slider>
```

### 步进器

点击加减、使用输入框的上下方向键，或直接输入数字。加减按钮在相应边界自动停用。`step="any"` 允许自由输入小数，加减按钮每次调整 1。设置输入框 `readonly` 可展示只读值。[预览步进器](index.html#stepper)

```html
<link rel="stylesheet" href="./dist/components/stepper/stepper.css">
<script defer src="./dist/components/stepper/stepper.js"></script>
<ml-stepper unit="秒">
  <label for="interval">播放间隔</label>
  <input id="interval" name="interval" type="number" min="0.25" max="5" step="0.25" value="0.75">
</ml-stepper>
```

### 日期范围选择器

按开始、结束顺序提供两个带标签的原生日期字段。可直接填写，也可打开日历点选两端。第二次点选后，两个日期会按先后写入表单。两次选同一天可选单日。按 Esc、点「取消」或点击日历外部，会撤销本次尚未完成的选择。日历中可用方向键移动、Page Up / Page Down 切换月份、Shift 加翻页键切换年份，按 Enter 或空格选定日期。[预览日期范围选择器](index.html#date-range)

```html
<link rel="stylesheet" href="./dist/components/date-range/date-range.css">
<script defer src="./dist/components/date-range/date-range.js"></script>
<ml-date-range role="group" aria-label="记录日期">
  <label>开始日期<input name="from" type="date" min="2030-11-01" max="2030-12-31"></label>
  <label>结束日期<input name="to" type="date" min="2030-11-01" max="2030-12-31"></label>
</ml-date-range>
```

日期字段各自支持 `min`、`max`、`step` 和 `required`。可留空一端用作开放区间。手动录入的完整区间若起止颠倒，会显示提示并阻止原生表单提交。脚本可调用 `openPicker()`、`closePicker()`，或通过 `value = { start: '2030-11-20', end: '2030-12-03' }` 设置区间。

滑块与步进器的 `value` 属性读写数值，`control` 返回原生输入框。步进器为空时读取数值为 `NaN`。可在任一组件上监听冒泡的 `input` 和 `change` 事件。通过脚本直接设置原生字段的 `value` 后，调用组件的 `refresh()` 同步外观。

## 单日期与时间选择器

两种选择器都保留带标签的原生输入，可以直接填写，也可以打开选择面板。原生字段负责 `name`、`required`、`min`、`max`、`step`、`readonly` 和 `disabled`。[单日期预览](index.html#date-picker) · [时间预览](index.html#time-picker)

```html
<link rel="stylesheet" href="./dist/components/date-picker/date-picker.css">
<script defer src="./dist/components/date-picker/date-picker.js"></script>
<link rel="stylesheet" href="./dist/components/time-picker/time-picker.css">
<script defer src="./dist/components/time-picker/time-picker.js"></script>

<ml-date-picker>
  <label>展映日期<input name="date" type="date" min="2030-11-01" max="2030-11-30" required></label>
</ml-date-picker>
<ml-time-picker>
  <label>场次时间<input name="time" type="time" min="09:00" max="18:00" step="900"></label>
</ml-time-picker>
```

- 单日期面板点选即写入。方向键移动，Home / End 跳到一周首尾，Page Up / Page Down 翻月，加 Shift 翻年。今天符合条件时可直接选择。[W3C 日期选择器键盘参考](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/)
- 时间面板以 24 小时制显示。用 Tab 切换选择列，↑ / ↓ 在列内移动，按 Enter 或点「确定」写入。时间 `step` 以秒为单位，默认 60 秒。步长或起点需要时显示秒列，可直接在原生字段输入更细的精度。`min="22:00"` 与 `max="02:00"` 可设置跨午夜时段。[HTML 时间字段](https://html.spec.whatwg.org/multipage/input.html#time-state-(type=time))
- Esc、「取消」和点外部都会退出选择。可选字段有值时可在面板内清除。脚本可读取 `field` 访问原生字段，读写 `value`（日期为 `YYYY-MM-DD`，时间为 `HH:mm` 或带秒），或调用 `openPicker()`、`closePicker()`。面板写入新值时派发冒泡的 `input` 和 `change`。

## 操作菜单

用文字按钮或「···」图标打开操作菜单。可把相关命令放在同组，用分隔线区分用途。示例中，移除记录位于末尾并使用危险色，移除后可以撤销。[交互预览](index.html#menu) · [应用示例](index.html#menu-examples)

将 [menu.css](dist/components/menu/menu.css) 和 [menu.js](dist/components/menu/menu.js) 放在页面旁即可离线使用。按钮提供可读名称，`ml-menu-panel` 中的 `role="menu"` 容器承载菜单项。选择菜单项后，组件发出冒泡事件 `ml-menu-action`。其中 `detail.action` 对应 `data-action`，`detail.item` 是所选元素，`detail.checked` 是勾选项或单选项的新状态。

```html
<link rel="stylesheet" href="./dist/components/menu/menu.css">
<script defer src="./dist/components/menu/menu.js"></script>

<ml-menu id="record-menu" align="end">
  <button type="button"><span class="ml-menu-label">记录操作</span></button>
  <ml-menu-panel popover="manual">
    <div role="menu" aria-label="记录操作">
      <button type="button" role="menuitem" data-action="details">查看详情</button>
      <button type="button" role="menuitemcheckbox" data-action="pin" aria-checked="false">置顶记录</button>
    </div>
  </ml-menu-panel>
</ml-menu>
<output id="record-feedback"></output>
<script>
  document.getElementById('record-menu').addEventListener('ml-menu-action', event => {
    const { action, checked } = event.detail;
    document.getElementById('record-feedback').value = action === 'details'
      ? '湖泊精选 · 09:42 采集 · 拍摄照片 8 张' : checked ? '记录已置顶' : '已取消置顶';
  });
</script>
```

- `icon-only` 显示三个圆点，`.ml-menu-label` 中的文字继续作为按钮的可读名称。`align="end"` 按阅读方向对齐按钮末端，默认对齐起始端。菜单靠近边缘时会翻转或内移，长菜单可滚动。
- 普通命令使用 `menuitem`，勾选项使用 `menuitemcheckbox`。在 `ml-menu` 上添加 `keep-open` 可连续勾选多项。若干 `menuitemradio` 放在同一 `role="group"` 内会互斥，初始选项标为 `aria-checked="true"`。分隔线使用 `hr role="separator"`，危险项目使用 `data-tone="danger"`。
- Enter、空格或向下键打开菜单，向上键从末项打开。上下键循环移动，Home、End 跳至首末项，输入名称开头可定位。Esc 关闭并返回按钮，Tab 关闭并继续移动焦点。`aria-disabled="true"` 的项目可由方向键朗读，原生 `disabled` 项跳过，两种状态均不会触发命令。[W3C 菜单按钮键盘交互](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/)
- 菜单继承三种主题及四档材质、动效。高材质与高动态组合时，按钮和面板的玻璃高光随指针移动。可覆盖 `--ml-menu-accent`、`--ml-menu-radius`、`--ml-menu-width` 或 `--ml-menu-max-height`。通过 `show()`、`show(true)`、`close(true)` 可从首项或末项打开、关闭并返回按钮，`open` 表示当前开合状态。

## 列表项与分组列表

列表项可以独立显示，也可以按主题组合。整行展示信息、打开链接、执行按钮操作或展开详情。分组共用圆角表面，相邻行用细线分隔。[交互预览](index.html#list) · [应用示例](index.html#list-examples)

在页面引入 [list.css](dist/components/list/list.css) 和 [list.js](dist/components/list/list.js)。用 `ml-list-item` 包住一行。需要分组时，在 `ml-list-group` 内使用 `ul` 或 `ol`，把每一项放在 `li` 中。可选的组标题通过 `aria-labelledby` 为列表命名，组说明放在列表下方。[W3C 列表结构指南](https://www.w3.org/WAI/tutorials/page-structure/content/)

```html
<link rel="stylesheet" href="./dist/components/list/list.css">
<script defer src="./dist/components/list/list.js"></script>

<ml-list-group density="compact">
  <h3 id="visit-title">素材记录</h3>
  <ul role="list" aria-labelledby="visit-title">
    <li><ml-list-item>
      <div class="ml-list-row">
        <span class="ml-list-text"><strong>导入时间</strong></span>
        <time class="ml-list-value" datetime="09:42">09:42</time>
      </div>
    </ml-list-item></li>
    <li><ml-list-item>
      <details>
        <summary class="ml-list-row"><span class="ml-list-text"><strong>拍摄照片</strong></span></summary>
        <p class="ml-list-detail">湖面全景 2 张，岸边细节 6 张。</p>
      </details>
    </ml-list-item></li>
  </ul>
  <p class="ml-list-note">时间均为现场当地时间。</p>
</ml-list-group>
```

- 整行跳转使用 `a.ml-list-row[href]`，整行操作使用 `button.ml-list-row[type="button"]`。行内需要放置复选框或开关时，使用普通 `div.ml-list-row` 承载这些控件。展开行使用原生 `details` 和 `summary`，支持 Enter 和空格。
- 行首图标、标题下的说明和尾部值均可省略。窄容器中，尾部值会移到标题下方；长文本可换行。将 `density="compact"` 设在单项或整组可缩小行距，行高至少为 44px。
- 三种主题和四档材质、动效沿用全库外观设置。高材质与高动态组合时，光源跟随指针，整组共用一个玻璃表面。可覆盖 `--ml-list-accent`、`--ml-list-icon-color`、`--ml-list-radius` 或 `--ml-list-height`。预览的「示例代码」会带上当前外观、密度与展开状态，图标以内联 SVG 一并复制。

## 折叠面板 Accordion

用 `<ml-accordion>` 将详情、常见问题或设置分成若干段。每段使用原生 `<details>`，标题放在 `<summary>` 中，内容放入 `.ml-accordion-panel`。一组面板只需引入下面两个文件。[预览折叠面板](index.html#accordion)

```html
<link rel="stylesheet" href="./dist/components/accordion/accordion.css">
<script defer src="./dist/components/accordion/accordion.js"></script>

<ml-accordion mode="single" role="group" aria-label="照片详情">
  <details open>
    <summary>照片信息</summary>
    <div class="ml-accordion-panel"><p>JPEG · 1672 × 941 像素</p></div>
  </details>
  <details>
    <summary>选片备注</summary>
    <div class="ml-accordion-panel">
      <label>封面建议 <textarea rows="2"></textarea></label>
    </div>
  </details>
</ml-accordion>
```

- `mode="single"` 同一组选项最多展开一项，也可以全部收起。从多项展开切回单项时，保留按页面顺序排在最前的已展开项。省略 `mode` 或使用 `mode="multiple"` 时，各项独立展开。
- 用原生 `open` 属性设定初始展开项，也可读取或设置 `details.open`，监听原生 `toggle` 事件。`name` 分组由组件管理，同一页可以放多组，也可以嵌套。收起会保留面板内的内容和输入。
- Enter 或空格展开、收起标题，Tab 在标题和已展开的内容间移动。↑ / ↓ 移动到相邻标题，Home / End 跳到组内首尾。若收起时焦点还在内容中，焦点回到该项标题。[W3C 折叠面板交互](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)
- 面板继承当前主题、材质与动效。可用 `--ml-accordion-accent`、`--ml-accordion-radius`、`--ml-accordion-padding` 调整强调色、圆角和横向留白。

## 复选框与单选组

复选框可逐项勾选。全选框用居中横线表示部分选中，全选后变为对勾。单选组用圆点标明当前选项。点击标记或整行文字均可选择。预览页的「示例代码」会复制当前选项、禁用状态和外观。[交互预览](index.html#choice) · [应用示例](index.html#choice-examples)

独立页面引入 [choice.css](dist/components/choice/choice.css) 和 [choice.js](dist/components/choice/choice.js)。把原生控件放入 `<ml-choice>` 并用 `<label>` 包裹。组标题使用 `<fieldset>` 和 `<legend>`。[W3C 表单分组指南](https://www.w3.org/WAI/tutorials/forms/grouping/)

```html
<link rel="stylesheet" href="./dist/components/choice/choice.css">
<script defer src="./dist/components/choice/choice.js"></script>

<ml-choice-group layout="inline">
  <fieldset>
    <legend>报告内容</legend>
    <label><ml-choice><input type="checkbox" data-ml-all></ml-choice>全选</label>
    <label><ml-choice><input type="checkbox" name="include" value="summary" checked></ml-choice>相册摘要</label>
    <label><ml-choice><input type="checkbox" name="include" value="photos"></ml-choice>拍摄照片</label>
  </fieldset>
</ml-choice-group>

<ml-choice-group>
  <fieldset>
    <legend>导出格式</legend>
    <label><ml-choice><input type="radio" name="format" value="pdf" checked></ml-choice>PDF 文档</label>
    <label><ml-choice><input type="radio" name="format" value="csv"></ml-choice>CSV 表格</label>
  </fieldset>
</ml-choice-group>
```

- 组默认纵向排列。添加 `layout="inline"` 可让全部选项排在同一行，宽度不足时在组内左右滚动。预览中的「纵向 / 单行」可直接比较两种排法，「示例代码」会带上所选布局。
- 一项独立的复选框只需示例中的一行 `<label>`。需要全选时，在组内一个复选框上添加 `data-ml-all`，省略它的 `name` 即可只提交子项。全选只改动可用的子项，实际改变的子项会发出 `input` 和 `change` 事件。直接用代码设置子项的 `checked` 或 `indeterminate` 后，调用组的 `refresh()` 可同步全选标记。
- 同一单选组的选项共用一个非空 `name`。同一表单中的不同单选组应分别命名。用 Tab 聚焦、空格勾选复选框、方向键切换单选项。可对单项设置 `disabled`，或对 `fieldset` 设置 `disabled` 禁用整组。
- 选项沿用原生表单提交、必选校验和重置。表单中可用 `new FormData(form).getAll('include')` 读取复选值，用 `get('format')` 读取单选值。
- 两种控件都继承三种主题和独立的四档材质、四档动效。材质和动效均为高档时，玻璃边缘随指针移动而受光。可用 `--ml-choice-accent`、`--ml-choice-ink` 和 `--ml-choice-size` 自定义选中色、标记颜色和标记尺寸。

## 输入框

输入框支持单行文本、搜索、密码和多行备注。预览可切换可编辑、只读和禁用状态，应用示例提供编号校验、本地记录筛选及备注还原。独立页面引入 [input.css](dist/components/input/input.css) 和 [input.js](dist/components/input/input.js) 即可。[输入框预览](index.html#input) · [应用示例](index.html#input-examples)

```html
<link rel="stylesheet" href="./dist/components/input/input.css">
<script defer src="./dist/components/input/input.js"></script>

<ml-input clearable count error-message="请填写记录名称。">
  <label for="record-title">记录名称</label>
  <input id="record-title" name="title" type="text" required maxlength="32" placeholder="输入记录名称">
  <span class="ml-input-hint">显示在相册列表和导出文件中。</span>
</ml-input>
```

- 在 `<ml-input>` 中使用原生 `<input>` 或 `<textarea>`，可直接设置 `name`、`autocomplete`、`readonly`、`disabled` 和表单约束。可见标签持续标明用途，辅助说明会与字段关联。
- `clearable` 在有内容时提供清空按钮。搜索框自带搜索图标和清空操作，按 Esc 可清空关键词。密码默认遮挡，眼睛按钮可切换可见性。预览中的「示例代码」会省略已输入的密码。多行备注支持换行和垂直调整高度。
- `count` 显示当前长度，设置 `maxlength` 后也显示上限。计数采用原生长度限制的 UTF-16 口径，部分 emoji 占两个单位。
- 编辑后离开字段、表单校验失败或调用 `validate()` 时显示错误。可以用 `error-message` 提供中文修正提示，业务校验可调用原生 `setCustomValidity()` 后再调用 `validate()`。重置表单可还原初值和计数，清除已展示的错误。[W3C 表单反馈指南](https://www.w3.org/WAI/tutorials/forms/notifications/)
- 通过组件的 `value` 设置内容会同步按钮和计数。直接更新内部原生控件的 `value` 后可调用组件的 `refresh()`。`control` 返回原生控件，`clear()` 清空可编辑字段并触发冒泡的 `input` 事件。普通输入及表单提交、重置沿用原生事件。

输入框继承浅色、暖色和深色主题，材质与动效各有四档。两项都选高档时，指针会照亮输入框的玻璃边缘。可通过 `--ml-input-accent`、`--ml-input-height` 和 `--ml-input-radius` 调整聚焦色、高度和圆角。

## 动态状态岛

紧凑的岛身保留任务名称和当前读数，点按可在原处展开说明、进度或操作。预览里的「简讯」「进度」「明细」可以在展开中直接切换，应用示例也支持逐组复核和切换长短备注。[四向展开预览](index.html#island) · [应用示例](index.html#island-examples)

独立页面引入 [island.css](dist/components/island/island.css) 和 [island.js](dist/components/island/island.js)。在岛内放一个原生按钮和一个带 `.ml-island-panel` 的详情容器。以下示例点击「图像归档」后向右展开。

```html
<link rel="stylesheet" href="./dist/components/island/island.css">
<script defer src="./dist/components/island/island.js"></script>

<ml-island direction="right" tone="mint">
  <button type="button">图像归档 <span class="ml-island-value">68%</span></button>
  <div class="ml-island-panel">
    <strong>正在写入本地归档</strong>
    <p>已保存 17 张，共 25 张。</p>
    <progress aria-label="图像归档进度" value="17" max="25">68%</progress>
  </div>
</ml-island>
```

- **方向与尺寸**　`direction` 接受 `left`、`right`、`up` 和 `down`，默认向下。收起的按钮占据布局位置，岛身围绕实际内容展开。文字、图片、数据或容器宽度变化时会重新计量。给工具栏或卡片加 `data-ml-island-bounds` 可约束展开范围。靠近边缘时文字会换行，横向空间过窄时内容转为上下排列，超高详情可滚动。
- **颜色与外观**　`tone` 内置 `mint`、`blue`、`orange` 和 `indigo`。也可设置 `style="--ml-island-color: #9864ef"`，同时调整岛身、图标和进度的色调。需要指定底色和文字色时，分别设置 `--ml-island-fill` 与 `--ml-island-ink`。预览中的「自选色」使用所选底色，并自动搭配黑字或白字。`--ml-island-max-width` 可调整详情的阅读宽度上限。三种主题均支持四档材质、四档动效，两项都为高档时，岛身的玻璃高光随指针移动。
- **操作**　点击、Enter 或空格切换展开，Esc 收起并将详情内的焦点送回紧凑按钮。通过 `open` 属性、`show()` 和 `hide()` 也可控制状态。`ml-toggle` 事件提供 `detail.open` 和 `detail.direction`。系统启用「减少动态效果」时，尺寸即时切换、光源保持静止。[W3C 展开控件模式](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)

## 轻提示与消息横幅

轻提示用于确认复制、保存等短操作。消息横幅放在受影响的内容旁，适合展示同步中断、待处理事项和重试入口。预览中可切换信息、成功、警告和错误四种状态，或试用复制编号、消息排队与本地重试示例。[消息反馈预览](index.html#feedback) · [应用示例](index.html#feedback-examples)

独立页面引入 [feedback.css](dist/components/feedback/feedback.css) 和 [feedback.js](dist/components/feedback/feedback.js) 即可使用两种组件。颜色、图标和玻璃效果都包含在这两个文件中。和其他组件一样，可在外层设置 `data-ml-theme`、`data-ml-material` 和 `data-ml-motion`。材质和动效均设为 `high` 时，反光随指针移动。

```html
<link rel="stylesheet" href="./dist/components/feedback/feedback.css">
<script defer src="./dist/components/feedback/feedback.js"></script>

<button type="button" id="preview-toast">试播轻提示</button>
<ml-toast id="messages"></ml-toast>
<ml-banner tone="warning" dismissible>
  <div class="ml-banner-content">
    <strong>记录等待同步</strong>
    <p>2 条素材记录已保存在本地。</p>
  </div>
</ml-banner>
<script>
  document.getElementById('preview-toast').addEventListener('click', event => {
    document.getElementById('messages').show('素材记录已保存', {
      tone: 'success', trigger: event.currentTarget
    });
  });
</script>
```

每个 `<ml-toast>` 按调用顺序在页底显示消息，建议一页共用一个。默认每条显示 4 秒。指针悬停、键盘焦点进入提示或页面转到后台时暂停计时。传入 `duration` 可指定毫秒数，`duration: 0` 会保留到手动关闭。`dismiss()` 跳到下一条，`clear()` 清空队列。加 `inline` 可将提示放在文档内。新消息通过状态区域播报，焦点留在触发控件上。提示内按 Esc 或点关闭即可收起。[W3C 状态消息说明](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

`<ml-banner>` 持续显示。可在正文旁加入 `class="ml-banner-action"` 的原生按钮或链接，将其连接到业务操作。`dismissible` 提供关闭按钮，`hidden` 可设置初始隐藏，`show(trigger)` 和 `dismiss()` 控制显隐。两种组件都支持 `info`、`success`、`warning`、`danger`，显示和关闭时会冒泡触发 `ml-toggle`，其中 `detail.open` 表示当前显隐。横幅正文默认使用普通状态播报，紧急内容可在 `.ml-banner-content` 上显式设置 `role="alert"`。

## 进度条

[进度条预览](index.html#progress)可以逐张归档、暂停和继续，也可以从「未知总量」切换到实际计数。[应用示例](index.html#progress-examples)提供相册复核、索引构建和断点续传。独立使用只需 [progress.css](dist/components/progress/progress.css) 和 [progress.js](dist/components/progress/progress.js)。

```html
<link rel="stylesheet" href="./dist/components/progress/progress.css">
<script defer src="./dist/components/progress/progress.js"></script>

<ml-progress id="archive">
  <progress aria-label="风景照片归档" value="16" max="25"></progress>
</ml-progress>
<ml-progress>
  <progress aria-label="读取素材目录"></progress>
</ml-progress>
```

直接更新内部原生 `<progress>` 的 `value` 和 `max` 即可同步轨道、百分比与辅助技术读数。省略 `value` 表示总量未知，显式写 `value="0"` 表示确定的起点。省略 `max` 时原生上限为 1。可使用 `aria-label` 同时提供可见标题和可访问名称，也可通过外部 `<label for="…">` 或 `aria-labelledby` 命名。[HTML progress 元素](https://html.spec.whatwg.org/multipage/form-elements.html#the-progress-element)

```js
const task = document.getElementById('archive');
const bar = task.querySelector('progress');
bar.value = 17;
task.setAttribute('state', 'paused');
task.removeAttribute('state'); // 继续
```

`state="paused"` 或 `state="error"` 显示相应状态文字，保留当前读数并停止等待动画。由业务逻辑控制实际任务的暂停、重试和后续更新。清除状态后，达到上限会自动显示「已完成」。三种主题均可搭配四档材质与四档动效，高动效下轨道按当前材质随指针受光。基础动效和系统减少动态效果使用静止的等待纹理。可通过 `--ml-progress-height` 和 `--ml-progress-accent` 调整轨道高度和进行中的颜色。

确定总量后沿用同一条轨道显示真实进度，保留用户对任务的视觉定位。

## 通用加载状态

引入 [loading.css](dist/components/loading/loading.css) 和 [loading.js](dist/components/loading/loading.js) 即可离线使用加载指示器和骨架屏。预览可切换圆环、三点和三种骨架，并查看占位被内容替换后的布局。[预览通用加载状态](index.html#loading)

```html
<link rel="stylesheet" href="./dist/components/loading/loading.css">
<script defer src="./dist/components/loading/loading.js"></script>

<ml-spinner variant="dots" size="small" label="正在同步目录" show-label></ml-spinner>

<p id="records-status" class="ml-loading-sr" role="status">正在加载素材记录</p>
<section id="records" aria-label="素材记录" aria-busy="true">
  <ml-skeleton id="records-placeholder" preset="table" rows="4" columns="3"></ml-skeleton>
  <div id="records-content" hidden></div>
</section>
```

- `ml-spinner` 默认是圆环，`variant="dots"` 显示三点，`size="small|medium|large"` 控制大小。用 `label` 提供加载文案，`show-label` 让文案可见，`layout="stacked"` 将图标放在文案上方。默认文案由状态区域播报。已有独立播报时，可给指示器加 `aria-hidden="true"`。使用 `--ml-spinner-color` 和 `--ml-spinner-size` 可自定义颜色与尺寸。
- `ml-skeleton` 的 `preset="list|card|table"` 分别对应列表、卡片和表格。列表和表格支持 `rows`（1–20），表格还支持 `columns`（1–12）。行高和卡片媒体区高度可通过 `--ml-skeleton-row-height` 和 `--ml-skeleton-media-height` 对齐真实内容。
- 自定义骨架时省略 `preset`，向 `ml-skeleton` 放入布局和 `class="ml-skeleton-shape"` 的占位形状。默认是线条，`data-shape="circle"` 为圆形，`data-shape="block"` 为矩形。使用 `--ml-skeleton-width`、`--ml-skeleton-height`、`--ml-skeleton-size`、`--ml-skeleton-radius` 和 `--ml-skeleton-color` 调整形状。
- 骨架屏仅提供视觉占位。业务开始请求时将内容区设为 `aria-busy="true"`，完成后填入内容、隐藏骨架并将忙碌状态设为 `false`。在内容区外更新状态文案，读屏软件即可在内容加载期间获取提示。预览中的刷新操作会保留按钮焦点。
- 组件继承三种主题和四档材质、动效。需要面板时可用包内的 `ml-material`，高档面板支持实心流体玻璃，高档动效开启共享指针光源。基础档与系统「减少动态效果」使用静止图形，低档使用明暗淡变，中、高档使用循环动画和骨架扫光。

## 信息组件

[信息组件预览](index.html#info)提供信息胶囊、信息卡片和通用卡片。引入 [info.css](dist/components/info/info.css) 和 [info.js](dist/components/info/info.js) 即可使用全部三种，包中已包含悬停详情。[应用示例](index.html#info-examples)展示了播放参数、归档空间和交接备注。

- **信息胶囊** `<ml-info-pill>` 适合在一行里显示字段名与值。普通文本胶囊可直接阅读。需要详情时，放入 `<ml-hover-card>`、原生按钮和详情面板。鼠标悬停、键盘聚焦和触屏轻点都能展开，按 Esc 或轻点外部可收起。
- **信息卡片** `<ml-info-card>` 适合突出一个指标。用 `.ml-info-value` 显示数值和单位，按需放入有名称的原生 `<progress>` 和 `<dl class="ml-info-facts">` 字段列表。在预览中点「复核下一组」可看到数值、进度和剩余量同步变化。「示例代码」保留当前数值。
- **通用卡片** `<ml-card>` 支持自由组合标题、正文、链接、按钮与页脚。示例使用原生 `<details>` 展开记录，按 Enter 或空格即可操作。

```html
<link rel="stylesheet" href="./dist/components/info/info.css">
<script defer src="./dist/components/info/info.js"></script>

<ml-info-pill tone="neutral">
  <span class="ml-pill-label">成像方式</span><strong>摄影</strong>
</ml-info-pill>

<ml-info-pill>
  <ml-hover-card>
    <button type="button"><span class="ml-pill-label">播放间隔</span><strong>500 ms</strong></button>
    <section class="ml-hover-panel" aria-label="播放间隔详情">
      <p class="ml-hover-text">两次采集之间的时间，本预设为每秒 2 张。</p>
    </section>
  </ml-hover-card>
</ml-info-pill>
```

三种组件均继承所在容器的 `data-ml-theme`、`data-ml-material` 和 `data-ml-motion`。双高档使用跟随指针的玻璃高光，系统开启减少动态效果时使用固定光源。可用 `tone="info|neutral|success|warning|danger"` 选取随主题变化的强调色。内联图标随文字着色。卡片支持 `--ml-card-padding`、`--ml-card-radius`，胶囊支持 `--ml-pill-font`。

## 图标库

[图标目录](index.html#icons-examples) 收录 90 枚 SVG，分为导航与布局、操作与编辑、文件与内容、状态与通知、设备与测量。可按中文、英文名和用途搜索。所选图标提供 16、24、32、48 px 原寸预览和细线、常规、粗线三种线宽。「复制 SVG」和「下载 SVG」输出包含完整路径的矢量图，可直接粘贴到网页或导入设计工具。

设置入口使用齿轮 `settings`，调节参数使用滑杆 `sliders`。记录操作可用 `pin` 置顶、`bookmark` 收藏、`save` 保存。刷新内容使用 `refresh`，恢复默认值使用 `reset`，撤销和重做分别使用 `undo` 和 `redo`。

网页按名称使用图标时只需引入 [icons.js](dist/design/icons.js)。`size` 接受正数像素值，省略时跟随所在位置的字号。`weight` 接受 `light`、`regular`、`bold`，默认 `regular`。图形使用 `currentColor`，在按钮、链接和状态文字中继承其颜色。独立传意的图标通过 `label` 提供可读名称。纯图标按钮在按钮上命名，内部图形省略 `label`。

```html
<script defer src="./dist/design/icons.js"></script>
<ml-icon name="camera" size="32" weight="regular" label="相机"></ml-icon>
<button type="button" aria-label="设置"><ml-icon name="settings" size="24"></ml-icon></button>
```

在页面、局部容器或图标上设置 `data-ml-motion="high"` 即可启用图标动效，靠近图标的设置优先。使用素材库组件样式时，图标也会继承其默认的高动效。鼠标移入、键盘聚焦所在控件或触屏轻点时播放一次。三种主题和四档材质都适用。切到基础、低、中档，或开启系统的「减少动态效果」，图标立即静止。图标目录选中一枚后，可用「重播动效」同时查看放大与原寸效果。

将 `data-ml-material` 设为 `high`，图标的笔画会出现玻璃亮边，文件和图层带半透明面，相机镜片和水滴带聚光，设置齿轮带抛光棱面。材质继承图标的文字颜色和最近的外观设置。基础、低、中材质沿用原始线稿，高动效让迎光处的笔画依次呈现窄亮边、局部柔光和较宽的散射光。高材质在高动效下随光转动高光，在其他动效档位及系统「减少动态效果」下使用固定光源。系统使用强制颜色时显示清晰线稿。

```html
<section data-ml-theme="warm" data-ml-material="high" data-ml-motion="base">
  <ml-icon name="camera" size="32" label="相机" style="color: #336ba0"></ml-icon>
</section>
```

`<ml-icon>` 可以单独移动笔画，例如下载箭头落向托盘、设置齿轮转动、扫描线在框内往返。业务代码可调用图标元素的 `playMotion()` 从头播放一次，高档且允许播放时返回 `true`。复制、下载和 `createSVG()` 得到的都是独立静态 SVG。

「复制 SVG」和「下载 SVG」会带上所选材质。高档导出包含笔画、渐变与固定光照，可独立打开。`customElements.get('ml-icon').createSVG('camera', { material: 'high', theme: 'dark', size: 32 })` 可生成同样的矢量图，省略 `material` 默认输出线稿。「示例代码」同时带上主题、材质和动态档位。

通过 HTTP 提供页面时，也可直接引用 [icons.svg](dist/design/icons.svg) 中的符号。这里的 `i-camera` 对应目录中的英文名 `camera`。

```html
<svg width="24" height="24" viewBox="0 0 24 24" stroke-width="1.75" role="img" aria-label="相机">
  <use href="./dist/design/icons.svg#i-camera"></use>
</svg>
```

页面同时引入 `icons.js` 时，这种 `<use>` 引用在高材质档也会显示透色表面和反光边缘，高动态档以整个图形作为运动单位。

图标以 24 × 24 网格和圆角描边绘制，同组图标采用一致的轮廓与线重。预览中的图标按钮支持三种主题、四档材质和四档动效。材质和动效均为高档时，可移动指针观察玻璃按钮边缘的反光。

将图标放进现有按钮即可使用相同的玻璃表面。例如，已引入 `icons.js`、`button.css` 与 `button.js` 的页面可以这样设置拍照按钮。

```html
<ml-button variant="secondary" icon-only data-ml-theme="dark" data-ml-material="high" data-ml-motion="high">
  <button type="button" aria-label="拍照"><ml-icon name="camera" size="24"></ml-icon></button>
</ml-button>
```

## 色彩库

单独引入 [colors.css](dist/design/colors.css) 即可使用 25 个 sRGB 颜色变量。默认主题为浅色，在页面或局部容器上设置 `data-ml-theme="light"`、`"warm"` 或 `"dark"` 可切换配色。固定色值适合交付给设计工具，业务样式使用变量即可随主题更新。

| 色板 | 变量名，均以 `--ml-color-` 开头 |
| --- | --- |
| 基础色 | `blue`、`indigo`、`purple`、`pink`、`red`、`orange`、`yellow`、`green`、`mint`、`teal`、`cyan`、`brown` |
| 语义色 | `action` 主操作、`info` 提示、`success` 成功、`warning` 警告、`danger` 危险、`neutral` 中性状态 |
| 界面中性色 | `background` 页面、`surface` 面板、`fill` 控件填充、`separator` 分隔线、`text` 正文、`text-secondary` 次要文字、`text-tertiary` 辅助文字 |

```html
<link rel="stylesheet" href="./dist/design/colors.css">
<style>
  .record { background: var(--ml-color-surface); color: var(--ml-color-text); }
  .record-status { color: var(--ml-color-success); }
</style>
<article class="record" data-ml-theme="warm">
  <h2>素材记录</h2>
  <p class="record-status">已完成</p>
</article>
```

12 个基础色随主题取值。主操作色 `--ml-color-action` 在浅色与暖色主题中为 `#0088FF`，在深色主题中为 `#0091FF`。暖色主题使用象牙色背景和面板。

填充和分隔线使用各主题的中性色。信息、成功、警告和危险文字分别使用蓝、绿、橙、红，并按所在表面调整明度。蓝色实心控件使用黑色文字与图标。

预览显示的是黑字或白字与当前纯色样本的对比度，按相对亮度计算，并在取整前按 4.5∶1 选择文字颜色。材质与动态效果可在复制按钮上试用。点击「主题对照」中的任一色值，可直接复制该主题的 HEX。[W3C 文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

## 徽标与指示器

引入 [badge.css](dist/components/badge/badge.css) 和 [badge.js](dist/components/badge/badge.js) 即可使用五类 `<ml-badge>`。两个分发文件已包含文字标签与玻璃效果。

| 类别 | `kind` | 用法 |
| --- | --- | --- |
| 状态指示器 | `indicator` | 用灯形和文字表示 `online`、`busy`、`warning`、`error` 或 `offline`。可用 `label` 自定显示文字。 |
| 数量徽标 | `count` | `value="0"` 会显示 0。`max` 默认 99，超过时显示 99+，辅助技术仍可读取实际数量。 |
| 通知徽标 | `notification` | 传入 `value` 显示未读数，0 时收起。省略 `value` 显示提示圆点。添加 `dot` 可让已知数量也以圆点显示。 |
| 状态标签 | `status` | `tone` 选用 `neutral`、`info`、`success`、`warning` 或 `danger`，配合 `label` 表示业务阶段。 |
| 通用标签 | `tag` | 用 `label` 标注类型、区域等属性，可用 `tone` 调整色调。 |

```html
<link rel="stylesheet" href="./dist/components/badge/badge.css">
<script defer src="./dist/components/badge/badge.js"></script>

<ml-badge kind="indicator" state="online"></ml-badge>
<ml-badge kind="count" value="128" max="99" label="待复核记录"></ml-badge>
<button type="button" class="ml-badge-anchor" id="inbox">
  通知中心<ml-badge kind="notification" value="3"></ml-badge>
</button>
<ml-badge kind="status" tone="warning" label="待复核"></ml-badge>
<ml-badge kind="tag" label="摄影"></ml-badge>

<script>
  const inbox = document.getElementById('inbox');
  inbox.addEventListener('click', () => inbox.querySelector('ml-badge').setAttribute('value', '0'));
</script>
```

可直接更新属性，或在组件加载后设置 `badge.value`、`badge.max`、`badge.dot`、`badge.state`、`badge.label` 和 `badge.tone`。计数使用非负整数，小数向下取整。计数的 `label` 提供朗读上下文。把通知徽标放在 `.ml-badge-anchor` 的直接子级，它会贴在图标的行末上角，并随文字方向换边。图标入口使用原生按钮承接点击和键盘操作。

五类都继承主题、材质和动效。高材质与高动效同时启用时，玻璃高光跟随指针。基础动效即时更新，系统「减少动态效果」会关闭入场动效和同步灯的转动。

## 工具提示 Tooltip

用 `<ml-tooltip>` 包住一个按钮、链接或可聚焦控件，并在 `text` 中写一句补充说明。图标按钮仍需提供能说明操作的名称。[工具提示预览](index.html#tooltip)

```html
<link rel="stylesheet" href="./dist/components/tooltip/tooltip.css">
<script defer src="./dist/components/tooltip/tooltip.js"></script>

<ml-tooltip text="保存 JPEG 原图，保留完整分辨率" placement="bottom">
  <a href="./preview/assets/media/alpine-lake.jpg" download>下载照片</a>
</ml-tooltip>

<ml-tooltip text="原图尺寸为 1672 × 941 像素" toggle-on-click>
  <button type="button">照片信息</button>
</ml-tooltip>
```

鼠标短暂停留或用 Tab 聚焦即可查看，指针可移入提示继续阅读，Esc 可在原处关闭。普通按钮和链接保留单击行为。给专门的帮助按钮加上 `toggle-on-click` 后，轻点可展开，再点一次或点其他位置可收起。工具提示通过 `aria-describedby` 与控件关联，可以和已有的表单说明并用。[W3C 工具提示交互](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)

`placement` 接受 `top`（默认）、`bottom`、`left`、`right`。空间不足时自动换边，滚动和调整大小时会跟随控件。可在运行时更新 `text`，加上 `disabled` 暂停提示，或使用 `show()`、`hide()`、只读的 `open` 和 `ml-toggle` 事件。需要放入链接、按钮或多段详情时，可使用[悬停信息卡片](index.html#hover-card)。

## 悬停信息卡片

引入 [hover-card.css](dist/components/hover-card/hover-card.css) 和 [hover-card.js](dist/components/hover-card/hover-card.js)，将一个原生按钮和对应的信息面板放在同一个 `<ml-hover-card>` 中。面板可包含正文、属性列表、链接或操作按钮。

```html
<link rel="stylesheet" href="./dist/components/hover-card/hover-card.css">
<script defer src="./dist/components/hover-card/hover-card.js"></script>

<ml-hover-card>
  <button type="button">lake-cover.png</button>
  <section class="ml-hover-panel" aria-label="湖面倒影">
    <div class="ml-hover-surface">
      <header class="ml-hover-head"><div><h3>湖面倒影</h3><p>山野 · 湖畔</p></div></header>
      <dl class="ml-hover-facts">
        <div><dt>分辨率</dt><dd>1280 × 720</dd></div>
        <div><dt>格式</dt><dd>PNG · 彩色照片</dd></div>
      </dl>
    </div>
  </section>
</ml-hover-card>
```

鼠标稍作停留或键盘聚焦按钮时打开卡片，指针可移入正文停留、选取文字或使用其中的操作。触屏轻点按钮即可展开或收起。Tab 和 Shift + Tab 可进出卡片中的操作，Esc 或轻点外部可收起卡片。键盘在卡片内按 Esc 后，焦点回到触发按钮。

默认优先向下展开，在 `<ml-hover-card>` 上添加 `placement="above"` 可优先向上。实际方向随可用空间调整。可用 `--ml-hover-width` 和 `--ml-hover-max-height` 调整尺寸，过长的内容可以在卡片内滚动。支持 Popover 的浏览器会将面板放在顶层，较旧浏览器会在按钮下方展开。关闭 JavaScript 时，信息随正文显示。

通过组件的 `show()`、`hide()` 和 `open` 可控制和读取展开状态。`ml-toggle` 事件的 `detail.open` 返回最新状态。组件继承主题、材质和动效。高材质与高动效组合时，卡面高光随整页指针移动。

## 下拉选择框

引入 [select.css](dist/components/select/select.css) 和 [select.js](dist/components/select/select.js)，将一个原生 `<select>` 放在 `<ml-select>` 中。普通单选直接使用 `<option>`，分组使用 `<optgroup label="…">`。添加 `searchable` 后可按选项或组名筛选。

```html
<link rel="stylesheet" href="./dist/components/select/select.css">
<script defer src="./dist/components/select/select.js"></script>

<form class="ml-select-field">
  <label for="sample-album">所属相册</label>
  <ml-select searchable search-label="搜索相册">
    <select id="sample-album" name="area" required>
      <option value="" disabled selected hidden>请选择相册</option>
      <optgroup label="山野">
        <option value="A01">山间湖泊 · A01</option>
        <option value="A02">山林晨雾 · A02</option>
      </optgroup>
      <optgroup label="海岸">
        <option value="B01">海岸峭壁 · B01</option>
        <option value="B02" disabled>备用相册 · B02</option>
      </optgroup>
    </select>
  </ml-select>
  <button type="submit">应用</button>
  <button type="reset">重置</button>
</form>
```

用原生选择框的 `value` 或 `selectedIndex` 读写当前选项，监听 `input` 或 `change` 获取选择结果。`name`、`required`、`disabled`、表单提交和重置按 HTML 表单规则工作。搜索文字只用于筛选，确认一个选项后才会更改表单值。

聚焦后按 ↓、Enter 或空格展开。↑ 和 ↓ 浏览可用选项，Enter 确认，Esc 取消，Tab 离开。普通和分组列表支持 Home、End 以及按名称前缀跳转。菜单会按视口空间向上或向下展开，长列表可滚动。在缺少 Popover 支持的浏览器上，或使用 `multiple`、多行 `size` 时，由浏览器显示原生选项。

主题、材质和动效沿用下方的外观属性。高动效下，选择框与展开菜单按各自的材质响应同一个指针光源。可用 `--ml-select-width`、`--ml-select-height` 和 `--ml-select-max-height` 分别设置字段宽度、字段高度和菜单最大高度。

## 可搜索多选框

引入 [multi-select.css](dist/components/multi-select/multi-select.css) 与 [multi-select.js](dist/components/multi-select/multi-select.js) 即可离线使用。选项由原生 `select[multiple]` 提供，支持分组、预选、禁用、必选校验和表单重置。[预览可搜索多选框](index.html#multi-select)

```html
<link rel="stylesheet" href="./dist/components/multi-select/multi-select.css">
<script defer src="./dist/components/multi-select/multi-select.js"></script>

<form id="report">
  <div class="ml-select-field">
    <label for="report-sites">主题相册</label>
    <ml-multi-select placeholder="选择一个或多个相册">
      <select id="report-sites" name="sites" multiple required>
        <optgroup label="山野">
          <option value="A-01" data-keywords="a01 湖泊" selected>山间湖泊</option>
          <option value="A-02" data-keywords="a02 晨雾">山林晨雾</option>
        </optgroup>
        <optgroup label="海岸"><option value="B-01">海岸峭壁</option></optgroup>
      </select>
    </ml-multi-select>
  </div>
  <button type="submit">提交</button>
</form>
```

- 搜索可以组合名称、分组、值和 `data-keywords`，用空格分隔条件。勾选后可继续筛选或多选。点击已选标签上的移除按钮，或在下拉列表里取消勾选。清空会保留已选中的禁用项。
- 按 Enter、空格或 ↓ 展开并进入搜索框。输入后按 Enter 可切换当前结果，按 ↑ 或 ↓ 进入选项列表。列表中使用方向键或 Home / End 移动，按 Enter 或空格勾选或取消。按 Esc 或点「完成」收起并返回字段。选项区采用可多选列表语义。[W3C Listbox 模式](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)
- 通过 `picker.values` 读写已选值数组。可用 `picker.select` 访问原生控件，直接修改 `option.selected` 后调用 `picker.refresh()` 同步界面。用户增删选项会从原生控件触发 `input` 和 `change`。表单提交可用 `new FormData(form).getAll('sites')` 读取所有可提交值。
- 默认显示前三个已选标签，其余显示为 `+N`。用 `max-tags` 调整显示数量，设为 `0` 时只显示已选数量。使用 `search-label` 自定义搜索提示，可用 `--ml-multi-width`、`--ml-multi-radius` 调整字段尺寸。
- 组件沿用三种主题和四档材质、动效。浮层会根据空间向上或向下打开。浏览器缺少 Popover 支持时会显示原生多选列表。

## 文件选择与拖放上传

引入 [file-upload.css](dist/components/file-upload/file-upload.css) 和 [file-upload.js](dist/components/file-upload/file-upload.js) 后即可离线使用。在 `ml-file-upload` 中放入一个原生文件输入框，使用 `compact` 可切换为紧凑布局。[预览文件选择与拖放上传](index.html#file-upload)

```html
<link rel="stylesheet" href="./dist/components/file-upload/file-upload.css">
<script defer src="./dist/components/file-upload/file-upload.js"></script>

<form method="post" action="/api/attachments" enctype="multipart/form-data">
  <ml-file-upload label="选择报告附件" max-files="4" max-size="10485760">
    <input type="file" name="attachments" accept=".pdf,.csv,image/*" multiple required>
  </ml-file-upload>
  <button type="submit">提交附件</button>
  <button type="reset">重置</button>
</form>
```

- 点击选择和拖放采用同一套校验。原生 `accept` 支持扩展名、MIME 类型和通配类型。`max-size` 按字节限制单个文件，`max-files` 限制多选总数。多选会追加文件，单选会替换当前文件。重复文件按名称、大小、类型和修改时间识别。
- `uploader.files` 返回当前文件数组，`uploader.input` 返回原生文件输入框。`addFiles(files)` 添加文件，`clear()` 清空文件并取消当前上传。表单可以使用 `new FormData(form).getAll('attachments')` 读取选中的文件，支持原生 `required` 和重置。[HTML 文件输入规范](https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file))
- 设置 `uploader.upload = async (file, { signal, onProgress }) => { … }` 后会显示上传按钮。回调成功返回时标记已上传，抛出错误时提供重试。传给请求的 `signal` 用于取消，`onProgress(loaded, total)` 更新已传输量。也可以调用 `uploader.start()` 上传待处理文件。
- 监听 `ml-files-change` 取得当前文件，监听 `ml-upload-state` 取得单个文件的 `file`、`state` 和 `progress`。组件沿用主题、材质和动效设置，预览中的进度由本地计时模拟。

## 通用表单

引入 [form.css](dist/components/form/form.css) 和 [form.js](dist/components/form/form.js) 后即可离线使用。每个 `ml-form` 包含一个直接子级原生 `form`，可以组合原生控件和素材库的输入控件。使用素材库控件时，需一并引入对应组件的文件。[预览通用表单](index.html#form)

```html
<link rel="stylesheet" href="./dist/components/form/form.css">
<script defer src="./dist/components/form/form.js"></script>

<ml-form layout="columns">
  <form aria-label="素材记录" method="post" action="/records">
    <fieldset class="ml-form-section">
      <legend>素材记录</legend>
      <div class="ml-form-grid">
        <div class="ml-form-field">
          <label class="ml-form-label" for="record-name">记录名称<span class="ml-form-required" aria-hidden="true">*</span></label>
          <input id="record-name" name="name" required maxlength="40">
        </div>
        <div class="ml-form-field">
          <label class="ml-form-label" for="record-frames">照片数量<span class="ml-form-required" aria-hidden="true">*</span></label>
          <input id="record-frames" name="frames" type="number" min="1" max="240" required>
          <p class="ml-form-hint">填入 1 到 240 之间的整数。</p>
        </div>
        <div class="ml-form-field" data-span="full">
          <label class="ml-form-label" for="record-notes">备注</label>
          <textarea id="record-notes" name="notes" rows="2"></textarea>
        </div>
      </div>
    </fieldset>
    <div class="ml-form-actions">
      <ml-button><button type="submit">提交</button></ml-button>
      <ml-button variant="quiet"><button type="reset">重置</button></ml-button>
    </div>
  </form>
</ml-form>
```

- `layout="stacked"` 为默认单列，`columns` 为双列，`horizontal` 将字段标签放在控件左侧。可用 `data-span="full"` 让字段跨列。容器内容宽度低于 `28rem` 时自动使用单列。
- 字段用原生 `required`、`type`、`min`、`max`、`pattern` 等声明校验规则。在 `.ml-form-field` 内显示字段错误，搭配 `.ml-form-hint` 可提供持续可读的填写说明。默认离开字段后校验，加 `validate-on="submit"` 则在触发原生校验后才显示提示。提交校验失败时会生成可用键盘操作的错误汇总。重置表单会清空提示。[W3C 表单反馈指南](https://www.w3.org/WAI/tutorials/forms/notifications/)
- 在字段或字段容器上用 `data-error-message` 定制静态错误文案。应用可调用原生 `field.setCustomValidity(message)` 设置跨字段或业务错误，并用空字符串撤销。编程修改值或自定义有效性后可调用 `wrapper.refresh()` 同步当前提示。主动校验并定位到首个错误时使用 `wrapper.reportValidity()`，其返回值为布尔值。
- 用原生 `submit` 事件接入业务，用 `new FormData(wrapper.form)` 读取提交值。组件沿用三套主题及四档材质、动效，尊重系统减少动态效果设置。

## 标签

引入 [tag.css](dist/components/tag/tag.css) 和 [tag.js](dist/components/tag/tag.js) 即可使用 `<ml-tag>`。把多个标签放在 `.ml-tag-group` 中，它们会按照可用宽度换行。

```html
<link rel="stylesheet" href="./dist/components/tag/tag.css">
<script defer src="./dist/components/tag/tag.js"></script>

<div class="ml-tag-group" role="group" aria-label="样本标签" tabindex="-1"
     data-ml-theme="light" data-ml-material="high" data-ml-motion="high">
  <ml-tag label="待复核" tone="warning"></ml-tag>
  <ml-tag kind="filter" label="摄影" value="photo" selected></ml-tag>
  <ml-tag kind="removable" label="山野" value="mountains"></ml-tag>
</div>
```

| 用途 | 操作 |
| --- | --- |
| 状态（默认） | 用 `label` 显示文字。五种 `tone` 为 `neutral`、`info`、`warning`、`success`、`danger`，分别带有不同图标。 |
| 筛选（`filter`） | 点击标签、按 Enter 或空格切换选中。可多选。用户操作后触发冒泡的 `ml-change`，通过 `event.detail.value` 和 `event.detail.selected` 读取筛选条件。 |
| 可移除（`removable`） | 点击末端叉号，或聚焦叉号后按 Enter、空格、Delete 或 Backspace。移除前触发可取消、可冒泡的 `ml-remove`，其中含有 `value` 和 `label`。调用 `event.preventDefault()` 可由业务页面接管移除。 |

`label` 是显示文字，`value` 是业务标识，省略时取 `label`。用 `tag.selected` 可同步筛选状态，只有用户操作才触发 `ml-change`。添加 `disabled` 可停用交互，用 `remove-label` 可自定义叉号的朗读名称。焦点所在的标签移除后，组内焦点移到下一项或上一项。给组设置 `tabindex="-1"` 可在删去最后一项时接住焦点。预览会把焦点交给「撤销移除」，撤销会恢复标签的原始位置。

`--ml-tag-height`、`--ml-tag-font`、`--ml-tag-pad` 和 `--ml-tag-radius` 分别控制高度、字号、横向内边距和圆角。触屏上的筛选、移除按钮保留至少 44 像素的操作区域。高动效下，标签随当前材质响应整页指针光源。系统启用「减少动态效果」时，光源固定，标签即时显示。

## 弹窗

预览页提供信息提示、操作确认和表单编辑。左侧画布可随时调整外观，「打开模态弹窗」会将同一内容置于页面中央。实际使用只需引入 [dialog.css](dist/components/dialog/dialog.css) 和 [dialog.js](dist/components/dialog/dialog.js)，其中已包含操作按钮。

```html
<link rel="stylesheet" href="./dist/components/dialog/dialog.css">
<script defer src="./dist/components/dialog/dialog.js"></script>

<button type="button" id="edit-name" aria-haspopup="dialog">编辑名称</button>
<ml-dialog id="editor" data-ml-theme="warm" data-ml-material="high" data-ml-motion="high">
  <dialog aria-labelledby="editor-title">
    <form method="dialog" class="ml-dialog-panel">
      <header class="ml-dialog-head"><h2 class="ml-dialog-title" id="editor-title">编辑名称</h2></header>
      <div class="ml-dialog-body">
        <label class="ml-dialog-field">名称 <input name="name" required autofocus></label>
      </div>
      <footer class="ml-dialog-actions">
        <ml-button variant="secondary"><button type="button" data-ml-dialog-close value="cancel">取消</button></ml-button>
        <ml-button><button type="submit" value="save">保存</button></ml-button>
      </footer>
    </form>
  </dialog>
</ml-dialog>
<output id="saved-name"></output>

<script>
  const editor = document.querySelector('#editor');
  const field = editor.querySelector('input');
  document.querySelector('#edit-name').addEventListener('click', event => {
    field.value = field.defaultValue;
    editor.showModal(event.currentTarget);
  });
  editor.querySelector('dialog').addEventListener('close', event => {
    if (event.target.returnValue === 'save') {
      field.defaultValue = field.value;
      document.querySelector('#saved-name').textContent = field.value;
    }
  });
</script>
```

每个弹窗直接包含一个原生 `<dialog>`。给标题分配唯一的 ID 并用 `aria-labelledby` 关联。用 `autofocus` 指定初始焦点，示例在确认时聚焦「取消」，编辑时聚焦输入框。按 Esc 关闭后，焦点回到打开弹窗的按钮。给 `<ml-dialog>` 添加 `dismiss-on-backdrop` 即可启用点遮罩关闭，预览中仅信息提示启用此项。

`method="dialog"` 的表单通过浏览器校验后关闭，提交按钮的 `value` 成为原生 `close` 事件中可读取的 `returnValue`。`data-ml-dialog-close` 按钮允许随时取消编辑。业务逻辑也可调用 `editor.close(value)`。长内容放进 `.ml-dialog-body`，窄屏或矮屏上可以滚动正文，并保留标题和操作按钮。用 `--ml-dialog-width` 和 `--ml-dialog-radius` 可分别调整宽度和圆角。

弹窗的四档入场效果依次为即时出现、淡入、轻微上移和弹性浮入。开启高动效后，鼠标会按所选材质照亮窗沿与操作按钮。支持原生顶层退出过渡的浏览器在关闭时淡出，其他浏览器即时收起。「减少动态效果」会关闭弹窗过渡并固定光源。

## 按钮

将 [button.css](dist/components/button/button.css) 和 [button.js](dist/components/button/button.js) 放在业务页面旁。每个 `<ml-button>` 内放一个原生 `<button>`，将文字、图标、`type`、`name`、`value` 和事件直接写在这个按钮上。表单校验、提交、重置、键盘焦点与点击都由浏览器处理。

```html
<link rel="stylesheet" href="./dist/components/button/button.css">
<script defer src="./dist/components/button/button.js"></script>

<form data-ml-theme="light" data-ml-material="high" data-ml-motion="high">
  <label>样本名称 <input name="sampleName" required></label>
  <ml-button variant="primary"><button type="submit">保存</button></ml-button>
  <ml-button variant="secondary"><button type="reset">重置</button></ml-button>
</form>
```

| 外观 | 用法 |
| --- | --- |
| `primary`（默认） | 蓝色主操作，如「保存」 |
| `secondary` | 中性表面，如「重置」 |
| `quiet` | 轻量操作，如「查看详情」 |
| `danger` | 红色危险操作，如「清空」 |

图标可直接使用内联 SVG。纯图标按钮在 `<ml-button>` 上添加 `icon-only`，并给内部按钮填写 `aria-label`。普通操作显式使用 `type="button"`。可通过 `--ml-button-height`、`--ml-button-font`、`--ml-button-pad` 和 `--ml-button-radius` 调整尺寸。

停用按钮使用原生 `disabled`。异步任务开始时给按钮同时设置 `disabled` 与 `aria-busy="true"`，例如 `<button type="button" disabled aria-busy="true">保存中</button>`。前者阻止重复激活，后者显示进度环。任务结束后移除忙碌标记，按业务状态恢复可用性。基础动效和系统「减少动态效果」均使用静止进度环。

## 切换组件

将 [switch.css](dist/components/switch/switch.css) 和 [switch.js](dist/components/switch/switch.js) 放在业务页面旁，在 HTML 中引入即可使用 `<ml-switch>`。组件使用原生浏览器接口，可独立于预览页和前端框架运行。

```html
<link rel="stylesheet" href="./dist/components/switch/switch.css">
<script defer src="./dist/components/switch/switch.js"></script>

<section data-ml-theme="light" data-ml-material="high" data-ml-motion="medium">
  <ml-switch id="hints" label="快捷键提示" checked></ml-switch>

  <ml-switch kind="mode" label="预览尺寸" value="detail">
    <button type="button" value="actual">原寸</button>
    <button type="button" value="detail">放大</button>
  </ml-switch>

  <ml-switch kind="page" label="工作区页面" value="overview">
    <a href="./overview.html" data-value="overview">概览</a>
    <a href="./records.html" data-value="records">记录</a>
  </ml-switch>
</section>
```

把链接地址换成业务页面或已有路由。导航保留浏览器的打开新标签页、前进和后退行为。与当前完整网址匹配的链接自动标记为当前页。使用自定义路由的应用也可在路由变化时赋值 `control.value`。

开关通过 `checked` 读写布尔状态，模式和页面通过 `value` 读写选中值。用户更改选项会触发可冒泡的 `ml-change`。用代码同步状态时不会重复触发该事件。

```js
const hints = document.querySelector('#hints');
hints.addEventListener('ml-change', event => {
  document.documentElement.classList.toggle('show-shortcuts', event.detail.checked);
});
```

| 用途 | 键盘操作 | 事件值 |
| --- | --- | --- |
| 开关 | Tab 聚焦，Space 或 Enter 切换 | `kind: "toggle"`，`checked` 为布尔值，`value` 为 `on` 或 `off` |
| 模式 | Tab 进入当前选项，方向键选择，Home / End 跳到首尾 | `kind: "mode"`，`value` 来自按钮的 `value` |
| 页面 | Tab 或 Shift + Tab 选择链接，Enter 打开 | `kind: "page"`，`value` 来自链接的 `data-value`，省略时取 `href` |

用 `label` 指明开关影响的设置或选项组的用途。给 `<ml-switch>` 添加 `disabled` 可停用交互，模式中的单个按钮也可使用原生 `disabled`。

## 外观

### 设计资源

组件目录现有七项设计资源，分别是[色彩](index.html#colors)、[图标](index.html#icons)、[材质](index.html#materials)、[动效](index.html#motion)、[字体与排版](index.html#typography)、[设计令牌](index.html#tokens)和[主题](index.html#themes)。排版、令牌与主题可直接引入 `dist/design/` 下对应的 CSS。

预览页已引入 [global.css](dist/design/global.css)。业务页面也可在 `<head>` 中引入一次，使页面背景、正文、标题、表单和键盘焦点直接使用同一套令牌。在 `<html>` 上设置 `data-ml-theme`、`data-ml-material`、`data-ml-motion` 即可配置整页。交互组件继续按需引入同名 CSS 和 JS，使用 `<ml-icon>` 时引入 `icons.js`。

单独接入组件时，其 CSS 已包含主题、令牌和排版规则，只为组件及显式标注的文字设置样式。在根或局部容器上覆盖 `--ml-size-label` 可以统一调整标签字号。在单个按钮上设置 `--ml-button-font` 可以单独调整该按钮。

| 资源 | 入口文件 | 用法 |
| --- | --- | --- |
| 字体与排版 | [typography.css](dist/design/typography.css) | 用 `data-ml-type` 给语义化 HTML 指定视觉层级。预览支持试排自己的中英文、数字和编号。 |
| 设计令牌 | [tokens.css](dist/design/tokens.css) | 用 `var(--ml-…)` 引用间距、圆角与描边、阴影、排版、颜色、材质和动效。可按名称、变量名或 CSS 属性筛选并复制。 |
| 主题 | [themes.css](dist/design/themes.css) | 在页面或局部容器上设置 `data-ml-theme="light|warm|dark"`，再用 `data-ml-theme-surface` 给容器应用画布色和文字色。 |

八种排版样式为 `display` 展示标题、`title` 页面标题、`heading` 小节标题、`body` 正文、`label` 字段标签、`caption` 辅助说明、`metric` 数据读数和 `code` 代码与编号。标题与数据读数随视口调整，字号使用相对单位。字体从本机无衬线、衬线和等宽字族中选取，包含中文回退。可在文字或祖先上设置 `data-ml-font="sans|serif|mono"`。正文容器可加 `data-ml-prose` 约束行宽及段间距。

```html
<link rel="stylesheet" href="./dist/design/global.css">
<style>
  .report { padding: var(--ml-space-4); border-radius: var(--ml-radius-lg); box-shadow: var(--ml-shadow-raised); }
</style>
<main data-ml-theme="light" data-ml-theme-surface>
  <h1 data-ml-type="title">相册工作台</h1>
  <article class="report" data-ml-theme="dark" data-ml-theme-surface data-ml-prose>
    <h2 data-ml-type="heading">山间湖泊选集</h2>
    <p data-ml-type="body">当前大小为 <span data-ml-type="metric">128.64</span> MB。</p>
  </article>
</main>
```

最近一层主题决定该区域的语义色、阴影及原生控件配色。材质和动效仍各自继承 `data-ml-material`、`data-ml-motion`。主题预览的「整页主题」同步外观设置，「局部容器」只切换示例卡。令牌目录从当前 CSS 读取取值，例如切换主题会更新 `--ml-color-surface`，开启系统「减少动态效果」会把 `--ml-travel` 降为零。

通用字号与字族在 `src/type-tokens.css` 定义，间距和形状在 `src/layout-tokens.css` 定义，主题复用 `colors.css` 的色板。基础资源与独立组件由同一构建脚本读取这些定义，业务项目可在自己的样式中按作用域覆盖所用变量。

### 材质库

「组件目录 → 设计资源 → 材质库」可以在三种主题里放大当前表面。下方四个样本使用相同的色带和尺寸，并继承当前动效。把动效设为「高」后，在四个样本间移动鼠标即可比较它们对同一光源的响应。点选样本可放大查看，按压样本表面会看到液面回弹。材质为「高」时，「外观设置」会出现「玻璃浓度」滑块，在清透与浓重染色之间连续调节。展开「实心玻璃的前后对照」可播放或暂停两版样本在同一条鼠标轨迹下的实录。[打开材质库](index.html#materials)

| 档位 | 表面 | 静态外观 | 高动效下的鼠标光源 |
| --- | --- | --- | --- |
| 基础 `base` | 实色 | 纯色覆盖底纹 | 迎光侧的一小段轮廓提亮，中央保持纯色 |
| 低 `low` | 柔光 | 不透明表面，顶缘提亮并带浅阴影 | 表面出现局部柔光，边缘向四周淡出 |
| 中 `medium` | 磨砂 | 半透明表面模糊背后的色带 | 较宽的光晕漫射，迎光边微亮，软阴影偏向背光侧 |
| 高 `high` | 实心流体玻璃 | 凸面均匀放大底纹并呈现内部着色，厚处色深，轮廓内侧有深色厚度层次 | 迎光弧面晶莹反光，对侧聚焦出光斑，边缘泛出光谱色散，投影随光源移动 |

引入 `materials.css` 和 `materials.js` 即可使用独立表面，支持离线打开。主题、材质和动效可以分别写在表面或祖先上。`--ml-material-radius` 和 `--ml-material-padding` 可调整圆角和内边距，`--ml-glass-density` 可连续调整高档玻璃的染色浓度。

```html
<link rel="stylesheet" href="./dist/design/materials.css">
<script defer src="./dist/design/materials.js"></script>
<ml-material data-ml-theme="warm" data-ml-material="high" data-ml-motion="base">
  相册概览
</ml-material>
```

高档按需共用一个 WebGL 程序。着色器按红、绿、蓝三种波长分别计算光线穿过凸形前表面和后表面时的折射，色带白线的边缘因此泛出光谱色散；位移在轮廓附近平滑收束，透镜放大均匀而不突兀。再按每种颜色在玻璃内的光程计算透射率，玻璃厚处呈深色，轮廓内侧带深色厚度层次，镜面高光集中而晶莹。透过玻璃的底纹做小孔径柔化，复杂背景上的文字与图标更易辨认。浅色、暖色和深色主题各有玻璃体色，`--ml-glass-density` 在 0.4–2 之间连续调节染色浓度（默认 1，越小越清透）。按压高档表面会触发液面回弹，波纹从触点扩散，表面高度随之起伏。对于页面中已有的 HTML 背景，玻璃叠加 Shader 光照，并使用浏览器支持的背景滤镜。需要逐像素折射自己的底图时，将实际显示在表面后方、与视口坐标轴对齐的同源 Canvas 赋给 `surface.backdrop`。更新画布内容后调用 `surface.refreshBackdrop()`，传入 `null` 可移除底图。材质库中的色带使用此接口。WebGL 不可用或上下文丢失时，表面自动采用同一凸面计算的 SVG 位移图及兼容光照，恢复后重新启用 Shader。

高动效让同页表面共用一个指针光源。光源随距离衰减，触屏按下时跟随触点，松手后恢复静态外观。浅色与深色使用冷调光，暖色使用暖光。基础、低、中材质用 CSS 绘制受光效果。切到其余动效档位或开启系统「减少动态效果」时，各档恢复静态外观，高档玻璃使用固定光位。系统高对比度使用系统表面色和边框。四档共享样式位于 `src/material-tiers.css`，档位名称与说明可从 `customElements.get('ml-material').levels` 读取。

### 动效库

在「组件目录 → 设计资源 → 动效库」选择位置切换、按压反馈或出入场，点「同步演示」可同时观看四档。下方样本固定使用基础材质，点选档位即可在上方用当前主题和材质试用。时长标记对应下一次操作。[打开动效库](index.html#motion)

| 动效 | 位置切换与按压 | 入场 / 退场 | 交互表现 |
| --- | --- | --- | --- |
| 基础 `base` | 0 ms | 0 / 0 ms | 立即切换到目标状态 |
| 低 `low` | 115 ms | 115 / 95 ms | 位置和尺寸直接到位，仅改变明暗或透明度 |
| 中 `medium` | 220 ms | 185 / 135 ms | 位移和缩放沿一个方向减速，到位即停 |
| 高 `high` | 530 ms | 370 / 150 ms | 移动和入场带回弹，按压后弹性恢复，退场快速收束 |

以上时长适用于动效库的三个动作。现有组件共用四档规则，菜单、横幅、弹窗等保留各自的交互节奏。通用时间、曲线及组件分档参数在 `src/motion-tiers.css` 维护，图标的专属关键帧在 `src/icon-motion.js`。高动效同时开启弹性反馈和共享指针光源，受光表现由材质档位决定。系统开启「减少动态效果」会立即结束正在播放的动作，同时保留已选择的业务状态。

引入 `motion.css`、`motion.js` 即可离线使用。两份文件包含 `ml-material` 表面，也可以直接把普通 HTML 元素传给 `MaterialMotion`。预览页的「示例代码」会复制当前动作、状态和外观的完整示例。

```html
<link rel="stylesheet" href="./dist/design/motion.css">
<script defer src="./dist/design/motion.js"></script>
<div data-ml-motion="medium">
  <button id="show-details" type="button" aria-controls="details" aria-expanded="false">显示详情</button>
  <section id="details" hidden>记录已保存。</section>
</div>
<script>
  const trigger = document.getElementById('show-details');
  const details = document.getElementById('details');
  trigger.addEventListener('click', () => {
    const open = trigger.getAttribute('aria-expanded') !== 'true';
    MaterialMotion.reveal(details, open, trigger);
    trigger.textContent = open ? '收起详情' : '显示详情';
  });
</script>
```

- `move(element, changeLayout)` 同步执行一次布局修改，然后从元素当前可见的位置移动到新位置。适用于两个布局位置间的切换，元素位于坐标轴对齐的容器内。
- `press(element)` 播放一次按压和恢复。可从原生按钮的 `click` 事件调用，鼠标、触屏和键盘共用同一操作。
- `reveal(element, visible, trigger?)` 管理显示、隐藏和退场期间的焦点。传入触发按钮可同步 `aria-expanded`，收起时将内容区内的焦点送回按钮。快速反向操作以最后一次决定为准。
- `timing(element, action)` 返回生效档位、毫秒时长和缓动曲线，动作可选 `move`、`press`、`enter`、`exit`。`finish(element)` 可立即结束当前动作。`levels` 提供四档名称和说明。

在已安装 Playwright 与 Chromium 的前端工作区运行 `node tests/motion.mjs`，可核对四档位移、出入场反向切换和系统减少动态时的收尾。

### 共享外观设置

三个属性可以写在组件或任意祖先元素上，方便设置全站默认值及局部覆盖。首次预览默认使用浅色、高材质和高动效。预览页记住最近的选择，「重置外观」可以恢复默认。

| 属性 | 可选值 |
| --- | --- |
| `data-ml-theme` | `light` 浅色、`warm` 暖色、`dark` 深色 |
| `data-ml-material` | `base` 基础实色、`low` 柔光、`medium` 磨砂半透、`high` 流体玻璃 |
| `data-ml-motion` | `base` 即时反馈、`low` 短暂淡变、`medium` 平滑滑动或按压、`high` 弹性回弹 |

画布随主题使用雾灰、暖象牙、石墨三种纯色。主按钮、主题选项和键盘焦点使用当前主题的主题蓝。开关开启时使用主题绿，同时用滑块位置与通断符号表示状态。

开关的轨道与滑块各自拥有弧形玻璃表面，共用页面上的光源。纯色画布上可通过亮边和投影观察光照方向。高动效让滑块前缘先行，后缘追上后回弹。

开启高动效后，鼠标位置就是整页控件共用的光源。依次选择四档材质，在控件两侧移动鼠标，可以看到轮廓微光、局部柔光、磨砂散射或玻璃聚光换边。高材质还支持按压涟漪，从触点或键盘选项中心扩散。触屏按住时由触点照明，松手后恢复静态外观。

基础材质使用实色表面。基础动效即时切换。系统开启「减少动态效果」时，滑块即时就位，高光固定。

可用 `--ml-switch-height` 调整开关轨道高度，用 `--ml-option-height`、`--ml-option-font`、`--ml-option-pad` 调整分段控件。默认开关和分段选项的点击高度至少为 44 CSS 像素。

## 维护

新增预览入口时，在 `index.html` 的组件目录中将链接放入对应分类。`href` 指向组件的预览片段，链接文字、`data-en`、`data-keywords` 和 `data-lead` 分别提供中文名、英文名、搜索别名和简介。

每对组件文件独立包含主题和玻璃效果，同页加载多个组件时共用一个指针光源。修改 `src/` 下的源码后，在根目录运行 `npm run build` 更新 `dist/` 中的可分发文件。

图标的路径、名称、分类、搜索词及玻璃着色区域统一维护在 `src/icons.svg`。运动部位、关键帧与时长在 `src/icon-motion.js`，表面着色、光照与静态导出在 `src/icon-material.js`。构建会同步 `dist/design/` 中的图标文件和预览页内嵌的图形。

## 设计参考

通知角标准确反映未读量，状态灯同时提供形状和文字线索。[W3C 颜色的使用](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)

悬停信息卡片参考贴近触发位置的浮层设计，支持将指针移入内容阅读、键盘访问与主动关闭。[W3C 悬停或聚焦时出现的内容](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)

下拉选择框使用勾选标记显示当前值，键盘可先浏览再确认。[W3C 单选组合框示例](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/)

筛选标签通过原生按钮的按下状态表达多选。[W3C 按钮模式](https://www.w3.org/WAI/ARIA/apg/patterns/button/)

配色按主题调整明度。玻璃边缘保留高光，弹窗正文下方使用更实的表面。
