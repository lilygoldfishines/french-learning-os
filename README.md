# French Learning OS

个人法语学习操作系统。独立运行的 PWA，数据保存在本机（IndexedDB），断网可用。

## 当前阶段：第二阶段 MVP（v0.2.0）

已完成：控制台、词汇、语法（A1–C2 预置目录）、表达、句子、错误库、学习计划与计时、能力评估（CEFR 分项）、FSRS 间隔复习、JSON/CSV/Quizlet 导入导出、AI JSON 导入（带预览与去重）、完整备份与恢复、离线与安装。

下一阶段：Supabase 云同步（第三阶段），然后是听说读写训练、DELF/DALF、沉浸模块（第四阶段）和 Prompt 库（第五阶段）。

## 开发

```bash
npm install
npm run dev          # 本地开发
npm test             # 单元测试（数据层、复习算法、导入导出）
npm run test:e2e     # 端到端测试（桌面 + iPhone 尺寸，需要 Chrome）
npm run build        # 生产构建，输出到 dist/
```

推送到 `main` 分支后，GitHub Actions 会先跑单元测试，再构建并发布到 GitHub Pages。

## 结构

```
src/
  db/          类型、数据库（Dexie）、数据规则、增删改查
  io/          备份 / CSV / Quizlet / AI JSON 导入
  srs.ts       FSRS 复习调度
  data/seed.ts 语法目录与 CEFR 能力描述
  features/    快速记录、计时、导入预览、统计
  pages/       各页面
e2e/           Playwright 测试
docs/          测试报告
```

## 数据原则

- 计划（时间块）、活动（学习记录、复习）、能力（评估）三套数据分开存储，等级只来自带证据的评估。
- 每条记录都有 `id / createdAt / updatedAt / deletedAt / rev`，删除是软删除，为云同步做准备。
- 名词必须有阴阳性；导入从不覆盖已有记录；错误要在之后的练习里用对 2 次且相隔 7 天以上才算解决。
