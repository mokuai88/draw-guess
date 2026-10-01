# 🚀 永久免费部署指南（把游戏发布成固定网址）

> 目标：让你的「你画我猜」有一个**永久固定、随时可访问**的公网网址，
> 朋友在任何网络打开就能玩，**不再依赖临时隧道、不用每次重启**。

**推荐平台：Railway**（最佳：免费额度、原生支持 WebSocket、实例不强制休眠）
备用平台：Render（见文末，注意免费版会休眠）。

下面是给新手的完整步骤，照着做就行。

---

## 第 0 步：准备（只需一次）

你需要两个免费账号：

1. **GitHub** → https://github.com 注册（用于存放代码）
2. **Railway** → https://railway.com 注册（用于运行并给你网址）

> Railway 可以用 GitHub 账号直接登录，方便。

---

## 第 1 步：把项目代码传到 GitHub

1. 打开 https://github.com ，点右上角 **+ → New repository**
2. Repository name 填 `draw-guess`，选 **Public**（公开即可，也不影响），点 **Create repository**
3. 因为我们不在这台电脑上装 Git，用**最简单的网页上传**：
   - 用我给你的 **`draw-guess-deploy.zip`** 压缩包（已含全部所需文件，目录结构正确）
   - 或者手动从 `D:\游戏\draw-guess` 上传这些文件（**不要**传 `node_modules`）：
     - `server.js`
     - `public/index.html`
     - `package.json`
     - `package-lock.json`
     - `railway.toml`
     - `.gitignore`
     - `.railwayignore`
   - 上传后点 **Commit changes** 保存

> **重要**：`index.html` 必须在 `public/index.html` 这个路径下（服务器靠它找页面）。如果手动上传，记得保持这个目录结构。

---

## 第 2 步：在 Railway 创建项目并连接 GitHub

1. 登录 Railway：https://railway.com
2. 点 **Start a New Project**（开始新项目）
3. 选择 **Deploy from GitHub repo**（从 GitHub 仓库部署）
4. Railway 会引导你**授权连接你的 GitHub**，走到授权页面点允许
5. 选择你刚建的 `draw-guess` 仓库 → 点 **Deploy**（部署）

Railway 会自动：
- 检测是 Node 项目 → 安装依赖（`npm install`）
- 执行启动命令 `npm start` → 跑起 `server.js`
- 给 WebSocket 一个 HTTPS 域名

---

## 第 3 步：找到你的永久网址

1. 部署完成后，在 Railway 项目里点开 `draw-guess` 服务
2. 顶部有一个 **.app / Generate Domain** 之类的生成域名按钮 → 点它生成域名
3. 你得到类似 `draw-guess-production-xxxx.up.railway.app` 的地址，这就是**你的永久网址**

把 `https://` 开头的完整地址发给朋友即可：
`https://draw-guess-production-xxxx.up.railway.app`

---

## 第 4 步：测试

用这个地址自己开两个标签页（或两台设备）验证：
1. 打开永久网址 → 首次自动弹出玩法教程，点「我明白了」
2. 两个标签页**默认自动进入同一房间** → "在线 2 人" → 自动开局
3. 一个人画，另一个人看画猜词 → 正常计分轮换

成功即部署完成！🎉

---

## 常见问题

- **为什么朋友打不开 / 一直连接中？**
  - 确认用的是 Railway 生成的**完整 `https://` 网址**（不是本地 `localhost`）
  - 让朋友刷新页面重试；若手动改了房间号，确认两人相同
- **部署后想再改代码？**
  - 本地改完，重新上传到 GitHub（替换同名文件并 Commit），Railway 会自动重新部署
- **节点/地区选择**
  - Railway 默认地区即可，或选离你们近的（如 `us-west` / 香港附近区域）

---

## 关于备用平台 Render ⚠️

X Render **免费版**会在页面闲置 15 分钟后把服务器**休眠**（第一次访问要等冷启动、会偶尔慢），对 WebSocket 游戏体验不佳。
- 若你预算为零又想长期用，**优先 Railway**。
- 若你愿意用 Render，项目里已附带 `render.yaml`，可到 Render 用 **Blueprint** 导入部署。

---

## 项目文件说明（部署相关）

| 文件 | 作用 |
|------|------|
| `server.js` | 服务器本体，已读取 `process.env.PORT`（云平台要求的端口） |
| `package.json` | 含 `start` 命令与 Node 版本要求 |
| `railway.toml` | Railway 配置（构建/启动命令） |
| `render.yaml` | （备用）Render 配置 |
| `.railwayignore` / `.gitignore` | 忽略 `node_modules`，别上传 |
| `public/index.html` | 玩家看到的前端页面（自动连到当前网址的 WebSocket） |