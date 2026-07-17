import sharedEnv from "../env";
import parseDocumentSlug from "./parseDocumentSlug";

sharedEnv.URL = "https://app.outline.dev";

describe("#parseDocumentSlug", () => {
  it("should work with fully qualified url", () => {
    expect(
      parseDocumentSlug("http://example.com/doc/my-doc-y4j4tR4UuV")
    ).toEqual("my-doc-y4j4tR4UuV");
  });

  it("should work with paths after document slug", () => {
    expect(
      parseDocumentSlug(
        "http://mywiki.getoutline.com/doc/my-doc-y4j4tR4UuV/edit"
      )
    ).toEqual("my-doc-y4j4tR4UuV");
  });

  it("should work with hash", () => {
    expect(
      parseDocumentSlug(
        "http://mywiki.getoutline.com/doc/my-doc-y4j4tR4UuV#state"
      )
    ).toEqual("my-doc-y4j4tR4UuV");
  });

  it("should work with subdomain qualified url", () => {
    expect(
      parseDocumentSlug("http://mywiki.getoutline.com/doc/my-doc-y4j4tR4UuV")
    ).toEqual("my-doc-y4j4tR4UuV");
  });

  it("should work with path", () => {
    expect(parseDocumentSlug("/doc/my-doc-y4j4tR4UuV")).toEqual(
      "my-doc-y4j4tR4UuV"
    );
  });

  it("should work with path and hash", () => {
    expect(parseDocumentSlug("/doc/my-doc-y4j4tR4UuV#my-heading-hash")).toEqual(
      "my-doc-y4j4tR4UuV"
    );
  });
});

describe("#parseDocumentSlug under a sub-path deploy", () => {
  // isDocumentUrl() now recognises in-app document URLs that carry BASE_PATH
  // (e.g. pasted from the address bar), so PasteHandler depends on the slug
  // parsing through the `/kms` segment. parseDocumentSlug is BASE_PATH-agnostic
  // (it locates the "doc" segment by index) — these pin that contract.
  const original = sharedEnv.URL;

  beforeEach(() => {
    sharedEnv.URL = "https://appstpcid.imcpelitalog.com/kms";
  });

  afterEach(() => {
    sharedEnv.URL = original;
  });

  it("should work with an absolute url carrying the sub-path", () => {
    expect(
      parseDocumentSlug(
        "https://appstpcid.imcpelitalog.com/kms/doc/my-doc-y4j4tR4UuV"
      )
    ).toEqual("my-doc-y4j4tR4UuV");
  });

  it("should work with a root-relative path carrying the sub-path", () => {
    expect(parseDocumentSlug("/kms/doc/my-doc-y4j4tR4UuV")).toEqual(
      "my-doc-y4j4tR4UuV"
    );
  });

  it("should work with a router-relative path against a sub-path URL", () => {
    expect(parseDocumentSlug("/doc/my-doc-y4j4tR4UuV")).toEqual(
      "my-doc-y4j4tR4UuV"
    );
  });
});
