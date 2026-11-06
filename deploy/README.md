# 发布网站

网站是已经可运行的静态文件，发布目录为 **`web/dist/`**。不需要服务器程序、数据库、安装命令或构建命令。

从仓库根目录运行：

```sh
python tools/package_web.py
```

生成 `artifacts/qixi-site-v3.zip`，解压第一层就是 `index.html`。只上传网页资源，不上传整个项目仓库；固件、测试和文档不需要进入网站公开目录。

## 配置表

| 项目 | 填什么 |
|---|---|
| 框架 | 静态网站 / Other |
| 构建命令 | 留空 |
| 发布目录 | `web/dist` |
| 首页 | `index.html` |
| 访问协议 | HTTPS，供手机桌面和通知能力使用 |
| 前端路由 | 使用 hash，不需要将所有资源请求重写到 HTML |

保留 `icons/`。`.js` 和 `sw.js` 必须返回正确的 JavaScript 内容类型；`.webmanifest` 应返回 JSON / manifest 类型。不要给入口、JS 和 Service Worker 设置长期不可更新的缓存。

## 中国内地访问

当前原站：[栖息演示](https://qixi-dorm-ac-demo.beamygala1.chatgpt.site)。它已经公开，但中国内地访问尚未验证。

准备采用腾讯云 CloudBase 的静态托管先发布演示。默认 HTTPS 域名适用于开发测试，有频率限制；免费体验资格、额度和有效期以实际账号页面为准。登录、短信和实名需要账号所有者在官方页面完成。[腾讯云托管说明](https://cloud.tencent.cn/document/product/876/46900)、[套餐说明](https://buy.cloud.tencent.cn/price/tcb/overview)

登录后的操作：创建专用环境 → 开启静态托管 → 上传 ZIP 或 `web/dist/` 内的文件 → 复制平台实际分配的网址 → 验证。遇到付费套餐先由负责人决定，当前没有购买服务器或域名。

如用 CloudBase CLI，在仓库根目录运行：

```sh
npx --yes --package=@cloudbase/cli@3.9.1 tcb login
npx --yes --package=@cloudbase/cli@3.9.1 tcb env list
npx --yes --package=@cloudbase/cli@3.9.1 tcb hosting deploy web/dist -e YOUR_ENV_ID
```

`YOUR_ENV_ID` 必须是实际环境 ID。只向新建的专用环境根目录上传；已有项目先确认独立目录，避免覆盖。账号授权和实际部署目前尚未完成。[官方 CLI 参考](https://docs.cloudbase.net/en/hosting/web-hosting-static)

EdgeOne 默认项目域名在中国内地需要带时效的预览链接，当前官方说明有效期为 3 小时，因此不把它直接当作长期内地网址。[域名规则](https://pages.edgeone.ai/document/domain-overview)

最终要分别用中国内地手机移动数据和宿舍 Wi-Fi 测首次访问、刷新和全部页面。部署平台报告成功只说明文件已发布，不证明所有内地网络都可达。

## 换地址后的手机设置

新域名与原站属于不同的浏览器来源，需要重新完成新手设置、添加桌面和允许通知。托管迁移不会自动加入锁屏后的远程推送；当前通知仍来自运行中的演示页面。

GitHub 仓库负责保存代码；网站托管负责提供访问地址。仅上传 GitHub 不等于新网站已上线，也不等于内地访问问题已经解决。
