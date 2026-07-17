import { createBrowserHistory } from "history";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, Router } from "react-router-dom";
import env from "@shared/env";
import { stripBasePath } from "@shared/utils/urls";

// `createBrowserHistory({ basename })` reads `window.location` at construction
// time and warns when the current path doesn't begin with the basename.
// Align jsdom's URL with the requested basename before each `create...`.
function withLocation<T>(pathname: string, fn: () => T): T {
  const original = window.location.pathname;
  window.history.replaceState(window.history.state, "", pathname);
  try {
    return fn();
  } finally {
    window.history.replaceState(window.history.state, "", original);
  }
}

describe("createBrowserHistory basename", () => {
  it("prefixes createHref output when basename is set", () => {
    withLocation("/kms/", () => {
      const history = createBrowserHistory({ basename: "/kms" });
      expect(history.createHref({ pathname: "/foo" })).toBe("/kms/foo");
    });
  });

  it("does not prefix createHref output when basename is empty", () => {
    withLocation("/", () => {
      const history = createBrowserHistory({ basename: "" });
      expect(history.createHref({ pathname: "/foo" })).toBe("/foo");
    });
  });
});

describe("Router + Link with basename", () => {
  it("renders a prefixed anchor href under a non-empty basename", () => {
    withLocation("/kms/", () => {
      const history = createBrowserHistory({ basename: "/kms" });
      const markup = renderToStaticMarkup(
        React.createElement(
          Router,
          { history },
          React.createElement(Link, { to: "/foo" }, "go")
        )
      );
      expect(markup).toContain('href="/kms/foo"');
    });
  });

  it("renders a non-prefixed anchor href under an empty basename", () => {
    withLocation("/", () => {
      const history = createBrowserHistory({ basename: "" });
      const markup = renderToStaticMarkup(
        React.createElement(
          Router,
          { history },
          React.createElement(Link, { to: "/foo" }, "go")
        )
      );
      expect(markup).toContain('href="/foo"');
      expect(markup).not.toContain('href="//foo"');
    });
  });
});

// Regression guard for AuthStore#logout({ savePath: true }): the value persisted
// for the post-login <Redirect to={...}> is pushed through this basename-aware
// history, which re-adds BASE_PATH. So the saved value MUST be router-relative
// (basename-stripped); saving the raw window.location.pathname double-prefixes to
// /kms/kms/... and 404s. These pin both the bug and the fix against real history@4.
describe("post-login redirect path must be router-relative under /kms", () => {
  let originalBasePath: string | undefined;

  beforeEach(() => {
    originalBasePath = env.BASE_PATH;
    env.BASE_PATH = "/kms";
  });

  afterEach(() => {
    env.BASE_PATH = originalBasePath;
  });

  it("double-prefixes when the raw window path is pushed (the bug)", () => {
    withLocation("/kms/doc/onboarding-abc?ref=1", () => {
      const history = createBrowserHistory({ basename: "/kms" });
      // OLD AuthStore expression: persist window.location verbatim (carries /kms).
      const buggy = window.location.pathname + window.location.search;
      history.push(buggy);
      expect(window.location.pathname).toBe("/kms/kms/doc/onboarding-abc");
    });
  });

  it("round-trips when stripBasePath is applied first (the fix)", () => {
    withLocation("/kms/doc/onboarding-abc?ref=1", () => {
      const history = createBrowserHistory({ basename: "/kms" });
      // NEW AuthStore expression: strip BASE_PATH before persisting.
      const fixed =
        stripBasePath(window.location.pathname) + window.location.search;
      history.push(fixed);
      expect(window.location.pathname).toBe("/kms/doc/onboarding-abc");
      expect(window.location.search).toBe("?ref=1");
    });
  });
});
