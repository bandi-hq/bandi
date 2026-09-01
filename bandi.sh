#!/usr/bin/env bash

set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/web.pid"
LOG_FILE="$RUN_DIR/web.log"
WEB_PORT=1420
WEB_URL="http://127.0.0.1:$WEB_PORT"

ESC="$(printf '\033')"
BOLD="${ESC}[1m"
RESET="${ESC}[0m"
FG_GREEN="${ESC}[32m"
FG_RED="${ESC}[31m"
FG_YELLOW="${ESC}[33m"
FG_BLUE="${ESC}[34m"
FG_CYAN="${ESC}[36m"
FG_GRAY="${ESC}[90m"

if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then
  BOLD=""; RESET=""; FG_GREEN=""; FG_RED=""; FG_YELLOW=""; FG_BLUE=""; FG_CYAN=""; FG_GRAY=""
fi

is_port_in_use() {
  lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1
}

read_pid() {
  [ -f "$PID_FILE" ] && tr -d '[:space:]' < "$PID_FILE" || true
}

is_process_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] && kill -0 "$pid" >/dev/null 2>&1
}

process_belongs_to_bandi() {
  local pid="$1" cwd command
  is_process_alive "$pid" || return 1

  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2- || true)"
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"

  [[ "$cwd" == "$ROOT" || "$cwd" == "$ROOT/"* ]] && {
    [[ "$command" == node\ *pnpm*dev* ]] ||
      [[ "$command" == node\ *vite* ]]
  }
}

find_bandi_web_pid() {
  local listener pid parent candidate
  for listener in $(lsof -nP -t -iTCP:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null | sort -u); do
    pid="$listener"
    candidate=""
    while process_belongs_to_bandi "$pid"; do
      candidate="$pid"
      parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
      [[ "$parent" =~ ^[1-9][0-9]*$ ]] || break
      pid="$parent"
    done
    [ -n "$candidate" ] && { printf '%s' "$candidate"; return 0; }
  done
  return 1
}

get_bandi_web_pid() {
  local pid
  pid="$(read_pid)"
  if process_belongs_to_bandi "$pid"; then
    printf '%s' "$pid"
    return 0
  fi
  find_bandi_web_pid
}

show_port_owner() {
  lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null || true
}

clear_screen() {
  [ -t 1 ] && clear 2>/dev/null || true
}

cleanup_stale_pid() {
  local pid="$1"
  if [ -n "$pid" ] && ! process_belongs_to_bandi "$pid"; then
    rm -f "$PID_FILE"
  fi
}

wait_for_web() {
  local pid="$1" i=0
  while [ "$i" -lt 60 ]; do
    is_process_alive "$pid" || return 1
    if is_port_in_use && curl -fsS "$WEB_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
    i=$((i + 1))
  done
  return 1
}

start_web() {
  local pid
  command -v pnpm >/dev/null 2>&1 || { printf "${FG_RED}未找到 pnpm${RESET}\n"; return 1; }

  pid="$(get_bandi_web_pid || true)"
  if process_belongs_to_bandi "$pid"; then
    mkdir -p "$RUN_DIR"
    printf '%s\n' "$pid" > "$PID_FILE"
    printf "${FG_YELLOW}Web 开发服务已在运行 (PID: %s)${RESET}\n" "$pid"
    return 0
  fi
  cleanup_stale_pid "$(read_pid)"

  if is_port_in_use; then
    printf "${FG_RED}端口 %s 已被其他进程占用，未执行启动：${RESET}\n" "$WEB_PORT"
    show_port_owner
    return 1
  fi

  mkdir -p "$RUN_DIR"
  printf "${FG_BLUE}正在启动 Web 开发服务...${RESET}\n"
  (
    cd "$ROOT"
    nohup pnpm web:dev >"$LOG_FILE" 2>&1 &
    printf '%s\n' "$!" >"$PID_FILE"
  )
  pid="$(read_pid)"

  if wait_for_web "$pid"; then
    printf "${FG_GREEN}Web 开发服务启动成功${RESET}\n"
    printf "${FG_CYAN}访问地址：${BOLD}%s${RESET}\n" "$WEB_URL"
    return 0
  fi

  printf "${FG_RED}Web 开发服务启动失败，请查看日志：%s${RESET}\n" "$LOG_FILE"
  if process_belongs_to_bandi "$pid"; then
    kill -TERM "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  [ -f "$LOG_FILE" ] && tail -n 20 "$LOG_FILE"
  return 1
}

