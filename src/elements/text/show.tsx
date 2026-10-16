import Markdown from "react-markdown";
import type { ShowProps } from "../types";

export function TextShow({ element }: ShowProps<"text">) {
  // react-markdown rendert kein rohes HTML – eingefügtes <script> o. Ä. erscheint als Text.
  return <Markdown>{element.data.markdown}</Markdown>;
}
