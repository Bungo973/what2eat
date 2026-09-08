# 自动部署（CI/CD）

推到 `main` 之后，服务器最多 1 分钟内自动更新到这个提交——前提是它在 GitHub Actions 上测试跑绿了。

## 整条链路

```
git push origin main
        │
        ▼
GitHub Actions（.github/workflows/ci.yml）
  test 任务：npm ci → npm run build → npm test
        │ 全绿才继续
        ▼
  promote 任务：把这个 commit 强推到 release 分支
        │
        │  （VPS 每 60 秒主动 fetch 一次 release）
        ▼
VPS：what2eat-deploy.timer → what2eat-deploy.service → scripts/deploy/deploy.sh
  发现 release 有新提交 → checkout → 依赖变了就 npm ci → 重启 what2eat
  → curl /health 健康检查 → 不过就自动回滚到上一个提交
```

**为什么服务器跟的是 `release` 而不是 `main`**：这样"只部署测试通过的代码"这件事是靠分支本身保证的——能出现在 `release` 上的提交，按定义就是 CI 跑绿的。服务器不需要存 GitHub token 去查 CI 状态，也就没有多一份要保管的密钥。测试挂了的提交会停在 `main`，`release` 保持在上一个好版本，服务器什么都不会做。

**为什么是服务器主动轮询，而不是 GitHub 推过来**：VPS 不用为此新开任何端口，也不用把私钥交给 GitHub。代价是最多 1 分钟延迟。

## 一次性设置（在 GitHub 上）

`promote` 任务要往仓库推 `release` 分支，需要 Actions 的默认 token 有写权限。去仓库
**Settings → Actions → General → Workflow permissions**，确认选的是 **Read and write permissions**。
如果这里是只读，workflow 里写的 `permissions: contents: write` 也提不上去，`promote` 会以 403 失败。

## 一次性安装（在 VPS 上，`ubuntu` 账号）

```bash
cd /opt/what2eat

# 1. 先手动拉一次，把部署脚本本身拿下来
git pull

# 2. 允许 ubuntu 免密重启 what2eat 服务（定时任务没有终端，输不了密码）
#    和之前那条 nginx reload 授权一样，精确到单条命令
echo 'ubuntu ALL=(root) NOPASSWD: /bin/systemctl restart what2eat' | sudo tee /etc/sudoers.d/what2eat-deploy
sudo chmod 440 /etc/sudoers.d/what2eat-deploy
sudo visudo -cf /etc/sudoers.d/what2eat-deploy   # 语法自检，必须显示 parsed OK

# 3. 把仓库切到 release 分支（需要 GitHub Actions 已经至少成功跑过一次）
git fetch origin release
git checkout --force --detach origin/release

# 4. 装上 systemd 定时器
sudo cp scripts/deploy/what2eat-deploy.service scripts/deploy/what2eat-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now what2eat-deploy.timer

# 5. 立刻手动跑一次，确认没问题
sudo systemctl start what2eat-deploy
journalctl -u what2eat-deploy -n 30 --no-pager
```

## 日常怎么看

```bash
systemctl list-timers what2eat-deploy          # 下次什么时候跑、上次跑于何时
journalctl -u what2eat-deploy -f               # 实时看部署日志
journalctl -u what2eat-deploy --since today    # 今天发生过什么
git -C /opt/what2eat log -1 --oneline          # 线上现在是哪个提交
```

没有新提交的轮次不打任何日志，所以 journal 里看到的每一条都是真的发生了一次部署。

## 手动介入

```bash
sudo systemctl start what2eat-deploy           # 不想等这一分钟，立刻检查+部署
sudo systemctl stop what2eat-deploy.timer      # 临时停掉自动部署（比如线上正在排障）
sudo systemctl start what2eat-deploy.timer     # 恢复

# 手动回滚到某个提交（回滚后要停掉 timer，否则下一分钟又会被拉回 release 最新版）
sudo systemctl stop what2eat-deploy.timer
cd /opt/what2eat && git checkout --force --detach <commit>
sudo systemctl restart what2eat
```

## 几个要留意的点

- **仓库是 detached HEAD 状态**，不在任何分支上，这是有意的：服务器只是"跟随"release，不该有自己的分支状态。`git status` 看到 `HEAD detached` 是正常的。
- **服务器上不要改代码**。`deploy.sh` 用的是 `git checkout --force`，本地对已跟踪文件的修改会被直接丢弃。
- **依赖只在 `package.json` / `package-lock.json` 变化时才重装**（`npm ci`），平时改菜谱、改文档的提交部署很快。
- **失败会自动回滚**：`npm ci` 失败、`systemctl restart` 失败、或者重启后 15 秒内 `http://127.0.0.1:3000/health` 没通，都会切回上一个提交、重装依赖、再重启。如果回滚后依然不健康，脚本会在日志里明说需要人工介入。
- **回滚之后不会反复重试**：坏提交的 SHA 会记在 `~/.what2eat-deploy-failed`，只要 `release` 还指着它，后续每分钟的检查就直接跳过（否则服务会被每 60 秒重启一次）。这期间 `systemctl status what2eat-deploy` 一直是 failed 状态。修好代码推个新提交，`release` 一变就自动恢复；想在不推新提交的情况下强行重试，`rm ~/.what2eat-deploy-failed` 即可。
- **CI 里的 Node 版本**（`.github/workflows/ci.yml` 里的 `node-version`）应该和 VPS 上 `node -v` 保持一致（当前两边都是 24），否则可能测不到线上实际会踩的版本差异。
- **每分钟轮询不等于每分钟重启**：绝大多数轮次只是一次 `git fetch`（几秒，不碰服务），`release` 没变就静默退出。重启只发生在真的有新提交时，也就是推代码的频率。
- **一次重启大约中断几秒**：`SIGTERM` 后服务会先让在途请求跑完（最多等 3 秒）再退出，新进程起来监听 3000 前 nginx 会短暂返回 502。服务端不存跨请求会话，重启不会让谁的会话断掉。
