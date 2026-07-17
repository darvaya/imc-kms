import env from "../env";
import * as urlsUtils from "./urls";
import { urlRegex } from "./urls";

describe("isUrl", () => {
  it("should return false for invalid url", () => {
    expect(urlsUtils.isUrl("")).toBe(false);
    expect(urlsUtils.isUrl("#invalidurl")).toBe(false);
    expect(urlsUtils.isUrl("mailto:")).toBe(false);
    expect(urlsUtils.isUrl("sms:")).toBe(false);
    expect(urlsUtils.isUrl("://")).toBe(false);
    expect(urlsUtils.isUrl("www.example.com")).toBe(false);
  });

  it("should return true for valid urls", () => {
    expect(urlsUtils.isUrl("http://example.com")).toBe(true);
    expect(urlsUtils.isUrl("https://www.example.com")).toBe(true);
    expect(urlsUtils.isUrl("seafile://openfile")).toBe(true);
    expect(urlsUtils.isUrl("figma://launch")).toBe(true);
    expect(urlsUtils.isUrl("outline:https://getoutline.com")).toBe(true);
    expect(urlsUtils.isUrl("www.example.com", { requireProtocol: false })).toBe(
      true
    );
  });

  describe("requireHttps option", () => {
    it("should reject HTTP URLs when requireHttps is true", () => {
      expect(
        urlsUtils.isUrl("http://example.com", { requireHttps: true })
      ).toBe(false);
      expect(
        urlsUtils.isUrl("http://example.com/callback", { requireHttps: true })
      ).toBe(false);
      expect(
        urlsUtils.isUrl("http://localhost:3000/auth", { requireHttps: true })
      ).toBe(false);
    });

    it("should accept HTTPS URLs when requireHttps is true", () => {
      expect(
        urlsUtils.isUrl("https://example.com", { requireHttps: true })
      ).toBe(true);
      expect(
        urlsUtils.isUrl("https://example.com/callback", { requireHttps: true })
      ).toBe(true);
      expect(
        urlsUtils.isUrl("https://localhost:3000/auth", { requireHttps: true })
      ).toBe(true);
    });

    it("should accept HTTP URLs when requireHttps is false or not specified", () => {
      expect(urlsUtils.isUrl("http://example.com")).toBe(true);
      expect(
        urlsUtils.isUrl("http://example.com", { requireHttps: false })
      ).toBe(true);
    });

    it("should allow custom protocols when requireHttps is true", () => {
      expect(
        urlsUtils.isUrl("seafile://openfile", { requireHttps: true })
      ).toBe(true);
      expect(urlsUtils.isUrl("figma://launch", { requireHttps: true })).toBe(
        true
      );
      expect(urlsUtils.isUrl("myapp://callback", { requireHttps: true })).toBe(
        true
      );
    });
  });
});

describe("isBase64Url", () => {
  it("should return false for invalid url", () => {
    expect(urlsUtils.isBase64Url("")).toBe(false);
    expect(urlsUtils.isBase64Url("#invalidurl")).toBe(false);
    expect(urlsUtils.isBase64Url("http://example.com")).toBe(false);
    expect(urlsUtils.isBase64Url("https://www.example.com")).toBe(false);
    expect(urlsUtils.isBase64Url("seafile://openfile")).toBe(false);
    expect(urlsUtils.isBase64Url("figma://launch")).toBe(false);
    expect(urlsUtils.isBase64Url("outline:https://getoutline.com")).toBe(false);
    expect(urlsUtils.isBase64Url("://")).toBe(false);
  });

  it("should return true for valid urls", () => {
    expect(
      urlsUtils.isBase64Url(
        "data:image/png;base64,R0lGODlhPQBEAPeoAJosM//AwO/AwHVYZ/z595kzAP/s7P+goOXMv8+fhw/v739/f+8PD98fH/8mJl+fn/9ZWb8/PzWlwv///6wWGbImAPgTEMImIN9gUFCEm/gDALULDN8PAD6atYdCTX9gUNKlj8wZAKUsAOzZz+UMAOsJAP/Z2ccMDA8PD/95eX5NWvsJCOVNQPtfX/8zM8+QePLl38MGBr8JCP+zs9myn/8GBqwpAP/GxgwJCPny78lzYLgjAJ8vAP9fX/+MjMUcAN8zM/9wcM8ZGcATEL+QePdZWf/29uc/P9cmJu9MTDImIN+/r7+/vz8/P8VNQGNugV8AAF9fX8swMNgTAFlDOICAgPN"
      )
    ).toBeTruthy();
    expect(
      urlsUtils.isBase64Url(
        "data:image/gif;base64,npkM+fOqD6DDj1aZpITp0dtGCDhr+fVuCu3zlg49ijaokTZTo27uG7Gjn2P+hI8+PDPERoUB318bWbfAJ5sUNFcuGRTYUqV/3ogfXp1rWlMc6awJjiAAd2fm4ogXjz56aypOoIde4OE5u/F9x199dlXnnGiHZWEYbGpsAEA3QXYnHwEFliKAgswgJ8LPeiUXGwedCAKABACCN+EA1pYIIYaFlcDhytd51sGAJbo3onOpajiihlO92KHGaUXGwWjUBChjSPiWJuOO/LYIm4v1tXfE6J4gCSJEZ7YgRYUNrkji9P55sF/ogxw5ZkSqIDaZBV6aSGYq/lGZplndkckZ98xoICbTcIJGQAZc"
      )
    ).toBeTruthy();
  });
});

