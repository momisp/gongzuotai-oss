"""阿里云 ECS 实例状态与到期巡检"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from aliyunsdkcore.client import AcsClient
from aliyunsdkcore.request import CommonRequest

from inspection.config import AccountCfg
from inspection.models import Finding, Level


def _client(account: AccountCfg, region: str) -> AcsClient:
    return AcsClient(account.access_key_id, account.access_key_secret, region)


def _describe_instances(client: AcsClient, region: str) -> list[dict[str, Any]]:
    """使用 CommonRequest 避免不同 SDK 版本类名差异"""
    req = CommonRequest()
    req.set_accept_format("json")
    req.set_domain(f"ecs.{region}.aliyuncs.com")
    req.set_version("2014-05-26")
    req.set_action_name("DescribeInstances")
    req.set_method("POST")
    req.add_query_param("PageNumber", "1")
    req.add_query_param("PageSize", "100")
    body_raw = client.do_action_with_exception(req)
    body = json.loads(body_raw.decode("utf-8"))
    items = body.get("Instances", {}).get("Instance") or []
    # 简单分页：若超过 100 台再扩展 PageNumber
    return items


def _match_filters(name: str, filters: list[str]) -> bool:
    if not filters:
        return True
    return any(k in (name or "") for k in filters)


def _parse_utc(s: str | None) -> datetime | None:
    if not s:
        return None
    # API 常见: 2027-03-14T16:00Z
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def run_ecs_checks(
    account: AccountCfg,
    instance_name_filters: list[str],
    expire_warn_days: int,
    expire_critical_days: int,
) -> tuple[list[Finding], dict[str, list[str]], list[tuple[str, dict[str, Any]]]]:
    """返回 (Findings, 区域->实例 ID 列表, 过滤后的实例快照列表)。"""
    out: list[Finding] = []
    ids_by_region: dict[str, list[str]] = {}
    snapshots: list[tuple[str, dict[str, Any]]] = []
    now = datetime.now(timezone.utc)

    for region in account.regions:
        try:
            client = _client(account, region)
            instances = _describe_instances(client, region)
        except Exception as e:  # noqa: BLE001
            out.append(
                Finding(
                    account=account.name,
                    region=region,
                    category="ecs",
                    name="DescribeInstances",
                    resource_id="-",
                    level=Level.WARN,
                    summary=f"拉取实例列表失败: {e!s}",
                    annotation="自动批注：请检查 AK 权限是否包含 ecs:DescribeInstances，或本区域是否开通 VPC/ECS。",
                )
            )
            continue

        for inst in instances:
            name = inst.get("InstanceName") or ""
            iid = inst.get("InstanceId") or ""
            if not _match_filters(name, instance_name_filters):
                continue

            ids_by_region.setdefault(region, []).append(iid)
            snapshots.append((region, dict(inst)))
            status = (inst.get("Status") or "").lower()
            st_ann = "实例运行状态正常。"
            lvl = Level.OK
            if status != "running":
                lvl = Level.WARN
                st_ann = f"自动批注：状态为 {status}，非 running，请关注是否在维护或已关机。"

            out.append(
                Finding(
                    account=account.name,
                    region=region,
                    category="ecs",
                    name=name or iid,
                    resource_id=iid,
                    level=lvl,
                    summary=f"状态={inst.get('Status')} CPU={inst.get('Cpu')} 内存MB={inst.get('Memory')}",
                    annotation=st_ann,
                    raw={"instance": inst},
                )
            )

            exp = _parse_utc(inst.get("ExpiredTime"))
            if exp:
                days = (exp - now).days
                elvl = Level.OK
                ann = f"自动批注：包年包月到期时间 {inst.get('ExpiredTime')}，剩余约 {days} 天。"
                if days <= expire_critical_days:
                    elvl = Level.CRITICAL
                    ann += " 【预警】已进入临界续费窗口，请尽快续费或迁移。"
                elif days <= expire_warn_days:
                    elvl = Level.WARN
                    ann += " 【预警】临近到期，请提前安排续费与预算。"

                out.append(
                    Finding(
                        account=account.name,
                        region=region,
                        category="ecs",
                        name=f"{name or iid}/到期",
                        resource_id=iid,
                        level=elvl,
                        summary=f"ExpiredTime={inst.get('ExpiredTime')} 剩余天数≈{days}",
                        annotation=ann,
                        raw={},
                    )
                )

    return out, ids_by_region, snapshots
