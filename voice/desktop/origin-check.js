// アバターの WebSocket は 127.0.0.1 でも、ブラウザのページは Origin を付けて繋げる。
// ローカルの avatar.sh は Origin を付けない。Origin がある接続は拒否する。

function acceptLocalAvatar(info) {
  const header = info?.req?.headers?.origin ?? info?.origin;
  if (typeof header !== "string") return true;
  return header.length === 0;
}

module.exports = { acceptLocalAvatar };
