# /aiko-service

Aiko の常駐起動方法（デーモンモード / systemd サービス）について案内します。

## デーモンモード（OS 非依存、手軽）

bash .claude/scripts/aiko-boot.sh --daemon
bash .claude/scripts/aiko-boot.sh --daemon --telegram
bash .claude/scripts/aiko-boot.sh --status
bash .claude/scripts/aiko-boot.sh --stop

ログは ~/.aiko/aiko.log（AIKO_LOG_FILE で変更可）に出力されます。

## systemd サービスモード（Linux 推奨、ログイン時自動起動）

注意: OS 起動時から常時稼働させるには loginctl enable-linger <username> で linger を有効にしてください。

bash .claude/scripts/aiko-service.sh install
bash .claude/scripts/aiko-service.sh install --telegram
bash .claude/scripts/aiko-service.sh start
bash .claude/scripts/aiko-service.sh stop
bash .claude/scripts/aiko-service.sh status
bash .claude/scripts/aiko-service.sh log
bash .claude/scripts/aiko-service.sh uninstall

## 使い分け

| 方法     | OS       | 自動起動タイミング              | 向いている場面                       |
|----------|----------|---------------------------------|--------------------------------------|
| --daemon | 全 OS    | なし（手動）                    | 一時的な常駐、開発・テスト           |
| systemd  | Linux のみ | ログイン時（linger で OS 起動時も可） | サーバー常時稼働、本番運用       |

## 注意事項

- macOS では --daemon を使用してください（systemd 非対応）
- --telegram フラグは --dangerously-skip-permissions を使用します
