# -*- coding: utf-8 -*-
import pandas as pd
import json
from collections import defaultdict

wx_path = r'c:\Users\yzyz\Desktop\微信支付账单流水文件(20260101-20260601)_20260601114429.xlsx'
alipay_path = r'c:\Users\yzyz\Desktop\支付宝交易明细(20260101-20260601) (1).csv'
out_path = r'c:\Users\yzyz\Desktop\静态工具网站\analysis_report.json'


def parse_amount(x):
    if pd.isna(x):
        return 0.0
    s = str(x).replace('¥', '').replace(',', '').strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def load_wechat():
    df_raw = pd.read_excel(wx_path, sheet_name=0, header=None)
    header_row = next(
        i for i, row in df_raw.iterrows()
        if any('交易时间' in str(v) for v in row.values if pd.notna(v))
    )
    df = pd.read_excel(wx_path, sheet_name=0, header=header_row)
    df = df.dropna(subset=['交易时间'])
    df['金额'] = df['金额(元)'].apply(parse_amount)
    df['日期'] = pd.to_datetime(df['交易时间'], errors='coerce')
    df['月份'] = df['日期'].dt.strftime('%Y-%m')
    return df


def load_alipay():
    with open(alipay_path, 'r', encoding='gbk') as f:
        lines = f.readlines()
    data_start = next(i for i, line in enumerate(lines) if line.startswith('交易时间'))
    df = pd.read_csv(alipay_path, encoding='gbk', skiprows=data_start)
    df = df.dropna(subset=['交易时间'])
    df['金额_num'] = df['金额'].apply(parse_amount)
    df['日期'] = pd.to_datetime(
        df['交易时间'].astype(str).str.replace('/', '-', regex=False),
        errors='coerce',
    )
    df['月份'] = df['日期'].dt.strftime('%Y-%m')
    return df


def monthly_summary(df, amount_col, type_col='收/支'):
    exp = df[df[type_col] == '支出']
    inc = df[df[type_col] == '收入']
    months = sorted(set(exp['月份'].dropna()) | set(inc['月份'].dropna()))
    result = {}
    for m in months:
        sub = df[df['月份'] == m]
        result[m] = {
            'expense': round(sub[sub[type_col] == '支出'][amount_col].sum(), 2),
            'income': round(sub[sub[type_col] == '收入'][amount_col].sum(), 2),
            'count': len(sub),
        }
    return result


def top_group(df, group_col, amount_col, n=10, filter_expense=True):
    data = df[df['收/支'] == '支出'] if filter_expense else df
    grp = data.groupby(group_col)[amount_col].agg(['sum', 'count']).sort_values('sum', ascending=False).head(n)
    return {str(k): {'amount': round(v['sum'], 2), 'count': int(v['count'])} for k, v in grp.iterrows()}


TEA_PATTERN = '泉源|圣香缘'

SALARY = {
    '2026-01': 9721.65,
    '2026-02': 10042.96,
    '2026-03': 8802.674,
    '2026-04': 8162.271,
    '2026-05': 8456.244,
}


def is_tea(df, col='交易对方'):
    return df[col].str.contains(TEA_PATTERN, na=False)


