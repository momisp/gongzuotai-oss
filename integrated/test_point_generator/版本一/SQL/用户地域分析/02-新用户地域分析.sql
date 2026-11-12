-- ============================================
-- 用户地域分析 - 新用户
-- ============================================
-- 说明：统计指定日期范围内新注册用户的地域分布
-- 新用户定义：createdAt 在指定日期范围内的用户
-- 排除：内部人员（isInternal = 1）
-- 参数：修改下方日期范围为实际查询区间
-- ============================================

SELECT 
    -- 省份：取 region 第一个空格前的部分
    CASE 
        WHEN u.`region` IS NULL OR TRIM(u.`region`) = '' THEN '未知'
        ELSE SUBSTRING_INDEX(u.`region`, ' ', 1)
    END AS province,
    -- 新用户数量
    COUNT(*) AS cnt
FROM `yyz_big_party`.`user` u
WHERE u.`isInternal` = 0
  AND u.`createdAt` >= '2026-03-20 00:00:00'
  AND u.`createdAt` < '2026-03-21 00:00:00'
GROUP BY province
ORDER BY cnt DESC;

-- ============================================
-- 可选：按「省+市」统计新用户
-- ============================================
/*
SELECT 
    CASE 
        WHEN u.`region` IS NULL OR TRIM(u.`region`) = '' THEN '未知'
        ELSE SUBSTRING_INDEX(u.`region`, ' ', 2)
    END AS region_city,
    COUNT(*) AS cnt
FROM `yyz_big_party`.`user` u
WHERE u.`isInternal` = 0
  AND u.`createdAt` >= '2026-03-20 00:00:00'
  AND u.`createdAt` < '2026-03-21 00:00:00'
GROUP BY region_city
ORDER BY cnt DESC;
*/
