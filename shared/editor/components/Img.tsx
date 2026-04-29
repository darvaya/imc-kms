import * as React from "react";

type Props = {
  alt: string;
  src: string;
  title?: string;
  width?: number;
  height?: number;
};

export default function Img({ src, alt, ...rest }: Props) {
  return <img src={src} alt={alt} {...rest} />;
}