child_pids() {
  pgrep -P "$1" 2>/dev/null || true
}

signal_process_tree() {
  local signal="$1" pid="$2" child
  for child in $(child_pids "$pid"); do
    signal_process_tree "$signal" "$child"
  done
  kill "-$signal" "$pid" 2>/dev/null || true
}

stop_web() {
  local pid i=0
  pid="$(get_bandi_web_pid || true)"

  if [ -z "$pid" ]; then
    rm -f "$PID_FILE"
    printf "${FG_YELLOW}Web 开发服务未运行${RESET}\n"
    if is_port_in_use; then
      printf "${FG_YELLOW}端口 %s 当前被其他进程占用，未发送停止信号：${RESET}\n" "$WEB_PORT"
      show_port_owner
    fi
    return 0
  fi

  if ! process_belongs_to_bandi "$pid"; then
    printf "${FG_RED}无法确认进程属于当前 Bandi 项目，拒绝停止 (PID: %s)${RESET}\n" "$pid"
    rm -f "$PID_FILE"
    return 1
  fi

  mkdir -p "$RUN_DIR"
  printf '%s\n' "$pid" > "$PID_FILE"

  printf "${FG_BLUE}正在停止 Web 开发服务 (PID: %s)...${RESET}\n" "$pid"
  signal_process_tree TERM "$pid"
  while is_process_alive "$pid" && [ "$i" -lt 20 ]; do
    sleep 0.25
    i=$((i + 1))
  done

  if is_process_alive "$pid"; then
    if process_belongs_to_bandi "$pid"; then
      signal_process_tree KILL "$pid"
    else
      printf "${FG_RED}等待期间 PID 身份发生变化，拒绝强制停止${RESET}\n"
      return 1
    fi
  fi

  rm -f "$PID_FILE"
  printf '[Bandi] %s Web 服务已由 bandi.sh 正常停止\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
  printf "${FG_GREEN}Web 开发服务已停止${RESET}\n"
  if is_port_in_use; then
    printf "${FG_YELLOW}端口 %s 仍被其他进程占用，未进行清理：${RESET}\n" "$WEB_PORT"
    show_port_owner
  fi
}

restart_web() {
  stop_web && start_web
}

format_uptime() {
  local pid="$1" value
  value="$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ' || true)"
  printf '%s' "${value:--}"
}

status_web() {
  local pid status
  pid="$(get_bandi_web_pid || true)"

  if process_belongs_to_bandi "$pid"; then
    if is_port_in_use; then
      status="${FG_GREEN}● 运行中${RESET}"
    else
      status="${FG_RED}● 异常：托管进程存活但端口未监听${RESET}"
    fi
  elif [ -n "$pid" ]; then
    status="${FG_YELLOW}○ 状态陈旧${RESET}"
  elif is_port_in_use; then
    status="${FG_YELLOW}● 非本项目进程占用端口${RESET}"
  else
    status="${FG_RED}○ 未运行${RESET}"
  fi

  echo ""
  printf "${FG_CYAN}────────────────────────────────────────────────────────${RESET}\n"
  printf "${FG_CYAN}[Web 开发服务]${RESET}\n"
  printf "  %-10s: %b\n" "状态" "$status"
  printf "  %-10s: %s\n" "PID" "${pid:--}"
  printf "  %-10s: %s\n" "端口" "$WEB_PORT"
  printf "  %-10s: %s\n" "运行时间" "$(is_process_alive "$pid" && format_uptime "$pid" || printf '-')"
  printf "  %-10s: %s\n" "访问地址" "$WEB_URL"
  printf "  %-10s: %s\n" "日志" "$LOG_FILE"
  printf "${FG_CYAN}────────────────────────────────────────────────────────${RESET}\n"
  if [ -z "$pid" ] && is_port_in_use; then
    show_port_owner
  fi
  echo ""
}

attach_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    printf "${FG_YELLOW}未找到日志文件：%s${RESET}\n" "$LOG_FILE"
    return 0
  fi

  printf "${FG_CYAN}──────── Web 实时日志（最近 50 行）────────${RESET}\n"
  printf "${FG_GRAY}按 Ctrl+C 返回管理面板，Web 服务不会停止。${RESET}\n"
  trap ':' INT
  tail -n 50 -f "$LOG_FILE" || true
  trap - INT
  printf "\n${FG_GREEN}已退出日志查看，Web 服务仍在运行。${RESET}\n"
}