def main():
    df_wx = load_wechat()
    df_ali = load_alipay()
    df_wx['is_tea'] = is_tea(df_wx)
    df_ali['is_tea'] = is_tea(df_ali)

    wx_exp = df_wx[df_wx['收/支'] == '支出']
    wx_inc = df_wx[df_wx['收/支'] == '收入']
    ali_exp = df_ali[df_ali['收/支'] == '支出']
    ali_inc = df_ali[df_ali['收/支'] == '收入']
    ali_neutral = df_ali[df_ali['收/支'] == '不计收支']

    wx_monthly = monthly_summary(df_wx, '金额')
    ali_monthly = monthly_summary(df_ali, '金额_num')

    combined_monthly = {}
    all_months = sorted(set(wx_monthly) | set(ali_monthly))
    for m in all_months:
        w = wx_monthly.get(m, {'expense': 0, 'income': 0, 'count': 0})
        a = ali_monthly.get(m, {'expense': 0, 'income': 0, 'count': 0})
        combined_monthly[m] = {
            'expense': round(w['expense'] + a['expense'], 2),
            'income': round(w['income'] + a['income'], 2),
            'wechat_expense': w['expense'],
            'alipay_expense': a['expense'],
            'count': w['count'] + a['count'],
        }

    tea_wx = wx_exp[wx_exp['交易对方'].str.contains('泉源|圣香缘', na=False)]
    tea_ali = ali_exp[ali_exp['交易对方'].str.contains('泉源|圣香缘', na=False)]

    transfer_wx = wx_exp[wx_exp['交易类型'].str.contains('转账|红包', na=False)]
    scan_wx = wx_exp[wx_exp['交易类型'].str.contains('扫二维码', na=False)]
    merchant_wx = wx_exp[wx_exp['交易类型'] == '商户消费']

    digital = ali_exp[
        ali_exp['交易对方'].str.contains(
            '米哈游|Cursor|Stripe|哔哩|电信|国网|宇宙派队', case=False, na=False
        )
    ]
    insurance = ali_exp[ali_exp['交易分类'] == '保险']
    transport = ali_exp[ali_exp['交易分类'] == '交通出行']
    hotel = ali_exp[ali_exp['交易分类'] == '酒店旅游']

    small_wx = wx_exp[wx_exp['金额'] < 50]
    small_ali = ali_exp[ali_exp['金额_num'] < 50]

    report = {
        'overview': {
            'period': '2026-01-01 至 2026-06-01',
            'days': 152,
            'wechat_expense': round(wx_exp['金额'].sum(), 2),
            'wechat_income': round(wx_inc['金额'].sum(), 2),
            'alipay_expense': round(ali_exp['金额_num'].sum(), 2),
            'alipay_income': round(ali_inc['金额_num'].sum(), 2),
            'alipay_neutral': round(ali_neutral['金额_num'].sum(), 2),
            'combined_expense': round(wx_exp['金额'].sum() + ali_exp['金额_num'].sum(), 2),
            'combined_income': round(wx_inc['金额'].sum() + ali_inc['金额_num'].sum(), 2),
            'daily_avg_expense': round((wx_exp['金额'].sum() + ali_exp['金额_num'].sum()) / 152, 2),
            'monthly_avg_expense': round((wx_exp['金额'].sum() + ali_exp['金额_num'].sum()) / 6, 2),
        },
        'monthly': combined_monthly,
        'wechat_monthly': wx_monthly,
        'alipay_monthly': ali_monthly,
        'category': {
            'wechat_by_type': top_group(df_wx, '交易类型', '金额', 10),
            'alipay_by_category': top_group(df_ali, '交易分类', '金额_num', 15),
        },
        'highlights': {
            'tea_total': {
                'wechat': round(tea_wx['金额'].sum(), 2),
                'alipay': round(tea_ali['金额_num'].sum(), 2),
                'combined': round(tea_wx['金额'].sum() + tea_ali['金额_num'].sum(), 2),
                'pct_of_total': round(
                    (tea_wx['金额'].sum() + tea_ali['金额_num'].sum())
                    / (wx_exp['金额'].sum() + ali_exp['金额_num'].sum())
                    * 100,
                    1,
                ),
                'transactions': len(tea_wx) + len(tea_ali),
            },
            'transfer_redpacket_wechat': {
                'amount': round(transfer_wx['金额'].sum(), 2),
                'count': len(transfer_wx),
            },
            'insurance_alipay': {
                'amount': round(insurance['金额_num'].sum(), 2),
                'count': len(insurance),
            },
            'digital_services_alipay': {
                'amount': round(digital['金额_num'].sum(), 2),
                'count': len(digital),
                'breakdown': top_group(digital, '交易对方', '金额_num', 8, False),
            },
            'small_expenses_under_50': {
                'wechat_amount': round(small_wx['金额'].sum(), 2),
                'wechat_count': len(small_wx),
                'alipay_amount': round(small_ali['金额_num'].sum(), 2),
                'alipay_count': len(small_ali),
            },
        },
        'top_merchants': {
            'wechat': top_group(df_wx, '交易对方', '金额', 12),
            'alipay': top_group(df_ali, '交易对方', '金额_num', 12),
        },
        'payment_methods': {
            'wechat': top_group(df_wx, '支付方式', '金额', 5),
            'alipay_simplified': {},
        },
        'large_transactions': {
            'wechat_over_500': wx_exp[wx_exp['金额'] >= 500]
            .sort_values('金额', ascending=False)[['交易时间', '交易对方', '交易类型', '金额']]
            .head(15)
            .astype(str)
            .to_dict('records'),
            'alipay_over_500': ali_exp[ali_exp['金额_num'] >= 500]
            .sort_values('金额_num', ascending=False)[['交易时间', '交易对方', '交易分类', '金额_num']]
            .head(15)
            .astype(str)
            .to_dict('records'),
        },
    }

    # Simplify alipay payment methods
    ali_pay = ali_exp.copy()
    ali_pay['卡'] = ali_pay['收/付款方式'].astype(str).str.extract(r'(招商银行信用卡\(4429\)|中信银行储蓄卡\(6848\)|零钱)')[0]
    ali_pay['卡'] = ali_pay['卡'].fillna('其他')
    report['payment_methods']['alipay_simplified'] = top_group(ali_pay, '卡', '金额_num', 5)

    # Revised: exclude tea (credit card round-trip), include salary
    wx_real = wx_exp[~wx_exp['is_tea']]
    ali_real = ali_exp[~ali_exp['is_tea']]
    tea_total = wx_exp[wx_exp['is_tea']]['金额'].sum() + ali_exp[ali_exp['is_tea']]['金额_num'].sum()

    revised_monthly = {}
    months = sorted(set(report['monthly']) | set(SALARY))
    for m in months:
        wx_m = wx_exp[wx_exp['月份'] == m]
        ali_m = ali_exp[ali_exp['月份'] == m]
        tea_m = wx_m[wx_m['is_tea']]['金额'].sum() + ali_m[ali_m['is_tea']]['金额_num'].sum()
        orig_m = wx_m['金额'].sum() + ali_m['金额_num'].sum()
        real_m = orig_m - tea_m
        sal = SALARY.get(m, 0)
        revised_monthly[m] = {
            'salary': sal,
            'original_expense': round(orig_m, 2),
            'tea_excluded': round(tea_m, 2),
            'real_expense': round(real_m, 2),
            'balance': round(sal - real_m, 2),
        }

    salary_total = sum(SALARY.values())
    real_expense_total = wx_real['金额'].sum() + ali_real['金额_num'].sum()
    wx_income = wx_inc['金额'].sum()

    report['revised'] = {
        'note': '茶叶为信用卡刷出还入，不计入实际支出；工资为图中1-5月实际所得',
        'tea_excluded_total': round(tea_total, 2),
        'real_expense_total': round(real_expense_total, 2),
        'salary_total_jan_may': round(salary_total, 2),
        'wechat_misc_income': round(wx_income, 2),
        'monthly': revised_monthly,
        'real_expense_by_category': {
            'wechat_type': top_group(wx_real, '交易类型', '金额', 10, False),
            'alipay_category': top_group(ali_real, '交易分类', '金额_num', 15, False),
        },
    }
    # fix net: salary + misc income - real expense (jan-may only for salary)
    jan_may_exp = sum(v['real_expense'] for k, v in revised_monthly.items() if k != '2026-06')
    report['revised']['net_surplus_jan_may'] = round(salary_total + wx_income - jan_may_exp, 2)
    report['revised']['savings_rate'] = round(report['revised']['net_surplus_jan_may'] / salary_total * 100, 1)

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(json.dumps(report['revised'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
