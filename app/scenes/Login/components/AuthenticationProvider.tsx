import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import { urlWithBasePath } from "@shared/utils/urls";
import ButtonLarge from "~/components/ButtonLarge";
import Input from "~/components/Input";
import PluginIcon from "~/components/PluginIcon";
import { getRedirectUrl } from "../urls";

type Props = React.ComponentProps<typeof ButtonLarge> & {
  id: string;
  name: string;
  authUrl: string;
  isCreate: boolean;
  authType?: string;
};

function AuthenticationProvider(props: Props) {
  const { t } = useTranslation();
  const { isCreate, id, name, authUrl, authType, ...rest } = props;

  // Email/password credentials login (only offered when Entra is not
  // configured — see server/auth/betterAuth.ts). Renders a form, not a button.
  // Public sign-up is disabled, so it has no place on the /create flow.
  if (authType === "credential") {
    return isCreate ? null : <CredentialForm authUrl={authUrl} />;
  }

  const href = getRedirectUrl(authUrl);

  const handleClick = async () => {
    if (id === "microsoft-better-auth") {
      try {
        const response = await fetch(
          urlWithBasePath("/api/better-auth/sign-in/social"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "microsoft",
              callbackURL: urlWithBasePath("/auth/redirect"),
            }),
            credentials: "include",
          }
        );
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } catch {
        // Fall back to direct navigation
        window.location.href = href;
      }
    } else {
      window.location.href = href;
    }
  };

  return (
    <ButtonLarge
      onClick={handleClick}
      icon={<PluginIcon id={id} />}
      fullwidth
      {...rest}
    >
      {t("Continue with {{ authProviderName }}", {
        authProviderName: name,
      })}
    </ButtonLarge>
  );
}

function CredentialForm({ authUrl }: { authUrl: string }) {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(urlWithBasePath(authUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        // Full reload so auth.info re-fetches with the new session cookie.
        window.location.href = urlWithBasePath("/");
        return;
      }
      setError(t("Incorrect email or password"));
    } catch {
      setError(t("Incorrect email or password"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Input
        type="email"
        name="email"
        placeholder={t("Email")}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="username"
        required
      />
      <Input
        type="password"
        name="password"
        placeholder={t("Password")}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        required
      />
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
      <ButtonLarge type="submit" fullwidth disabled={submitting}>
        {t("Continue")}
      </ButtonLarge>
    </Form>
  );
}

const Form = styled.form`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ErrorMessage = styled.p`
  color: ${s("danger")};
  text-align: center;
  font-size: 14px;
  margin: 0 0 4px;
`;

export default AuthenticationProvider;
