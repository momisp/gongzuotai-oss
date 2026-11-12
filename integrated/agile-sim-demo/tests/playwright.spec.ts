import { test, expect, type Page, type FrameLocator } from '@playwright/test';

const BASE_URL = "http://192.168.0.85:81/login?redirect=%252Findex";
const DEMO_ACCOUNT = 'east_center';
const DEMO_PASSWORD = 'demo123456';

type AppRoot = Page | FrameLocator;

test.use({ baseURL: BASE_URL });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('biz_login_user');
    localStorage.removeItem('gd_cur_user');
    localStorage.removeItem('biz_login_account');
  });
});

async function getAppRoot(page: Page): Promise<AppRoot> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const readySelector = '#pwdLogin, #account, #loginBtn, .sidebar, .stat-card';
  const iframe = page.locator('iframe').first();

  if ((await iframe.count()) > 0) {
    await iframe.waitFor({ state: 'attached', timeout: 15000 });
    const app = page.frameLocator('iframe').first();
    await app.locator(readySelector).first().waitFor({ state: 'visible', timeout: 20000 });
    return app;
  }

  await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 20000 });
  return page;
}

function loginPanel(app: AppRoot) {
  return app.locator('#pwdLogin');
}

async function login(page: Page) {
  const app = await getAppRoot(page);
  const loginBtn = app.locator('#loginBtn');

  if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginPanel(app).locator('#account').fill(DEMO_ACCOUNT);
    await loginPanel(app).locator('#password').fill(DEMO_PASSWORD);
    await loginBtn.click();
  }

  await expect(app.getByText('今日渠道玩家注册', { exact: true })).toBeVisible({
    timeout: 15000,
  });
}

test.describe('遨游龙翔商务管理平台', () => {
  test('打开入口应展示登录页', async ({ page }) => {
    const app = await getAppRoot(page);
    const panel = loginPanel(app);

    await expect(panel.getByText('欢迎登录', { exact: true })).toBeVisible();
    await expect(panel.getByText('请输入您的商务账号以继续', { exact: true })).toBeVisible();
    await expect(panel.locator('#account')).toBeVisible();
    await expect(panel.locator('#password')).toBeVisible();
    await expect(app.locator('#loginBtn')).toBeVisible();
  });

  test('账号与密码为空时不能登录', async ({ page }) => {
    const app = await getAppRoot(page);
    const panel = loginPanel(app);

    await app.locator('#loginBtn').click();
    await expect(panel.locator('#errAccount')).toHaveText('请输入商务账号');
    await expect(panel.locator('#errPassword')).toHaveText('请输入登录密码');
    await expect(panel.getByText('欢迎登录', { exact: true })).toBeVisible();
  });

  test('演示账号登录成功进入工作台', async ({ page }) => {
    await login(page);
    const app = await getAppRoot(page);

    await expect(app.getByText('工作台', { exact: true }).first()).toBeVisible();
    await expect(app.getByText('华东推广中心', { exact: true }).first()).toBeVisible();
    await expect(app.getByText('最后更新', { exact: true })).toBeVisible();
  });

  test('工作台应展示核心指标与AI预警', async ({ page }) => {
    await login(page);
    const app = await getAppRoot(page);

    await expect(app.getByText('今日渠道玩家注册', { exact: true })).toBeVisible();
    await expect(app.getByText('今日渠道活跃玩家', { exact: true })).toBeVisible();
    await expect(app.getByText('今日充值金额', { exact: true })).toBeVisible();
    await expect(app.getByText('本月充值金额', { exact: true })).toBeVisible();
    await expect(app.getByText('活跃渠道数', { exact: true })).toBeVisible();
    await expect(app.getByText('新增渠道数', { exact: true })).toBeVisible();
    await expect(app.getByText('AI 实时预警', { exact: true })).toBeVisible();
    await expect(
      app.getByRole('link', { name: '查看全部' }).or(app.getByText('查看全部', { exact: true })),
    ).toBeVisible();
  });

  test('侧栏导航到商务列表', async ({ page }) => {
    await login(page);
    const app = await getAppRoot(page);

    await app.getByText('商务列表', { exact: true }).click();
    await expect(app.getByText('商务列表', { exact: true }).first()).toBeVisible();
    await expect(app.getByText('所属平台', { exact: true }).first()).toBeVisible();
    await expect(app.getByText('商务账号', { exact: true }).first()).toBeVisible();
  });

  test('侧栏导航到渠道列表', async ({ page }) => {
    await login(page);
    const app = await getAppRoot(page);

    await app.getByText('渠道列表', { exact: true }).click();
    await expect(app.getByText('渠道列表', { exact: true }).first()).toBeVisible();
    await expect(app.getByText('所属平台', { exact: true }).first()).toBeVisible();
  });

  test('勾选身份证去重后注册玩家数指标应变化', async ({ page }) => {
    await login(page);
    const app = await getAppRoot(page);

    const regCard = app.locator('.stat-card').filter({ hasText: '今日渠道玩家注册' });
    const regValue = regCard.locator('.stat-value, #regCountValue').first();
    await expect(regValue).toBeVisible();
    const before = (await regValue.innerText()).replace(/,/g, '').trim();

    const dedupCheckbox = app.getByRole('checkbox', { name: '身份证去重' });
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
    const app = await getAppRoot(page);

    const viewAll = app
      .getByRole('link', { name: '查看全部' })
      .or(app.getByText('查看全部', { exact: true }));
    await viewAll.click();
    await expect(app.getByText('预警列表', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(app.getByText('所属平台', { exact: true }).first()).toBeVisible();
  });
});