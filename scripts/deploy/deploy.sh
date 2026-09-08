#!/usr/bin/env bash
#
# what2eat 自动部署脚本
#
# 由 what2eat-deploy.timer 在 VPS 上以 ubuntu 身份每分钟触发一次：
#   fetch release 分支 → 有新提交就切过去 → 按需重装依赖 → 重启服务 → 健康检查
#   健康检查不过就自动回滚到上一个提交。
#
# 只跟 release 分支，不跟 main：GitHub Actions 里测试跑绿之后才会把那个 commit
# 推到 release，所以这里拉到的东西一定是测试通过的版本。
#
# 整个逻辑包在 main() 里、最后一行才调用：git 会在运行过程中替换掉这个脚本文件
# 本身，而 bash 是边读边执行的，先把函数体完整解析进内存可以避免读到改了一半的脚本。

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/what2eat}"
SERVICE="${SERVICE:-what2eat}"
BRANCH="${BRANCH:-release}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
# 记下"部署失败并已回滚"的那个 commit，避免每分钟拿同一个坏版本反复重启服务
FAILED_MARKER="${FAILED_MARKER:-$HOME/.what2eat-deploy-failed}"

# 私钥有密码或 known_hosts 缺失时直接失败，而不是挂在那儿等输入（定时任务没有终端）
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}"

log() { echo "[deploy] $*"; }

# 只有 package.json / package-lock.json 变了才重装依赖，平时的内容改动跳过这一步
deps_changed() {
  local files
  # 先落到变量再匹配，不走管道：grep -q 命中后会立刻退出，管道里的 git 拿到
  # SIGPIPE 返回 141，配合 set -o pipefail 会把"变了"误判成"没变"
  files="$(git diff --name-only "$1" "$2")"
  grep -qE '(^|/)package(-lock)?\.json$' <<<"$files"
}

wait_healthy() {
  local i
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

rollback() {
  local prev="$1" failed="$2"
  log "回滚到 ${prev:0:8}"
  echo "$failed" > "$FAILED_MARKER"
  git checkout --force --detach "$prev"
  if deps_changed "$failed" "$prev"; then
    npm ci || log "回滚时 npm ci 失败，仍然尝试重启"
  fi
  sudo systemctl restart "$SERVICE" || true
  if wait_healthy; then
    log "已回滚到 ${prev:0:8}，服务恢复正常。坏版本 ${failed:0:8} 需要人工排查"
  else
    log "回滚后服务依然不健康，需要立刻人工介入：journalctl -u $SERVICE -n 100"
  fi
  exit 1
}

main() {
  cd "$REPO_DIR"

  git fetch --quiet --prune origin "$BRANCH"
  local current target
  current="$(git rev-parse HEAD)"
  target="$(git rev-parse FETCH_HEAD)"

  # 绝大多数轮次走到这里就结束了，不打日志，免得 journal 里全是噪音
  if [ "$current" = "$target" ]; then
    exit 0
  fi

  # 上一轮已经试过这个 commit、失败并回滚了。不再重试，否则每分钟都会把服务
  # 重启一遍。这里不打日志（失败原因上一轮已经写清楚了，不必每分钟重复刷屏），
  # 但仍然以非零退出，让 `systemctl status what2eat-deploy` 保持在失败状态。
  # 等下一个提交通过 CI 推到 release，target 变了就会自动恢复正常。
  if [ -f "$FAILED_MARKER" ] && [ "$(cat "$FAILED_MARKER")" = "$target" ]; then
    exit 1
  fi

  log "发现新版本 ${current:0:8} -> ${target:0:8}"
  git checkout --force --detach "$target"

  # 这几步任何一步失败都要回滚：此时仓库已经停在新提交上，如果就这么退出，
  # 下一轮 current == target 会直接跳过，服务会静默卡在"代码是新的、跑的是旧的"
  if deps_changed "$current" "$target"; then
    log "依赖清单有变化，重新安装 node_modules"
    if ! npm ci; then
      log "npm ci 失败"
      rollback "$current" "$target"
    fi
  fi

  if ! sudo systemctl restart "$SERVICE"; then
    log "systemctl restart 失败"
    rollback "$current" "$target"
  fi

  if ! wait_healthy; then
    log "重启后 ${HEALTH_RETRIES}s 内 $HEALTH_URL 没通过健康检查"
    rollback "$current" "$target"
  fi

  rm -f "$FAILED_MARKER"
  log "部署完成: $(git log -1 --format='%h %s')"
}

main "$@"
