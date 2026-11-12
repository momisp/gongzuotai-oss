-- ============================================
-- 用户地域分析 - 活跃用户
-- ============================================
-- 说明：统计指定日期范围内有登录行为的用户地域分布
-- 活跃用户定义：在 user_day_login 表中有记录的用户
-- 统计方式：按 userId 去重（同一用户多日登录只计一次）
-- 排除：内部人员（isInternal = 1）
-- 参数：修改下方日期范围为实际查询区间
-- ============================================

SELECT 
    -- 省份：取 region 第一个空格前的部分
    CASE 
        WHEN u.`region` IS NULL OR TRIM(u.`region`) = '' THEN '未知'
        ELSE SUBSTRING_INDEX(u.`region`, ' ', 1)
    END AS province,
    -- 活跃用户数量（去重）
    COUNT(DISTINCT u.`userId`) AS cnt
FROM `yyz_big_party`.`user_day_login` l
INNER JOIN `yyz_big_party`.`user` u ON u.`userId` = l.`userId`
WHERE l.`createdAt` >= '2026-03-20 00:00:00'
  AND l.`createdAt` < '2026-03-21 00:00:00'
  AND u.`isInternal` = 0
GROUP BY province
ORDER BY cnt DESC;

-- ============================================
-- 可选：按「省+市」统计活跃用户（去重）
-- ============================================
/*
SELECT 
    CASE 
        WHEN u.`region` IS NULL OR TRIM(u.`region`) = '' THEN '未知'
        ELSE SUBSTRING_INDEX(u.`region`, ' ', 2)
    END AS region_city,
    COUNT(DISTINCT u.`userId`) AS cnt
FROM `yyz_big_party`.`user_day_login` l
INNER JOIN `yyz_big_party`.`user` u ON u.`userId` = l.`userId`
WHERE l.`createdAt` >= '2026-03-20 00:00:00'
  AND l.`createdAt` < '2026-03-21 00:00:00'
  AND u.`isInternal` = 0
GROUP BY region_city
ORDER BY cnt DESC;
*/
