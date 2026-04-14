import * as React from "react";
import { useTranslation } from "react-i18next";
import ButtonLarge from "~/components/ButtonLarge";
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
  const { isCreate, id, name, authUrl, authType: _authType, ...rest } = props;

  const href = getRedirectUrl(authUrl);

  const handleClick = async () => {
    if (id === "microsoft-better-auth") {
      try {
        const response = await fetch("/api/better-auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "microsoft",
            callbackURL: "/auth/redirect",
          }),
          credentials: "include",
        });
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

export default AuthenticationProvider;
