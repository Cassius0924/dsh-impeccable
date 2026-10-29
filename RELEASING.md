# 发版流程 (Releasing)

1. 跑完构建与单测：
   ```sh
   pnpm build && pnpm test
   ```
2. 更新 `package.json` 版本号并提交 git tag。
3. 发布到 npm：
   ```sh
   npm publish --access public
   ```
