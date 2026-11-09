import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/analyst", () => {
  it("stays disabled without a server-side model key", async () => {
    vi.stubEnv("AG_STUDIO_OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await POST(new Request("http://local/api/analyst", { method: "POST" }));

    expect(response.status).toBe(503);
  });

  it("pins requests to an allowed model and keeps the key server-side", async () => {
    vi.stubEnv("AG_STUDIO_OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODELS", "gpt-test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const response = await POST(
      new Request("http://local/api/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-test", input: "summary" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gpt-test", max_output_tokens: 32_000 });
  });
});