describe("isInternalUrl", () => {
  beforeEach(() => {
    env.URL = "https://example.com:3000";
  });

  it("should return false if empty string", () => {
    expect(urlsUtils.isInternalUrl("")).toBe(false);
  });

  it("should return false if port is different", () => {
    expect(urlsUtils.isInternalUrl("https://example.com:4000")).toBe(false);
  });

  it("should return false if port is missing", () => {
    expect(urlsUtils.isInternalUrl("https://example.com")).toBe(false);
  });

  it("should return true if starting with relative path", () => {
    expect(urlsUtils.isInternalUrl("/drafts")).toEqual(true);
  });
});

describe("isExternalUrl", () => {
  it("should return false if empty url", () => {
    expect(urlsUtils.isExternalUrl("")).toBe(false);
  });

  it("should return false if internal url", () => {
    expect(urlsUtils.isExternalUrl("/drafts")).toBe(false);
  });
});

describe("sanitizeUrl", () => {
  it("should return undefined if not url", () => {
    expect(urlsUtils.sanitizeUrl(undefined)).toBeUndefined();
    expect(urlsUtils.sanitizeUrl(null)).toBeUndefined();
    expect(urlsUtils.sanitizeUrl("")).toBeUndefined();
  });

  it("should append https:// to non-special urls", () => {
    expect(urlsUtils.sanitizeUrl("www.google.com")).toEqual(
      "https://www.google.com"
    );
  });

  describe("special urls", () => {
    it("should return the url as it's if starting with /", () => {
      expect(urlsUtils.sanitizeUrl("/drafts")).toEqual("/drafts");
    });
    it("should return the url as it's if starting with #", () => {
      expect(urlsUtils.sanitizeUrl("#home")).toEqual("#home");
    });
    it("should return the url as it's if it's mailto:", () => {
      expect(urlsUtils.sanitizeUrl("mailto:outline@getoutline.com")).toEqual(
        "mailto:outline@getoutline.com"
      );
    });
    it("should return the url as it's if it's mailto:", () => {
      expect(urlsUtils.sanitizeUrl("mailto:outline@getoutline.com")).toEqual(
        "mailto:outline@getoutline.com"
      );
    });
    it("should return the url as it's if it's sms:, fax:, tel:", () => {
      expect(urlsUtils.sanitizeUrl("mailto:outline@getoutline.com")).toEqual(
        "mailto:outline@getoutline.com"
      );
      expect(urlsUtils.sanitizeUrl("tel:0123456789")).toEqual("tel:0123456789");
      expect(urlsUtils.sanitizeUrl("fax:0123456789")).toEqual("fax:0123456789");
      expect(urlsUtils.sanitizeUrl("sms:0123456789")).toEqual("sms:0123456789");
    });
    it("should return the url as it's if it's a special protocol", () => {
      expect(urlsUtils.sanitizeUrl("mqtt://getoutline.com")).toEqual(
        "mqtt://getoutline.com"
      );
    });
  });

  describe("Blocked protocols", () => {
    it("should be sanitized", () => {
      expect(urlsUtils.sanitizeUrl("file://localhost.com/outline.txt")).toEqual(
        "https://file://localhost.com/outline.txt"
      );
      expect(urlsUtils.sanitizeUrl("javascript:whatever")).toEqual(
        "https://javascript:whatever"
      );
      expect(
        urlsUtils.sanitizeUrl("data:text/html,<script>alert('hi');</script>")
      ).toEqual("https://data:text/html,<script>alert('hi');</script>");
      expect(urlsUtils.sanitizeUrl("vbscript:whatever")).toEqual(
        "https://vbscript:whatever"
      );
    });
  });
});

