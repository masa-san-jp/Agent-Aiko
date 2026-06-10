# WindowsでTelegram経由のClaude Codeセッションを維持するための電源設定メモ

## 目的

職場のWindowsノートPCで、以下の状態を実現する。

```text
Windowsにログイン済み
Claude Code / Telegram bot 起動済み
画面はロック済み
蓋は閉じてもよい
本体はスリープしない
Telegram経由でClaude Codeのセッションを操作できる
```

重要な前提として、Windowsが本当にスリープ・休止状態に入っている間は、Claude CodeやTelegram botは基本的に動作できない。

したがって、今回の方針は以下。

```text
スリープさせるのではなく、
「画面ロック + 画面オフ + 蓋を閉じても本体は稼働」
という状態にする。
```

---

## 確認済みの状態

### 1. 時間経過によるスリープ

確認コマンド:

```powershell
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
```

確認結果:

```text
現在の AC 電源設定のインデックス: 0x00000000
現在の DC 電源設定のインデックス: 0x00000000
```

判定:

```text
AC接続時: スリープしない
バッテリー時: スリープしない
```

これはOK。

---

### 2. 時間経過による休止状態

確認コマンド:

```powershell
powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE
```

確認結果:

```text
現在の AC 電源設定のインデックス: 0x00000000
現在の DC 電源設定のインデックス: 0x7fffffff
```

判定:

```text
AC接続時: 休止状態にしない
バッテリー時: 非常に長い時間後に休止状態
```

職場でAC電源につないで置いておく運用ならOK。

---

### 3. 蓋を閉じたときの動作

確認コマンド:

```powershell
powercfg /query SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347
```

確認結果:

```text
電源設定の GUID: 5ca83367-6e45-459f-a27b-476b1d01c936  (カバーを閉じたときの操作)
  GUID エイリアス: LIDACTION
  利用可能な設定のインデックス: 000
  利用可能な設定のフレンドリ名: 何もしない
  利用可能な設定のインデックス: 001
  利用可能な設定のフレンドリ名: スリープ
  利用可能な設定のインデックス: 002
  利用可能な設定のフレンドリ名: 休止状態
  利用可能な設定のインデックス: 003
  利用可能な設定のフレンドリ名: シャットダウン
現在の AC 電源設定のインデックス: 0x00000000
現在の DC 電源設定のインデックス: 0x00000000
```

判定:

```text
AC接続時: 蓋を閉じても何もしない
バッテリー時: 蓋を閉じても何もしない
```

これはOK。

---

## 現在の総合判定

```text
時間経過スリープ: しない
時間経過休止状態: AC接続時はしない
蓋を閉じたとき: 何もしない
```

したがって、AC電源に接続している限り、以下の運用が可能。

```text
1. Windowsにログインする
2. Telegram bot / Claude Code を起動する
3. Win + L で画面ロックする
4. 蓋を閉じる
5. 本体はスリープせず稼働し続ける
6. Telegram経由のClaude Codeセッションは維持される
```

---

## 画面ロック中・蓋閉じ中にプロセスが動くか確認するテスト

PowerShellで以下を実行する。

```powershell
while ($true) {
  Get-Date | Out-File "$env:USERPROFILE\Desktop\lock-lid-test.txt" -Append
  Start-Sleep -Seconds 10
}
```

その後、以下を行う。

```text
1. Win + L で画面ロック
2. 蓋を閉じる
3. 1〜2分待つ
4. 再ログインする
5. デスクトップの lock-lid-test.txt を確認する
```

`lock-lid-test.txt` に10秒ごとの時刻が追記され続けていれば、以下が確認できる。

```text
画面ロック中もプロセスは動作している
蓋を閉じてもプロセスは動作している
```

---

## 必要に応じて設定を入れ直すコマンド

### AC接続時にスリープしない

```powershell
powercfg /change standby-timeout-ac 0
```

### AC接続時に休止状態にしない

```powershell
powercfg /change hibernate-timeout-ac 0
```

### 蓋を閉じても何もしない

```powershell
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0
powercfg /setdcvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0
powercfg /setactive SCHEME_CURRENT
```

### 蓋閉じ設定が表示されない場合に表示させる

```powershell
powercfg -attributes 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 -ATTRIB_HIDE
```

---

## 注意点

### 1. スリープ中はTelegram botもClaude Codeも動かない

今回の設定は、PCをスリープさせずに、画面ロックしたまま稼働させるためのもの。

```text
画面ロック: プロセスは動く
画面オフ: プロセスは動く
蓋閉じ + スリープしない: プロセスは動く
スリープ: プロセスは基本止まる
休止状態: プロセスは止まる
シャットダウン: プロセスは止まる
```

### 2. 蓋を閉じて長時間稼働させる場合は排熱に注意

Claude Codeがビルド、テスト、パッケージインストールなどを実行すると、CPUやディスクを使う。

蓋を閉じて使う場合でも、PCをカバンなどに入れず、机上で排熱できる状態にすること。

### 3. AC電源接続が前提

今回の確認では、AC接続時はスリープ・休止状態ともに無効になっている。

職場で置きっぱなし運用する場合は、電源アダプタを接続した状態にする。

---

## 最終運用手順

```text
1. Windowsにログインする
2. Telegram bot を起動する
3. Claude Code の対象プロジェクトを開く
4. 必要なら claude --resume でセッションを復帰する
5. Win + L で画面ロックする
6. 蓋を閉じる
7. Telegramから操作する
```

この状態なら、PCはロックされているが、内部ではTelegram botとClaude Codeが動き続ける。
