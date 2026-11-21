# dsh-model-picker

[English](README.md) | 中文

一个可折叠、可搜索的**模型选择器**，为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面而做。

![输入框里的模型选择器：提供商可折叠分组、搜索结果与推理强度切换](docs/preview.svg)

当一个配置里有十几个提供商、上百个模型时，内置模型菜单会把所有行平铺出来——翻找某个模型就成了切换模型里最慢的一步。这个插件给菜单加了一个浏览器：模型按提供商分组，每个提供商可以折叠，一个搜索框同时匹配模型名、模型 id 和提供商名。

## 功能

- **按提供商分组**——每个提供商是一个可折叠的分组，并显示模型数量。
- **从当前位置展开**——当前模型所在的提供商会默认展开。
- **搜索**——匹配模型名、模型 id 和提供商名。多个词是「同时满足」（`gpt 4.1 mini`），整串命中永远优先于逐词命中，单个字符不会匹配一切。
- **推理强度**——可在面板底部切换当前模型的推理强度。
- **键盘**——`↑` `↓` 移动高亮，`Enter` 选中，`Esc` 关闭，`Tab` 不会跑出面板。尊重输入法组合状态，不会抢走拼音候选词的方向键。
- **唯一数据源**——所有读写都走内置的 `modelDirectories` 服务，因此本面板、`/model` 弹窗和输入框的模型名永远一致。
- **不替换内置菜单**——它是扩展。其他插件照常工作，包括它们为每个模型挂的标签。

## 安装

### 从本地检出安装

```sh
git clone https://github.com/CamouflageGe/dsh-model-picker.git
```

然后在 DSH Web 界面打开 **插件 → 添加插件**，指向克隆下来的目录即可。

### 它向配置里加了什么

`cordis.patch.yml` 插入一行：

```yaml
- insert:
    - id: dsh-model-picker
      name: 'dsh-model-picker'
```

## 使用方法

1. 在输入框点模型按钮，打开模型菜单。
2. 选第一行「全部模型（按提供商折叠）」。
3. 折叠不需要的提供商，或直接输入搜索。
4. 选中模型——面板关闭，会话立即切换。

## 为什么是扩展而不是替换内置菜单

内置模型控件是一个 `single` 插槽，它**声明**了两个子插槽
（`conversation.input.model.label` 和 `conversation.input.model.options`）。
Harness 的插槽注册表规定每个 key 只能有一个声明者：

- 第二个去声明的注册会抛 `already declared`；
- 完全不声明的注册拿不到 `renderSlot`，无法渲染别人的贡献。

所以一个顶替模型控件的插件**无法**重新挂载其他插件的贡献——Agent 团队开关、
提供商徽章、价格提示都会消失。因此本插件改为贡献两处：

| 插槽 | id | order | 用途 |
|---|---|---|---|
| `conversation.input.model.options` | `model-picker` | `-10` | 内置菜单里的入口行 |
| `conversation.input.overlay` | `model-picker` | `90` | 选择面板（portal 到 `document.body`） |

### 提供商标签依然生效

每个模型的徽章由其他插件注册进子插槽 `conversation.input.model.label`。
只有该插槽的声明者能渲染它，所以替换式插件会丢掉全部徽章。本插件从公开注册表
里取出当前获胜的注册，并用内置控件**完全相同的 owner props** 渲染该组件：

```js
{ provider, model, placement: 'option' | 'menu' | 'trigger', selected }
```

某个提供商组件报错时会被 error boundary 兜住，退化成纯模型名，单个坏插件不会让整个面板空白。

## 环境要求

- 带 Web 界面的 DeepSeek Harness（`@deepseek-ai/dsh-client-ui-model-selection`
  必须处于激活状态，它属于标准 Web 组合）。
- 没有配置项。

## 开发

客户端半边是单个纯 JavaScript bundle（`client.js`），按网关的动态模块格式编写：
无构建步骤、无 JSX、React 来自共享模块表。

```js
window.__ModuleLoader__.load({ id: 'dsh-model-picker', factory(require) { /* … */ } })
```

修改 `client.js` 后，在**插件**页把它关掉再打开，浏览器才会加载新的 bundle 代。

## 已知限制

- 视觉验证需要用户自行确认；本仓库不附带自动化浏览器测试。
- 面板是模态对话框：会锁住 `Tab`，`Esc` 关闭。
- 搜索是子串/子序列匹配，不做模糊拼写纠正。

## 许可证

[MIT](LICENSE)