start_desktop() {
  local pid
  command -v pnpm >/dev/null 2>&1 || { printf "${FG_RED}未找到 pnpm${RESET}\n"; return 1; }
  command -v cargo >/dev/null 2>&1 || { printf "${FG_RED}未找到 cargo${RESET}\n"; return 1; }

  pid="$(get_bandi_web_pid || true)"
  if process_belongs_to_bandi "$pid"; then
    printf "${FG_BLUE}正在将 Web 运行方式切换为 Desktop 托管...${RESET}\n"
    stop_web || return 1
  fi

  if is_port_in_use; then
    printf "${FG_RED}Desktop 会自行启动 Web，但端口 %s 已被其他进程占用。${RESET}\n" "$WEB_PORT"
    show_port_owner
    return 1
  fi
  cd "$ROOT" && pnpm desktop:dev
}

run_project_command() {
  local command="$1"
  command -v pnpm >/dev/null 2>&1 || { printf "${FG_RED}未找到 pnpm${RESET}\n"; return 1; }
  cd "$ROOT" && pnpm "$command"
}

current_platform() {
  case "$(uname -s)" in
    Darwin) printf 'macOS' ;;
    Linux) printf 'Linux' ;;
    MINGW*|MSYS*|CYGWIN*) printf 'Windows' ;;
    *) uname -s ;;
  esac
}

build_desktop() {
  printf "${FG_BLUE}当前系统：%s；正在构建本机 Desktop。${RESET}\n" "$(current_platform)"
  run_project_command desktop:build
}

build_windows_installer() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) run_project_command desktop:bundle:windows ;;
    *)
      printf "${FG_YELLOW}Windows NSIS 必须在 Windows 开发机或 Windows CI runner 上构建。${RESET}\n"
      return 1
      ;;
  esac
}

run_cli_command() {
  command -v cargo >/dev/null 2>&1 || { printf "${FG_RED}未找到 cargo${RESET}\n"; return 1; }
  cd "$ROOT" && pnpm cli "$@"
}

run_action() {
  case "${1:-}" in
    start) start_web ;;
    stop) stop_web ;;
    restart) restart_web ;;
    status) status_web ;;
    logs) attach_logs ;;
    desktop) start_desktop ;;
    verify-web) run_project_command verify:web ;;
    verify-rust) run_project_command verify:rust ;;
    verify-e2e) run_project_command verify:e2e ;;
    verify) run_project_command verify ;;
    build-web) run_project_command build ;;
    build-desktop) build_desktop ;;
    bundle-windows) build_windows_installer ;;
    doctor) run_cli_command doctor ;;
    cli-status) run_cli_command status ;;
    config-check) run_cli_command config check ;;
    lint|typecheck|test|build) run_project_command "$1" ;;
    help|-h|--help) show_help ;;
    *) printf "${FG_RED}未知操作：%s${RESET}\n" "${1:-}"; show_help; return 1 ;;
  esac
}

