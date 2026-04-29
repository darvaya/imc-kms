import { createBrowserHistory } from "history";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, Router } from "react-router-dom";

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
