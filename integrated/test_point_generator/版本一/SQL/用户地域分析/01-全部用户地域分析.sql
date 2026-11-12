-- ============================================
-- 用户地域分析 - 全部用户
-- ============================================
-- 说明：统计全部用户的地域分布，按省份分组
-- 排除：内部人员（isInternal = 1）
-- ============================================

SELECT 
    -- 省份：取 region 第一个空格前的部分
    CASE 
        WHEN u.`region` IS NULL OR TRIM(u.`region`) = '' THEN '未知'
        ELSE SUBSTRING_INDEX(u.`region`, ' ', 1)
    END AS province,
    -- 用户数量
    COUNT(*) AS cnt
FROM `yyz_big_party`.`user` u
WHERE u.`isInternal` = 0
GROUP BY province
ORDER BY cnt DESC;

-- ============================================
-- 可选：按「省+市」统计（更细粒度）
-- ============================================
/*
SELECT 
    CASE 
        WHEN u.`region` IS NULL OR TRIM(u.`region`) = '' THEN '未知'
        -- 省+市：取前两个空格分隔的部分，不足则取已有部分
        ELSE SUBSTRING_INDEX(u.`region`, ' ', 2)
    END AS region_city,
    COUNT(*) AS cnt
FROM `yyz_big_party`.`user` u
WHERE u.`isInternal` = 0
GROUP BY region_city
ORDER BY cnt DESC;
*/