print_menu() {
  local pid web_summary
  pid="$(get_bandi_web_pid || true)"
  if process_belongs_to_bandi "$pid" && is_port_in_use; then
    web_summary="${FG_GREEN}● 运行中${RESET}   PID $pid   localhost:$WEB_PORT"
  elif is_port_in_use; then
    web_summary="${FG_YELLOW}● 端口被其他进程占用${RESET}   localhost:$WEB_PORT"
  else
    web_summary="${FG_RED}○ 未运行${RESET}   localhost:$WEB_PORT"
  fi

  clear_screen
  echo ""
  printf "  ${BOLD}${FG_CYAN}┌────────────────────────────────────────────────────┐${RESET}\n"
  printf "  ${BOLD}${FG_CYAN}│                Bandi 本地开发面板                  │${RESET}\n"
  printf "  ${BOLD}${FG_CYAN}└────────────────────────────────────────────────────┘${RESET}\n"
  echo ""
  printf "  ${FG_CYAN}[当前状态]${RESET}\n"
  printf "  Web  %b\n" "$web_summary"
  echo ""
  printf "  ${FG_CYAN}[Web 开发服务]${RESET}\n"
  printf "  ${FG_GREEN}1.${RESET} 后台启动 Web    ${FG_GRAY}./bandi.sh start${RESET}\n"
  printf "  ${FG_GREEN}2.${RESET} 停止 Web        ${FG_GRAY}./bandi.sh stop${RESET}\n"
  printf "  ${FG_GREEN}3.${RESET} 重启 Web        ${FG_GRAY}./bandi.sh restart${RESET}\n"
  printf "  ${FG_GREEN}4.${RESET} 查看详细状态    ${FG_GRAY}./bandi.sh status${RESET}\n"
  printf "  ${FG_GREEN}5.${RESET} 跟随 Web 日志   ${FG_GRAY}./bandi.sh logs${RESET}\n"
  echo ""
  printf "  ${FG_CYAN}[Desktop]${RESET}\n"
  printf "  ${FG_GREEN}6.${RESET} 启动本机 Desktop（前台，Ctrl+C 退出）\n"
  echo ""
  printf "  ${FG_CYAN}[验证]${RESET}\n"
  printf "  ${FG_GREEN}7.${RESET} 验证 Web\n"
  printf "  ${FG_GREEN}8.${RESET} 验证 Rust\n"
  printf "  ${FG_GREEN}9.${RESET} 验证 Desktop E2E\n"
  printf "  ${FG_GREEN}10.${RESET} 运行全部验证\n"
  echo ""
  printf "  ${FG_CYAN}[构建]${RESET}\n"
  printf "  ${FG_GREEN}11.${RESET} 构建 Web\n"
  printf "  ${FG_GREEN}12.${RESET} 构建本机 Desktop\n"
  printf "  ${FG_GREEN}13.${RESET} 构建 Windows NSIS（仅 Windows）\n"
  echo ""
  printf "  ${FG_CYAN}[CLI 诊断]${RESET}\n"
  printf "  ${FG_GREEN}14.${RESET} bandi doctor\n"
  printf "  ${FG_GREEN}15.${RESET} bandi status\n"
  printf "  ${FG_GREEN}16.${RESET} bandi config check\n"
  echo ""
  printf "  ${FG_GRAY}0. 退出${RESET}\n"
  echo ""
}

menu_action() {
  case "$1" in
    1) run_action start ;;
    2) run_action stop ;;
    3) run_action restart ;;
    4) run_action status ;;
    5) run_action logs ;;
    6) run_action desktop ;;
    7) run_action verify-web ;;
    8) run_action verify-rust ;;
    9) run_action verify-e2e ;;
    10) run_action verify ;;
    11) run_action build-web ;;
    12) run_action build-desktop ;;
    13) run_action bundle-windows ;;
    14) run_action doctor ;;
    15) run_action cli-status ;;
    16) run_action config-check ;;
    0|q|Q) return 2 ;;
    *) printf "${FG_YELLOW}无效选项，请重新输入${RESET}\n"; return 1 ;;
  esac
}

interactive() {
  local choice result
  while true; do
    print_menu
    printf "  请输入数字选择: "
    read -r choice || break
    menu_action "$choice"
    result=$?
    [ "$result" -eq 2 ] && break
    echo ""
    read -rp "  按回车键返回菜单..." _ || break
  done
  clear_screen
}

show_help() {
  cat <<EOF
用法: ./bandi.sh [操作]

操作:
  start           后台启动 Web 开发服务
  stop            停止 bandi.sh 托管的 Web 服务
  restart         重启 Web 开发服务
  status          查看 Web 服务状态
  logs            查看 Web 实时日志
  desktop         前台启动本机 Tauri Desktop
  verify-web       验证 Web（lint、类型、测试、构建）
  verify-rust      验证 Rust（格式、检查、测试）
  verify-e2e       验证 Desktop E2E 类型并运行 E2E
  verify           运行全部验证和 diff 格式检查
  build-web        构建 Web
  build-desktop    构建本机 Desktop
  bundle-windows   构建 Windows NSIS（仅 Windows）
  doctor           运行 bandi doctor
  cli-status       运行 bandi status
  config-check     运行 bandi config check
  lint             兼容入口：运行 ESLint 检查
  typecheck        兼容入口：运行 TypeScript 类型检查
  test             兼容入口：运行 Web 测试
  build            兼容入口：构建 Web
  help             显示帮助

不带参数运行将打开交互管理面板。
EOF
}

main() {
  if [ "$#" -eq 0 ]; then
    interactive
  else
    run_action "$1"
  fi
}

main "$@"