describe("assetUrl", () => {
  let originalUrl: string | undefined;
  let originalCdn: string | undefined;
  let originalBasePath: string | undefined;

  beforeEach(() => {
    originalUrl = env.URL;
    originalCdn = env.CDN_URL;
    originalBasePath = env.BASE_PATH;
    env.URL = "https://example.com";
    env.CDN_URL = "";
    env.BASE_PATH = "";
  });

  afterEach(() => {
    env.URL = originalUrl;
    env.CDN_URL = originalCdn;
    env.BASE_PATH = originalBasePath;
  });

  it("returns the path unchanged with empty CDN and empty BASE_PATH", () => {
    expect(urlsUtils.assetUrl("/images/foo.png")).toBe("/images/foo.png");
  });

  it("prepends BASE_PATH when CDN is empty", () => {
    env.BASE_PATH = "/kms";
    expect(urlsUtils.assetUrl("/images/foo.png")).toBe("/kms/images/foo.png");
  });

  it("prepends CDN and BASE_PATH together", () => {
    env.CDN_URL = "https://cdn.example.com";
    env.BASE_PATH = "/kms";
    expect(urlsUtils.assetUrl("/images/foo.png")).toBe(
      "https://cdn.example.com/kms/images/foo.png"
    );
  });

  it("passes http:// URLs through unchanged", () => {
    env.CDN_URL = "https://cdn.example.com";
    env.BASE_PATH = "/kms";
    expect(urlsUtils.assetUrl("http://other.example.com/foo.png")).toBe(
      "http://other.example.com/foo.png"
    );
  });

  it("passes https:// URLs through unchanged", () => {
    env.CDN_URL = "https://cdn.example.com";
    env.BASE_PATH = "/kms";
    expect(urlsUtils.assetUrl("https://other.example.com/foo.png")).toBe(
      "https://other.example.com/foo.png"
    );
  });

  it("passes data: URIs through unchanged", () => {
    env.BASE_PATH = "/kms";
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    expect(urlsUtils.assetUrl(dataUri)).toBe(dataUri);
  });

  it("passes blob: URLs through unchanged", () => {
    env.BASE_PATH = "/kms";
    const blobUrl = "blob:https://example.com/abc-123";
    expect(urlsUtils.assetUrl(blobUrl)).toBe(blobUrl);
  });

  it("treats a missing leading slash the same as a leading slash", () => {
    env.BASE_PATH = "/kms";
    expect(urlsUtils.assetUrl("images/foo.png")).toBe("/kms/images/foo.png");
  });
});

