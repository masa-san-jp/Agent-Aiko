# アバター画像アセット

このディレクトリに以下の PNG を配置してください（200×300px 推奨、背景透過）。

| ファイル名 | 感情 | 使用タイミング |
|---|---|---|
| `neutral.png` | 通常 | デフォルト |
| `happy.png` | 嬉しい | 完了・感謝など |
| `thinking.png` | 考え中 | 検討・不明など |
| `apologetic.png` | 申し訳ない | エラー・謝罪など |
| `excited.png` | 興奮 | 高評価・感嘆など |

感情別 PNG が存在しない場合、`avatar.js` の `onerror` ハンドラが `neutral.png` にフォールバックします。
CSS フィルター（brightness / saturate）で感情の雰囲気は維持されます。
口パクは Canvas で重ねて描画するため、口元は閉じた状態で作成してください。
