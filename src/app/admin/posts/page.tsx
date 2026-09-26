import type { Metadata } from "next";
import { PostList } from "./post-list";

export const metadata: Metadata = { title: "Posts · Admin" };

export default function PostsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Posts</h1>
      <PostList />
    </div>
  );
}
