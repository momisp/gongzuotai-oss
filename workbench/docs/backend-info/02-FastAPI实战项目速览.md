# FastAPI 实战项目速览

对应本地：`C:\Users\yzyz\Desktop\后端学习用\main.py`（及相关依赖）。

## 项目在练什么

一个小型「内容 + 商城」后端雏形，适合把接口、数据库、登录串起来。

| 模块 | 你能练到 |
|------|----------|
| 用户 | 注册、登录、密码哈希（bcrypt） |
| 鉴权 | JWT（OAuth2 Password）、受保护接口 |
| 文章 / 评论 | CRUD 思路、用户关联 |
| 商品 / 订单 | 业务表设计、状态字段 |
| 数据库 | MySQL + SQLAlchemy ORM、启动补列 |

## 建议动手顺序

1. 配好 MySQL，改连接串（学习环境用本地库，密码勿外传）  
2. `uvicorn main:app --reload --host 0.0.0.0 --port 8000`  
3. 打开 `/docs`，按标签试接口  
4. 登录拿 token → Authorize → 再调需登录接口  
5. 用客户端或 SQL 工具对照表数据  

## 学完自检

- [ ] 能解释：路由、Pydantic 模型、Depends 各干什么  
- [ ] 能说出 JWT 放在哪个 Header  
- [ ] 能画：用户 → 文章 author_id → 评论 的关系  
- [ ] 故意输错密码 / 过期 token，看到对应错误码  

## 下一步

本机跑通后，进入《运维学习清单》把同一项目部署到远程笔记本（WSL / 宝塔任选一条路）。

详细步骤：`运维学习清单-远程版.md` · `宝塔Windows版-FastAPI部署指南.md`
