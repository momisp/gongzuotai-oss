import { test, expect, type Page } from '@playwright/test';

const BASE_URL = "http://pack.example.com/index";
const DEMO_ACCOUNT = 'east_center';
const DEMO_PASSWORD = 'demo123456';

test.use({ baseURL: BASE_URL });

async function gotoEntry(page: Page) {
  await page.goto(BASE_URL);
}

async function login(page: Page) {
  await gotoEntry(page);
  const loginButton = page.getByRole('button', { name: '登 录' });
  if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.locator('#account').fill(DEMO_ACCOUNT);
    await page.locator('#password').fill(DEMO_PASSWORD);
    await loginButton.click();
  }
  await expect(page.getByText('今日渠道玩家注册', { exact: true })).toBeVisible({
    timeout: 15000,
  });
}

test.describe('遨游龙翔商务管理平台', () => {
  test('打开入口应展示登录页', async ({ page }) => {
    await gotoEntry(page);
    await expect(page.getByText('欢迎登录', { exact: true })).toBeVisible();
    await expect(page.getByText('请输入您的商务账号以继续', { exact: true })).toBeVisible();
    await expect(page.locator('#account')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: '登 录' })).toBeVisible();
  });

  test('账号与密码为空时不能登录', async ({ page }) => {
    await gotoEntry(page);
    await page.getByRole('button', { name: '登 录' }).click();
    await expect(page.getByText('请输入商务账号', { exact: true })).toBeVisible();
    await expect(page.getByText('请输入登录密码', { exact: true })).toBeVisible();
    await expect(page.getByText('欢迎登录', { exact: true })).toBeVisible();
  });

  test('演示账号登录成功进入工作台', async ({ page }) => {
    await login(page);
    await expect(page.getByText('工作台', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('华东推广中心', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('最后更新', { exact: true })).toBeVisible();
  });

  test('工作台应展示核心指标与AI预警', async ({ page }) => {
    await login(page);
    await expect(page.getByText('今日渠道玩家注册', { exact: true })).toBeVisible();
    await expect(page.getByText('今日渠道活跃玩家', { exact: true })).toBeVisible();
    await expect(page.getByText('今日充值金额', { exact: true })).toBeVisible();
    await expect(page.getByText('本月充值金额', { exact: true })).toBeVisible();
    await expect(page.getByText('活跃渠道数', { exact: true })).toBeVisible();
    await expect(page.getByText('新增渠道数', { exact: true })).toBeVisible();
    await expect(page.getByText('AI 实时预警', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '查看全部' }).or(page.getByText('查看全部', { exact: true }))).toBeVisible();
  });

  test('侧栏导航到商务列表', async ({ page }) => {
    await login(page);
    await page.getByText('商务列表', { exact: true }).click();
    await expect(page.getByText('商务列表', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('所属平台', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('商务账号', { exact: true }).first()).toBeVisible();
  });

  test('侧栏导航到渠道列表', async ({ page }) => {
    await login(page);
    await page.getByText('渠道列表', { exact: true }).click();
    await expect(page.getByText('渠道列表', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('所属平台', { exact: true }).first()).toBeVisible();
  });

  test('勾选身份证去重后注册玩家数指标应变化', async ({ page }) => {
    await login(page);
    const regCard = page.locator('.stat-card').filter({ hasText: '今日渠道玩家注册' });
    const regValue = regCard.locator('.stat-value, #regCountValue').first();
    await expect(regValue).toBeVisible();
    const before = (await regValue.innerText()).replace(/,/g, '').trim();

    const dedupCheckbox = page.getByRole('checkbox', { name: '身份证去重' });
    await dedupCheckbox.check();
    await expect(dedupCheckbox).toBeChecked();

    await expect
      .poll(async () => (await regValue.innerText()).replace(/,/g, '').trim())
      .not.toBe(before);

    await dedupCheckbox.uncheck();
    await expect
      .poll(async () => (await regValue.innerText()).replace(/,/g, '').trim())
      .toBe(before);
  });

  test('点击AI预警查看全部应跳转预警列表', async ({ page }) => {
    await login(page);
    const viewAll = page.getByRole('link', { name: '查看全部' }).or(page.getByText('查看全部', { exact: true }));
    await viewAll.click();
    await expect(page.getByText('预警列表', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('所属平台', { exact: true }).first()).toBeVisible();
  });
});