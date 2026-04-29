import * as React from "react";
import Frame from "../components/Frame";
import { assetUrl } from "../../utils/urls";
import type { EmbedProps as Props } from ".";

function Gist(props: Props) {
  return (
    <Frame
      src={assetUrl(
        `/embeds/github?url=${encodeURIComponent(props.attrs.href)}`
      )}
      className={props.isSelected ? "ProseMirror-selectednode" : ""}
      width="100%"
      height="355px"
      title="GitHub Gist"
    />
  );
}

export default Gist;
