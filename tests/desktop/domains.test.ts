import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDomain } from "../../src/desktop/domains.js";
import {
  hasVercelToken,
  checkDomainAvailability,
} from "../../src/integrations/domain.js";
vi.mock("../../src/integrations/domain.js", () => ({
  hasVercelToken: vi.fn(async () => false),
  checkDomainAvailability: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(hasVercelToken).mockResolvedValue(false);
});
describe("domain evidence", () => {
  it("does not equate a missing RDAP record with purchasable availability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect((await checkDomain("handoffnest.com")).status).toBe("unknown");
  });
  it("reports existing registry records and handles unavailable registries honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    expect((await checkDomain("example.com")).status).toBe("registered");
    expect((await checkDomain("example.ai")).status).toBe("unknown");
  });
  it("uses the existing authenticated registrar integration when configured", async () => {
    vi.mocked(hasVercelToken).mockResolvedValue(true);
    vi.mocked(checkDomainAvailability).mockResolvedValue({
      domain: "handoffnest.com",
      available: true,
      price: { registration: 12, renewal: 15, currency: "USD" },
    });
    expect(await checkDomain("handoffnest.com")).toMatchObject({
      status: "available",
      price: { renewal: 15 },
    });
  });
  it("does not turn a network failure into a positive availability claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect((await checkDomain("handoffnest.com")).status).toBe("unknown");
  });
});
