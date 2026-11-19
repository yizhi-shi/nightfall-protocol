<div align="center">

<img src="docs/screenshots/campaign-menu.webp" alt="夜幕协议 — 六关战役选择界面" width="100%">

# 夜幕协议 · Nightfall Protocol

**单文件 Three.js 第一人称射击游戏 · 六关室内外战役 · 自适应配乐 · 全程序化素材**

[![HTML5](https://img.shields.io/badge/HTML5-single--file-E34F26?logo=html5&logoColor=white)](index.html)
[![Three.js](https://img.shields.io/badge/Three.js-r160-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![WebGL](https://img.shields.io/badge/WebGL-2.0-990000?logo=webgl&logoColor=white)](https://www.khronos.org/webgl/)
[![License](https://img.shields.io/badge/license-MIT-3da639)](LICENSE)

[在线试玩](https://yizhi-shi.github.io/nightfall-protocol/) · [下载 ZIP](https://github.com/yizhi-shi/nightfall-protocol/archive/refs/heads/main.zip) · [完整提示词](PROMPT.md)

</div>

---

## 简介

《夜幕协议》是一款发生在一场永不停歇的暴雨中的第一人称射击游戏。城市北区的泵站、货柜场、变电站、铸造厂、码头和中继塔相继失联。你需要在六个行动区里恢复三处关键节点，穿过哨兵与禁卫的封锁，从北门撤离。

整个游戏被打包进 **一个约 777 KB 的 `index.html`**。没有 CDN、没有外部图片、没有模型文件、没有音频文件；纹理、模型、天气、光效和音效全部由代码在运行时生成。

- **六关室内外战役**：3 个完整室内关卡（铸造车间、码头仓库、塔内大厅）+ 变电站主控室、货柜场装卸雨棚。
- **真正可进入的室内**：完整屋顶/梁架/吊灯、自动滑动门、室内灰尘和低频房间底噪；不是只换色或换道具。
- **室内外雨过渡**：全室内关卡关闭雨线；混合关卡用矩形干区遮罩，屋顶下无雨、屋外仍下雨。
- **六种目标道具**：继电器、信标、断路器、阀门、控制台、服务器机柜，各自有独立模型和交互动词。
- **六套自适应配乐**：每关独立调式/BPM/音色，战斗时 Arp、Perc、Bass 分层增强；不是只有雨声。
- **场景环境声**：风、工业低频、电嗡鸣、炉膛轰鸣、服务器低频；室内降低雨声并加入房间底噪。
- **多天气与亮度规划**：01/03 暴雨夜、02 雨停黄昏、05 小雨夜、04/06 室内；每关独立曝光、天空、雾和主光。
- **剧情推进**：每关 3 条“指挥部 / 灯塔”无线电节拍，独立胜利/失败文案。
- **双输入**：鼠标 360° 转身 + 左键开火；同时支持纯键盘 `F` 开火、方向键转向、`Enter` 开始/继续。
- **三档难度**：简单（默认）/ 普通 / 困难，影响敌人生命、伤害、精度、速度、玩家护甲、备弹、回血和目标交互时间。
- **完整射击反馈**：枪口焰、动态枪口光、曳光、抛壳、硝烟、后坐力、弹着火花、弹孔、受击方向指示和换弹动画。
- **单文件、可离线**：下载后用 Chrome / Edge 打开即可游玩。

## 在线试玩

> **https://yizhi-shi.github.io/nightfall-protocol/**

如果 GitHub Pages 暂时不可用，也可以下载仓库后直接打开 `index.html`。

## 六关战役

| 关卡 | 场景 | 空间特征 | 目标 |
| --- | --- | --- | --- |
| 01 | 07 号泵站 | 暴雨夜 + 闪电；工业泵站、中央主楼、货柜与管廊 | 三座继电器 |
| 02 | 02 号货柜场 | 雨停后的黄昏；堆叠集装箱迷宫 + 装卸雨棚 | 三座导航信标 |
| 03 | 03 号变电站 | 雷暴夜；室外变压器阵列 + 可进入的主控室 | 三组断路器 |
| 04 | 04 号铸造厂 | 室内；熔炉、环形检修台、西侧控制室 | 三座炉心阀门 |
| 05 | 05 号码头 | 小雨夜；保税仓库、货架、叉车、东侧卸货口 | 三座码头控制台 |
| 06 | 06 号中继塔 | 室内黎明前；塔内大厅、西机房、东控制室、北核心 | 三座数据节点 |

开始界面可点击关卡按钮，或按 `[` / `]` 循环切换。每关通关后点击「下一关」继续；最后一关会进入「战役完成」结算。

## 截图

<div align="center">

<img src="docs/screenshots/level-01-pump.webp" alt="07 号泵站" width="49%">
<img src="docs/screenshots/level-02-yard.webp" alt="02 号货柜场" width="49%">

<img src="docs/screenshots/level-03-substation.webp" alt="03 号变电站" width="49%">
<img src="docs/screenshots/level-04-foundry.webp" alt="04 号铸造厂" width="49%">

<img src="docs/screenshots/level-05-docks.webp" alt="05 号码头" width="49%">
<img src="docs/screenshots/level-06-tower.webp" alt="06 号中继塔" width="49%">

</div>

<div align="center">
<img src="docs/screenshots/interior-valve.webp" alt="铸造厂控制室阀门" width="32%">
<img src="docs/screenshots/interior-server.webp" alt="中继塔服务器机房" width="32%">
<img src="docs/screenshots/warehouse-bay.webp" alt="码头仓库卸货口" width="32%">
<br>
<sub>室内目标道具、服务器机房与仓库卸货口</sub>
</div>

<div align="center">
<img src="docs/screenshots/combat.webp" alt="枪口焰、曳光与敌人交战" width="78%">
<br>
<sub>枪口焰、动态枪口光、曳光、抛壳与受击方向指示</sub>
</div>

## 室内 / 室外节奏

这一版针对“六关都是同一张外场换皮”的问题做了结构性调整：

- **04 铸造厂**：从南侧卷帘门进入完整车间，主厅有熔炉、梁架、吊梁、环形检修台和天窗光柱；西侧控制室需要推开自动门，目标 C 的阀门在室内。
- **05 码头**：从雨中的南门进入保税仓库，内部是货架、集装箱、叉车和装卸灯；东侧卸货口外能看到运河、雨和吊机。
- **06 中继塔**：塔内大厅连接西机房、东控制室和北核心机房；四道防火门分别保护两个数据节点和核心节点。
- **03 变电站**：主控室位于北门前，南北双门，目标 C 在室内；建筑外面仍是高压开关场。
- **02 货柜场**：西南侧增加覆盖式装卸雨棚，形成半室内干区，室外货柜迷宫仍然是主要交火区。

详细调研、现状审计和验收标准见 **[docs/LEVEL_DESIGN.md](docs/LEVEL_DESIGN.md)**。

## 声音与叙事

- **自适应配乐**：Pad 常驻；Bass、Arp、Perc 根据战斗强度分层增强。六关各有独立调式、BPM 和音色。
- **场景环境声**：泵站低频、变电站电嗡鸣、铸造厂炉膛轰鸣、码头风/水、塔内服务器高频。
- **天气**：01/03 暴雨夜、02 雨停黄昏、05 小雨夜、04/06 室内。02 没有雨线和雨声，只有风、湿地面和黄昏光线。
- **亮度规划**：每关独立曝光、天空色、雾色、太阳/月亮方向与主光色温；暗部可读、目标区域有对比。
- **剧情**：每关 3 条“指挥部 / 灯塔”无线电节拍，配有独立结算文案；最后一关收束整个战役。

详细声音、天气、亮度和叙事设计见 **[docs/AUDIO_NARRATIVE.md](docs/AUDIO_NARRATIVE.md)**。

## 操作

### 鼠标

| 输入 | 动作 |
| --- | --- |
| 移动鼠标 | 360° 转身、上下抬头 / 低头 |
| 鼠标左键 | 开火 |
| 鼠标右键 | 开镜 |

### 键盘备用方案

即使鼠标左键损坏，或完全不使用鼠标，也可以通关。

| 按键 | 动作 |
| --- | --- |
| `W` `A` `S` `D` | 移动 |
| `Shift` | 冲刺 |
| `Space` | 跳跃 |
| `C` | 蹲下 |
| `F` | 开火（按住连发） |
| `Q` | 开镜 |
| `R` | 装弹 |
| `E` | 长按交互 / 覆盖目标 |
| `Enter` | 开始 / 继续 / 下一关 / 失败后重开 |
| `Esc` | 暂停 / 继续 |
| `M` | 静音 |
| `↑` `↓` `←` `→` | 抬头 / 低头 / 左右转身 |
| `[` / `]` | 在开始界面切换关卡 |
| `1` / `2` / `3` | 选择简单 / 普通 / 困难 |

### 关卡与难度 URL 参数

```text
?level=1                 第一关
?level=3&difficulty=hard 第三关，困难
```

支持 `level=1..6`，`difficulty=easy|normal|hard`。直接刷新页面也会保留 URL 中的难度。

## 难度

| 难度 | 敌人生命 | 敌人伤害 | 玩家护甲 | 备弹 | 目标交互 |
| --- | --- | --- | --- | --- | --- |
| 简单（默认） | 74% | 60% | 75 | 180 | 1.9 秒 |
| 普通 | 100% | 100% | 50 | 150 | 2.35 秒 |
| 困难 | 132% | 135% | 25 | 120 | 2.9 秒 |

困难还会提高敌人精度、移动速度和回血延迟。

## 运行

### 直接运行

1. 下载或克隆仓库。
2. 双击 `index.html`，或拖进 Chrome / Edge。
3. 选择关卡和难度，点击「开始空降」，或按 `Enter`。

无需安装、无需服务器、无需联网。

### 本地 HTTP

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080/
```

## 从源码构建

```bash
npm install
npm run build
```

构建脚本会把 `index.template.html`、`src/styles.css` 和 `src/main.js` 的 esbuild 产物合并为根目录的 `index.html`。

```text
index.template.html   HTML 结构与中文界面
src/main.js           游戏循环、输入、难度、关卡流程
src/levels.js         六关配置：主题、天气、音乐、剧情、目标
src/world.js          程序化场景、碰撞、目标与撤离点
src/textures.js       Canvas PBR 纹理、法线、招牌
src/effects.js        枪口焰、曳光、弹壳、雨、火花
src/enemy.js          敌人模型、AI、射击
src/hud.js            HUD、小地图、结算
src/audio.js          Web Audio 合成音效、环境声与天气化雨声
src/music.js         自适应程序化配乐（Pad / Bass / Arp / Perc）
build.mjs             esbuild + 模板注入
index.html            构建产物，单文件可玩
```

## 技术要点

- **一个 HTML**：Three.js、addons、游戏代码、CSS、着色器全部内联。
- **零外部素材**：纹理由 Canvas 2D 生成；法线/粗糙度由高度图计算；模型由基础几何体组合；音效由 Web Audio 合成。
- **程序化 PBR**：沥青 1024、墙面/金属/货柜 512，配合环境反射、雾、体积光、Bloom、ACES、FXAA、锐化和颗粒。
- **固定光源预算**：静态阴影缓存、有限点光源、持久枪口光，避免动态光源导致着色器重编译。
- **自适应画质**：默认 DPR 上限 1.15，高画质 1.35；检测到软件渲染器时强制低画质。
- **碰撞体系**：旋转 AABB、玩家-敌人实体避让、枪械靠墙压低、子弹被最近实体阻挡。
- **关卡参数化**：`src/levels.js` 中的配置驱动主题、目标、敌人、灯光、天气、音乐和故事节拍；`src/world.js` 提供泵站专用场景与五类通用关卡构建器。
- **室内系统**：屋顶/梁架/吊灯、自动滑动门（靠近开门并移除碰撞体）、干区雨遮罩、室内灰尘、低频房间底噪。
- **目标道具系统**：`Relay` 支持 `relay / beacon / breaker / valve / console / server` 六种轮廓，交互动词随关卡配置。
- **自适应音乐**：`src/music.js` 使用 WebAudio 振荡器、噪声和滤波器实时合成；无音频文件、无外部请求。
- **多天气天空**：`makeSky` 支持地平线/天顶/云/太阳/月亮/闪电参数；雨量和闪电按关卡开关。

## 测试记录

已用 Playwright + Chromium 在软件渲染环境下完成：

- 六关全部加载、进入、生成三处目标和八名敌人，无控制台错误与页面异常。
- 出生点、敌人出生点、目标点与碰撞体交叉检查通过；新增室内墙、门和货架后仍无初始穿模。
- 03/04/05/06 共 9 道自动门：玩家靠近后全部打开，门碰撞体全部移除。
- 04/06 全室内关卡雨线与地面溅水隐藏；03/05 干区遮罩生效；05 卸货口外仍能看到雨、水面和吊机。
- 03/04/06 的所有室内目标（断路器、阀门、服务器节点）均可正常长按完成。
- 仓库完整流程：进入办公室门 → 三处控制台 → 开启北门 → 撤离胜利。
- 下一关跳转、最后一关「战役完成」、关卡选择、`[` / `]` 切换通过。
- 1280×720 与 1440×900 开始界面布局检查通过，无溢出。
- 鼠标 360° 转身、鼠标左键开火、F 键开火、Q 开镜、三档难度通过。
- 六关音乐与场景环境声均启动，WebAudio 状态正常；02 无雨声、04 有炉膛声、06 有服务器低频。
- 六关曝光/天空/雾色不同；02 黄昏可见、01/03 雨夜、04/06 室内可读。
- 每关 3 条无线电故事节拍和独立结算文案。
- 页面无任何外部网络请求。

> 软件渲染环境下的低帧率不代表普通 GPU 浏览器表现；游戏会自动降低分辨率与后处理。

## 许可

本项目代码、程序化素材和截图采用 [MIT License](LICENSE)。

Three.js 与 esbuild 的第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 完整提示词

本项目的完整可复用生成规格见 **[PROMPT.md](PROMPT.md)**。

---

<div align="center">
<sub>夜幕协议 · 雨还在下，但这一次你可以离开了。</sub>
</div>
