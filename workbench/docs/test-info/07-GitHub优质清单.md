# GitHub / 网络公开资料推荐

测试信息的来源 = **本地**（手册、课件、扫描）+ **网络**（本页与「外部链接」）。

下列均可在 **测试信息 → 外部链接** 一键打开（已写入 `data/test_info_config.json`）。

## 测试「学习区」推荐（类似前端的 MDN）

测试没有唯一官方 MDN，常用组合是：

1. **[Test Automation University](https://testautomationu.applitools.com/)** — 免费分课，最像「点开就能学」  
2. **[Ministry of Testing Courses](https://www.ministryoftesting.com/courses)** — 入门与现代测试思维  
3. **[ISTQB Glossary](https://glossary.istqb.org/)** — 查标准术语（像 MDN 查概念）  
4. **[roadmap.sh/qa](https://roadmap.sh/qa)** — 总览还该学什么  

完整中文路径仍用本工作台：`11-测试知识学习目录.md`。

## 按学习层级（配合 `11-测试知识学习目录.md`）

| 层级 | 推荐网络来源 |
|------|----------------|
| L0 认知 | [MoT 入门课](https://www.ministryoftesting.com/courses/essentials-introduction-to-software-development-and-testing) · [roadmap.sh/qa](https://roadmap.sh/qa) · [ISTQB Glossary](https://glossary.istqb.org/) · [MoT](https://www.ministryoftesting.com/) |
| L1 手工 | [Google Testing Blog](https://testing.googleblog.com/) · [Front-End Checklist](https://github.com/thedaviddias/Front-End-Checklist) · [Production Ready Checklist](https://github.com/PrekshaShah2509/production-ready-checklist) |
| L2 用例/协作 | [ISTQB Foundation](https://www.istqb.org/certifications/certified-tester-foundation-level) · [Preflight Playbook](https://github.com/penguinboi/preflight-checks/blob/main/production-readiness-playbook.md) |
| L3 技术底子 | [MDN HTTP](https://developer.mozilla.org/zh-CN/docs/Web/HTTP) · [SQLBolt](https://sqlbolt.com/) · [Postman Learning](https://learning.postman.com/docs/getting-started/introduction/) · [Linux Journey](https://linuxjourney.com/) |
| L4 专项 | [Playwright](https://playwright.dev/docs/intro) · [Test Automation U](https://testautomationu.applitools.com/) · [JMeter](https://jmeter.apache.org/usermanual/index.html) · [OWASP Top 10](https://owasp.org/www-project-top-ten/) · [WSTG](https://owasp.org/www-project-web-security-testing-guide/) |
| L5 成熟度 | [Google Testing Blog](https://testing.googleblog.com/) · [Martin Fowler · Testing](https://martinfowler.com/testing/) |

## 清单类（发版/上线）

1. **[production-ready-checklist](https://github.com/PrekshaShah2509/production-ready-checklist)** — 安全/性能/测试/监控  
2. **[preflight-checks Playbook](https://github.com/penguinboi/preflight-checks/blob/main/production-readiness-playbook.md)** — 八项审计提纲  
3. **[Front-End Checklist](https://github.com/thedaviddias/Front-End-Checklist)** / [Performance](https://github.com/thedaviddias/Front-End-Performance-Checklist)

## 使用建议

- **本地建框架，网络补深度**：先手册中文要点，再点开官方文档  
- 不要整份照搬清单：挑与业务相关的条目进项目 Wiki  
- 发现好站点：在 `data/test_info_config.json` 的 `external_links` 追加后，测试信息点「刷新」
