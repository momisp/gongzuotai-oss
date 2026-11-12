# -*- encoding=utf8 -*-
"""OA 绑定审核 · Airtest 占位脚本。

等 OA 客户端「绑定审核」业务通了之后：
1. 用 AirtestIDE 录制：打开 OA → 绑定审核 → 通过 / 驳回
2. 把真实步骤替换本文件
3. 在 data/smoke_plans.json 把 oaAudit.mode 切到 airtest，airtest.enabled=true
4. 再让工作台把本脚本串进冒烟（S8/S9）

当前执行会主动失败，避免误当成已接通。
"""
from airtest.core.api import *  # noqa: F401,F403

auto_setup(__file__)

# TODO: 替换为真实桌面流程
# 例如：
# connect_device("Windows:///")
# touch(Template(r"tpl_bind_tab.png", record_pos=(0.1, -0.2), resolution=(1920, 1080)))
# touch(Template(r"tpl_approve.png", ...))

raise NotImplementedError(
    "OA Airtest 审核脚本尚未录制。业务通了后再补通过/驳回步骤，并接入冒烟 S8/S9。"
)
