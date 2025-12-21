# 坚果云 WebDAV 代理（解决浏览器 CORS）

坚果云 `dav.jianguoyun.com` 默认不返回 CORS 头，网页/PWA 里直接 `fetch` WebDAV 会报 `Load failed` / `Failed to fetch`。  
这个 Cloudflare Worker 用来转发 WebDAV 请求并补上 CORS 头。

## 部署（Cloudflare Workers）

1) 在 Cloudflare Dashboard 新建 Worker，把 `worker.mjs` 内容粘贴进去并部署  
2) 可选：在 Worker 的 Settings -> Variables 里设置：
   - `ALLOWED_ORIGIN`：只允许你的站点调用（例如 `https://lluviose.github.io`），不填则为 `*`
3) 回到应用设置 -> 坚果云备份，填写「代理地址」为你的 Worker URL（例如 `https://xxx.workers.dev/`）

## 说明

- 代理只允许转发到 `https://dav.jianguoyun.com`，不会变成通用开放代理
- 账号/应用密码仍由前端通过 `Authorization` 头发送到代理，再由代理转发到坚果云
