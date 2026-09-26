import type { Metadata } from "next";
import { PostEditor } from "./post-editor";

export const metadata: Metadata = { title: "Post · Admin" };

export default async function PostPage({ params }: PageProps<"/admin/posts/[id]">) {
  const { id } = await params;
  return <PostEditor id={id} />;
}
