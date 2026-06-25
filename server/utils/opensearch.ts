import env from "@server/env";

// `baseUrl` is the request origin (no path); append BASE_PATH so search and
// favicon URLs resolve under the deploy sub-path (e.g. https://host/kms/search)
// rather than the origin root.
export const opensearchResponse = (baseUrl: string): string => {
  const base = `${baseUrl}${env.BASE_PATH}`;
  return `
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>${env.APP_NAME}</ShortName>
  <Description>Search ${env.APP_NAME}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/x-icon">${base}/images/favicon-16.png</Image>
  <Url type="text/html" method="get" template="${base}/search/{searchTerms}?ref=opensearch"/>
  <moz:SearchForm>${base}/search</moz:SearchForm>
</OpenSearchDescription>
`;
};