describe("stripBasePath", () => {
  let originalBasePath: string | undefined;

  beforeEach(() => {
    originalBasePath = env.BASE_PATH;
    env.BASE_PATH = "";
  });

  afterEach(() => {
    env.BASE_PATH = originalBasePath;
  });

  it("returns the path unchanged when BASE_PATH is empty", () => {
    expect(urlsUtils.stripBasePath("/doc/foo")).toBe("/doc/foo");
  });

  it("strips a leading BASE_PATH segment", () => {
    env.BASE_PATH = "/kms";
    expect(urlsUtils.stripBasePath("/kms/doc/foo")).toBe("/doc/foo");
  });

  it("maps the bare BASE_PATH to root", () => {
    env.BASE_PATH = "/kms";
    expect(urlsUtils.stripBasePath("/kms")).toBe("/");
  });

  it("only strips a WHOLE leading segment (leaves /kmsx untouched)", () => {
    env.BASE_PATH = "/kms";
    expect(urlsUtils.stripBasePath("/kmsx/foo")).toBe("/kmsx/foo");
  });

  it("leaves a non-prefixed path untouched", () => {
    env.BASE_PATH = "/kms";
    expect(urlsUtils.stripBasePath("/other/foo")).toBe("/other/foo");
  });

  it("passes absolute and data URIs through unchanged", () => {
    env.BASE_PATH = "/kms";
    expect(urlsUtils.stripBasePath("https://x.example.com/kms/foo")).toBe(
      "https://x.example.com/kms/foo"
    );
    expect(urlsUtils.stripBasePath("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    );
  });

  it("is the inverse of urlWithBasePath (strip ∘ add === identity)", () => {
    env.BASE_PATH = "/kms";
    for (const p of ["/doc/foo", "/home", "/api/auth.info"]) {
      expect(urlsUtils.stripBasePath(urlsUtils.urlWithBasePath(p))).toBe(p);
    }
  });

  it("keeps a post-login redirect from double-prefixing under /kms", () => {
    // Regression guard for AuthStore: window.location.pathname on /kms/doc/x
    // carries the mount prefix; persisting it verbatim and rendering
    // <Redirect to={...}> through the basename-'/kms' router history yields
    // /kms/kms/doc/x -> 404. stripBasePath restores the router-relative path.
    env.BASE_PATH = "/kms";
    expect(urlsUtils.stripBasePath("/kms/doc/onboarding-abc")).toBe(
      "/doc/onboarding-abc"
    );
  });
});

describe("isDocumentUrl / isCollectionUrl under a sub-path deploy", () => {
  let originalUrl: string | undefined;
  let originalBasePath: string | undefined;

  beforeEach(() => {
    originalUrl = env.URL;
    originalBasePath = env.BASE_PATH;
    env.URL = "http://localhost/kms";
    env.BASE_PATH = "/kms";
  });

  afterEach(() => {
    env.URL = originalUrl;
    env.BASE_PATH = originalBasePath;
  });

  it("recognises an absolute in-app document URL carrying BASE_PATH", () => {
    // Regression guard: a URL copied from the address bar. Before BASE_PATH was
    // stripped this returned false, so PasteHandler stored a raw absolute link
    // and the editor click handler navigated to /kms/kms/doc/... (404).
    expect(urlsUtils.isDocumentUrl("http://localhost/kms/doc/my-doc-x7y8")).toBe(
      true
    );
  });

  it("recognises a root-relative document path carrying BASE_PATH", () => {
    expect(urlsUtils.isDocumentUrl("/kms/doc/my-doc-x7y8")).toBe(true);
    expect(urlsUtils.isDocumentUrl("/kms/d/my-doc-x7y8")).toBe(true);
  });

  it("still recognises a router-relative document path", () => {
    expect(urlsUtils.isDocumentUrl("/doc/my-doc-x7y8")).toBe(true);
    expect(urlsUtils.isDocumentUrl("/d/my-doc-x7y8")).toBe(true);
  });

  it("does not treat a non-document sub-path URL as a document", () => {
    expect(urlsUtils.isDocumentUrl("/kms/search")).toBe(false);
  });

  it("does not strip a look-alike prefix", () => {
    expect(urlsUtils.isDocumentUrl("/kmsx/doc/my-doc-x7y8")).toBe(false);
  });

  it("recognises collection URLs carrying BASE_PATH", () => {
    expect(
      urlsUtils.isCollectionUrl("http://localhost/kms/collection/eng-abc")
    ).toBe(true);
    expect(urlsUtils.isCollectionUrl("/kms/collection/eng-abc")).toBe(true);
    expect(urlsUtils.isCollectionUrl("/collection/eng-abc")).toBe(true);
  });

  it("is unchanged on a root deploy (empty BASE_PATH)", () => {
    env.URL = "http://localhost";
    env.BASE_PATH = "";
    expect(urlsUtils.isDocumentUrl("/doc/my-doc-x7y8")).toBe(true);
    expect(urlsUtils.isDocumentUrl("/kms/doc/my-doc-x7y8")).toBe(false);
    expect(urlsUtils.isCollectionUrl("/collection/eng-abc")).toBe(true);
  });
});

describe("#urlRegex", () => {
  it("should return undefined for invalid urls", () => {
    expect(urlRegex(undefined)).toBeUndefined();
    expect(urlRegex(null)).toBeUndefined();
    expect(urlRegex("invalid url!")).toBeUndefined();
  });

  it("should return corresponding regex otherwise", () => {
    const regex = urlRegex("https://docs.google.com");
    expect(regex?.source).toBe(/https:\/\/docs\.google\.com/.source);
    expect(regex?.test("https://docs.google.com")).toBe(true);
    expect(regex?.test("https://docs.google.com/")).toBe(true);
    expect(regex?.test("https://docs.google.com/d/123")).toBe(true);
    expect(regex?.test("http://google.com")).toBe(false);
    expect(regex?.test("http://docs.google.com")).toBe(false);
    expect(regex?.test("http://docs.google.com/")).toBe(false);
    expect(regex?.test("http://docs.google.com/d/123")).toBe(false);
  });
});
