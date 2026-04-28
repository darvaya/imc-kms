import { buildDocument, buildShare } from "@server/test/factories";
import { getSubpathTestServer, getTestServer } from "@server/test/support";

describe("server-rendered HTML asset URLs — path-less URL", () => {
  const server = getTestServer();

  it("emits asset URLs without any /kms/ prefix on GET /", async () => {
    const res = await server.get("/");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain("/kms/");
  });

  it("emits root-relative asset link tags on GET /", async () => {
    const res = await server.get("/");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain(
      `<link rel="manifest" href="/static/manifest.webmanifest" />`
    );
    expect(body).toContain(
      `href="/opensearch.xml"`
    );
    expect(body).toContain(
      `href="/images/apple-touch-icon.png"`
    );
    expect(body).toContain(
      `href="/images/favicon-32.png"`
    );
  });

  it("expands {cdn-url} to a path-less prefix in inline @font-face URLs on GET /", async () => {
    const res = await server.get("/");
    const body = await res.text();
    expect(body).toContain(`url("/fonts/Inter.var.woff2")`);
    expect(body).toContain(`url("/fonts/Inter-italic.var.woff2")`);
  });

  it("emits dev-mode Vite script tags pointing at the dev-server origin without /kms", async () => {
    const res = await server.get("/");
    const body = await res.text();
    // Test environment runs with !env.isProduction — exercises the dev-mode branch.
    expect(body).toMatch(/src="http:\/\/[^"]+:3001\/static\/@vite\/client"/);
    expect(body).toMatch(/src="http:\/\/[^"]+:3001\/static\/app\/index\.tsx"/);
    expect(body).not.toMatch(/:3001\/kms\/static\//);
  });

  it("emits a root-relative sitemap link for shared documents on GET /s/:id", async () => {
    const document = await buildDocument();
    const share = await buildShare({
      documentId: document.id,
      teamId: document.teamId,
    });
    const res = await server.get(`/s/${share.id}`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain(
      `<link rel="sitemap" type="application/xml" href="/api/shares.sitemap?id=${share.id}">`
    );
  });
});

describe("server-rendered HTML asset URLs — URL with /kms prefix", () => {
  const server = getSubpathTestServer("/kms");

  it("prefixes asset link tags with /kms on GET /kms/", async () => {
    const res = await server.get("/kms/");
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain(
      `<link rel="manifest" href="/kms/static/manifest.webmanifest" />`
    );
    expect(body).toContain(
      `href="/kms/opensearch.xml"`
    );
    expect(body).toContain(
      `href="/kms/images/apple-touch-icon.png"`
    );
    expect(body).toContain(
      `href="/kms/images/favicon-32.png"`
    );
  });

  it("expands {cdn-url} to include /kms in inline @font-face URLs on GET /kms/", async () => {
    const res = await server.get("/kms/");
    const body = await res.text();
    expect(body).toContain(`url("/kms/fonts/Inter.var.woff2")`);
    expect(body).toContain(`url("/kms/fonts/Inter-italic.var.woff2")`);
  });

  it("emits dev-mode Vite script tags with /kms prefix on the dev-server origin", async () => {
    const res = await server.get("/kms/");
    const body = await res.text();
    // Test environment runs with !env.isProduction — exercises the dev-mode branch.
    expect(body).toMatch(
      /src="http:\/\/[^"]+:3001\/kms\/static\/@vite\/client"/
    );
    expect(body).toMatch(
      /src="http:\/\/[^"]+:3001\/kms\/static\/app\/index\.tsx"/
    );
  });

  it("emits a /kms-prefixed sitemap link for shared documents on GET /kms/s/:id", async () => {
    const document = await buildDocument();
    const share = await buildShare({
      documentId: document.id,
      teamId: document.teamId,
    });
    const res = await server.get(`/kms/s/${share.id}`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain(
      `<link rel="sitemap" type="application/xml" href="/kms/api/shares.sitemap?id=${share.id}">`
    );
  });
});
