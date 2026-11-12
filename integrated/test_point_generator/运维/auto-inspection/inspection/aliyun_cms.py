"""云监控：ECS CPU 最近一次指标（可选）"""
from __future__ import annotations

import json
from typing import Any

from aliyunsdkcore.client import AcsClient
from aliyunsdkcore.request import CommonRequest

from inspection.config import AccountCfg
from inspection.models import Finding, Level


def _client(account: AccountCfg, region: str) -> AcsClient:
    return AcsClient(account.access_key_id, account.access_key_secret, region)


def _describe_metric_raw(
    client: AcsClient,
    region: str,
    namespace: str,
    metric_name: str,
    dimensions: dict[str, Any],
) -> dict[str, Any] | None:
    req = CommonRequest()
    req.set_accept_format("json")
    req.set_domain(f"metrics.{region}.aliyuncs.com")
    req.set_version("2019-01-01")
    req.set_action_name("DescribeMetricLast")
    req.set_method("POST")
    req.add_query_param("Namespace", namespace)
    req.add_query_param("MetricName", metric_name)
    req.add_query_param("Period", "60")
    dims = json.dumps([dimensions], separators=(",", ":"))
    req.add_query_param("Dimensions", dims)
    try:
        body_raw = client.do_action_with_exception(req)
        return json.loads(body_raw.decode("utf-8"))
    except Exception:
        return None


def _describe_metric_last(client: AcsClient, region: str, instance_id: str) -> dict[str, Any] | None:
    """CPUUtilization"""
    return _describe_metric_raw(
        client,
        region,
        "acs_ecs_dashboard",
        "CPUUtilization",
        {"instanceId": instance_id},
    )


def fetch_ecs_metric_percent(
    client: AcsClient,
    region: str,
    instance_id: str,
    metric_name: str,
    extra_dims: dict[str, Any] | None = None,
) -> float | None:
    dims: dict[str, Any] = {"instanceId": instance_id}
    if extra_dims:
        dims.update(extra_dims)
    resp = _describe_metric_raw(client, region, "acs_ecs_dashboard", metric_name, dims)
    return _parse_cpu_value(resp)


def describe_metric_raw(
    client: AcsClient,
    region: str,
    namespace: str,
    metric_name: str,
    dimensions: dict[str, Any],
) -> dict[str, Any] | None:
    return _describe_metric_raw(client, region, namespace, metric_name, dimensions)


def _parse_cpu_value(resp: dict[str, Any] | None) -> float | None:
    if not resp:
        return None
    d = resp.get("Datapoints")
    if isinstance(d, str):
        try:
            arr = json.loads(d)
        except json.JSONDecodeError:
            return None
    elif isinstance(d, list):
        arr = d
    else:
        return None
    if not arr:
        return None
    last = arr[-1]
    v = last.get("Average") if isinstance(last, dict) else last.get("Value")
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def run_cms_cpu_for_instances(
    account: AccountCfg,
    instance_ids_by_region: dict[str, list[str]],
    cpu_warn: float,
    cpu_critical: float,
) -> list[Finding]:
    findings: list[Finding] = []
    for region, ids in instance_ids_by_region.items():
        client = _client(account, region)
        for iid in ids:
            resp = _describe_metric_last(client, region, iid)
            cpu = _parse_cpu_value(resp)
            if cpu is None:
                findings.append(
                    Finding(
                        account=account.name,
                        region=region,
                        category="cms",
                        name=f"{iid}/CPU",
                        resource_id=iid,
                        level=Level.INFO,
                        summary="未取到 CPUUtilization 最近点（可能无监控、无权限或实例过新）",
                        annotation="自动批注：请在 RAM 中授予 cms:DescribeMetricLast；或云监控是否已安装 agent。",
                    )
                )
                continue

            lvl = Level.OK
            ann = f"自动批注：最近 CPU 利用率约 {cpu:.1f}%，在正常范围。"
            if cpu >= cpu_critical:
                lvl = Level.CRITICAL
                ann = (
                    f"自动批注：CPU 约 {cpu:.1f}% >= 临界值 {cpu_critical:.0f}%。【预警】"
                    "建议立刻查看进程、扩容或限流。"
                )
            elif cpu >= cpu_warn:
                lvl = Level.WARN
                ann = (
                    f"自动批注：CPU 约 {cpu:.1f}% 超过警戒 {cpu_warn:.0f}%。【预警】"
                    "建议关注趋势并准备扩容。"
                )

            findings.append(
                Finding(
                    account=account.name,
                    region=region,
                    category="cms",
                    name=f"{iid}/CPU",
                    resource_id=iid,
                    level=lvl,
                    summary=f"CPUUtilization≈{cpu:.1f}%",
                    annotation=ann,
                    raw={"response": resp},
                )
            )
    return findings
