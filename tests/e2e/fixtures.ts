import { test as base, expect, request } from "@playwright/test";

type StorageState = Awaited<ReturnType<Awaited<ReturnType<typeof request.newContext>>["storageState"]>>;
export const test = base.extend<object, { authenticatedState: StorageState }>({
  authenticatedState: [async ({}, provide, workerInfo) => {
    const client = await request.newContext({ baseURL: workerInfo.project.use.baseURL });
    const response = await client.post("/api/auth/sign-in/email", { data: { email: "owner@example.test", password: "Test-owner-password-2026" } });
    expect(response.ok(), await response.text()).toBe(true);
    await provide(await client.storageState());
    await client.dispose();
  }, { scope: "worker" }],
  storageState: async ({ authenticatedState }, provide) => { await provide(authenticatedState); },
});
export { expect };
