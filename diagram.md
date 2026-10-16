---
description: リポジトリ構成図（Mermaid）を knowledge/projects/<リポ名>/architecture.md に生成する
allowed-tools: Read, Write, Bash(pwd), Bash(git ls-files:*), Bash(git -C ~/Projects/quad add:*), Bash(git -C ~/Projects/quad commit:*), Bash(git -C ~/Projects/quad diff:*)
---
## 入力
- リポジトリルート: !`pwd`
- ファイル一覧（画像・lock・snapshot を除外）:
!`git ls-files -- ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.gif' ':!*.svg' ':!*.ico' ':!*.lock' ':!*.snap'`
- README: @README.md

## 手順
上から順に実行し、各ステップの出力を次のステップの入力にする。
いきなり Mermaid を書き始めないこと。

### 1. 説明
ファイル一覧と README を根拠に、主要コンポーネント（レイヤー、サービス、データストア、外部連携）を箇条書きで説明する。
一覧と README で確定できない箇所は、該当ファイル（エントリポイント、設定、ルーティング定義など）を Read して確定し、根拠にしたファイルを明記する。
それでも確定できないものは「要確認」と明記する。推測は書かない。

### 2. パス対応付け
1 の各コンポーネントに、対応するディレクトリまたはファイルのパス（ルートからの相対）を 1 つ対応付ける。
対応するパスが存在しないコンポーネントは削除する。

### 3. Mermaid 生成
`flowchart TD` を生成する。制約:
- ノードは 2 の対応表にあるものだけ
- ノード ID は英数字とアンダースコアのみ。ラベルに括弧・引用符・コロンを使わない（構文エラー回避）
- レイヤーごとに `subgraph` で囲み、subgraph ごとに `classDef` を 1 つ定義して（薄い塗り + 濃い枠）そのレイヤーのノードに当てる
- 各ノードに `click <id> "vscode://file<ルート絶対パス>/<相対パス>"` を付ける（例: `vscode://file/Users/me/repo/src/api`）
- ノードは 30 個以内。超える場合はディレクトリ単位にまとめる

### 4. 出力
対象リポジトリ内には何も書かない。
`~/Projects/quad/knowledge/projects/<リポジトリ名>/architecture.md`（リポジトリ名 = pwd の末尾ディレクトリ名）に以下の順で書き出す:

```
---
root: <ルート絶対パス>
generated: <今日の日付 YYYY-MM-DD>
---
```
1. 1 の説明
2. 3 の Mermaid コードブロック（```mermaid）
3. 2 の対応表（コンポーネント → パス）

書き出し後、次を実行する。差分がなければコミットは作られない。それで正常。
`git -C ~/Projects/quad add knowledge/projects/<リポジトリ名> && if ! git -C ~/Projects/quad diff --cached --quiet -- knowledge/projects/<リポジトリ名>; then git -C ~/Projects/quad commit -m "update <リポジトリ名> 構成図" -- knowledge/projects/<リポジトリ名>; fi`
