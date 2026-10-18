    import type { ShowProps } from "../types";

export function HeadingShow({ element }: ShowProps<"heading">) {
  return element.data.level === 2 ? <h2>{element.data.text}</h2> : <h3>{element.data.text}</h3>;
}
