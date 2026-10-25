# 免费部署：GitHub Pages + Supabase

你需要自己的 GitHub 账号和 Supabase 免费项目。这里不要求购买域名、信用卡或付费 AI API；服务政策、注册要求和免费额度请以服务商当时界面为准。

## 1. 创建 GitHub 仓库并上传

1. 登录 GitHub，新建名为 `cangye` 的仓库；免费 GitHub Pages 使用 **Public** 仓库。只上传本项目源码，绝对不要上传小说、备份、密码或密钥文件。
2. 解压项目 ZIP，将目录内文件上传到仓库根目录，主分支用 `main`。注意隐藏目录 `.github/workflows/pages.yml` 也要上传；有些手机文件选择器会漏掉它。
3. 进入仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
4. 进入 **Actions**，运行 `Deploy private library interface to Pages`。若首次提示允许 Actions，按 GitHub 正常配置启用。
5. 部署完成后会显示 `https://你的用户名.github.io/cangye/`。打开它，可先选择“在此设备试用”。

更容易的无 Actions 方法：在 **Pages → Source** 选择 `Deploy from a branch`，分支 `main`、目录 `/ (root)`。这样会一起托管仓库里的文档和测试，但它们只有源码，没有私密凭据或小说；业务正文仍不在 GitHub。建议优先 Actions 仅发布前端。

## 2. 创建 Supabase 免费项目与唯一账号

1. 在 https://supabase.com/dashboard 新建 Free 项目。数据库密码只填在 Supabase，不要发到聊天或写入仓库。
2. 进入 **Authentication → Users → Add user → Create new user**，创建你自己的邮箱/密码账号，启用自动确认邮箱（如控制台提供该选项）。记住密码并复制这个用户的 **UUID**。这是书库登录账号，不是 Supabase 控制台账号。
3. 进入 **Authentication → Sign In / Providers（或对应 Auth 配置）**，关闭 **Allow new users to sign up**；关闭匿名登录。界面没有注册按钮不等于服务端关闭注册，必须在这里关闭。
4. 打开项目中的 `supabase/setup.sql`，只把 `REPLACE_WITH_YOUR_AUTH_USER_UUID` 替换为刚创建用户的真实 UUID。
5. 在 **SQL Editor** 新建查询，粘贴修改后的整份 SQL 并运行。一次执行即可。脚本用事务包裹；UUID 没改会失败且回滚，不会建成半套权限。
6. 检查 Storage 的 `library` 桶为 **Private**，不要改成 Public。检查 `works` 表启用 RLS，策略仅限 SQL 指定的唯一用户。

脚本是首次安装脚本，不可重复运行。如需迁移、修改唯一账号或已有数据，请先导出备份，再使用专门迁移；不要直接删除数据或重新建表。

## 3. 部署链接提取函数（文件导入不需要这一步）

在 Supabase **Edge Functions** 新建函数 `import-link`，把 `supabase/functions/import-link/index.ts` 的完整代码粘贴到编辑器。

在函数 Secrets 中添加：

| 名称 | 值 |
|---|---|
| `SITE_ORIGINS` | `https://你的用户名.github.io` |

注意这里是 **Origin，没有 `/cangye/` 路径，没有末尾 `/`**。如需本机测试，使用逗号添加 `http://localhost:4173`。不使用 `*`。

函数自己通过 Auth `/user` 验证登录令牌，并调用数据库 RPC 检查唯一主人与限流。**将平台层 Verify JWT 关闭**（新式 JWT 签名密钥可能与网关旧验证不兼容）；这只关闭网关的重复验证，函数内的身份验证仍强制执行，不会开放匿名抓取。不要删掉函数中的身份检查。

如使用 Supabase CLI：

```sh
supabase login
supabase link --project-ref 你的项目编号
supabase secrets set SITE_ORIGINS=https://你的用户名.github.io
supabase functions deploy import-link --no-verify-jwt
```

`SUPABASE_URL` 与 `SUPABASE_ANON_KEY` 为 Supabase 内置函数环境变量；应用不需要 service_role。若你的环境没有内置 legacy anon key，请按当前 Supabase 官方说明配置等效的可公开项目 key，保持函数的账号验证逻辑。

## 4. 在藏页里连接并登录

1. Supabase **Project Settings → API / Connect** 中取得 **Project URL** 与 **Publishable key**，或 legacy **anon key**。
2. 打开藏页 → “配置云端连接”，输入这两项。
3. **不要填写 `service_role` 或 `sb_secret_...`。** Publishable / anon key 允许出现在前端；私密性由 RLS、唯一用户和私有桶实现。应用会拒绝可识别的管理员密钥。
4. 保存连接，用第 2 步创建的邮箱与密码登录。
5. 在安卓 Firefox/Chrome 和电脑上分别配置相同项目地址与 publishable key，登录同一个账号即可使用同一个书库。连接配置按浏览器保存，密码不会写入源码。

## 5. 上线验收（请在存大量作品前执行）

- 导入一个自制 TXT，确认结尾完整；切换另一台设备点“刷新”，应看到同一作品。
- 给作品设置 CP、作者、文件夹、标签和合集，刷新后确认保留。
- 阅读第二章、等进度提交；另一台设备刷新并打开，确认进度。
- 原始 TXT 上传后，在作品菜单“下载原始文件”，断网打开确认内容。
- **退出登录**，应只看到登录页。未经登录的数据库请求不得取得作品；私有附件地址也不得匿名下载。
- 在 Supabase 控制台临时创建第二个测试用户登录，应该显示“此账号不是书库主人”，不能访问正文或文件。测试后在控制台按自己的需要处理测试账号。
- 每个平台各试一篇你有权访问的文章。核对标题、作者、章节数量、最后一段。登录可见或动态页失败时使用文件，不要把错误页面当正文。
- 导出整库 ZIP，断网检查 `library.json` 有全文。可切到本地模式恢复一份，验证章节和原件可读。恢复创建新副本，不覆盖云端现有记录。

## 免费额度与隐私

Supabase Free 当前提供 500 MB 数据库、1 GB 文件存储，另有流量、函数执行、请求大小和上传限制。低活跃项目可能暂停，需在 Dashboard 恢复；没有“永久免费永不丢失”的保证。请定期导出备份。

本方案只保证授权用户访问应用数据，不是端到端加密。账号会话保存在当前浏览器，别在不可信设备上保持登录。使用 GitHub Pages 后，网页入口和前端代码公开；收藏正文不会成为静态文件、公开链接或 GitHub 提交。

参考：
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://supabase.com/pricing
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/platform/free-project-pausing
