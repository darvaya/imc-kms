import useShare from "@shared/hooks/useShare";
import { urlWithBasePath } from "@shared/utils/urls";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  value: string;
  size?: number | string;
};

export const CustomEmoji = ({ value, size = 16, ...props }: Props) => {
  const { shareId } = useShare();
  return (
    <img
      src={urlWithBasePath(
        `/api/emojis.redirect?id=${value}${shareId ? `&shareId=${shareId}` : ""}`
      )}
      style={{ width: size, height: size, objectFit: "contain" }}
      {...props}
    />
  );
};
