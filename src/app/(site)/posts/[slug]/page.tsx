import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { PostArticle } from "@/components/post-article";
import { db } from "@/db";
import { getStorage } from "@/server/media/storage";
import { findPublishedPost } from "@/server/public/posts";

// Vorerst bei jeder Anfrage frisch gerendert; Cache und Invalidierung folgen in Schritt 5.
const lookup = cache(async (slug: string) => {
  await connection();
  return findPublishedPost(db, getStorage(), slug);
});

export async function generateMetadata({ params }: PageProps<"/posts/[slug]">): Promise<Metadata> {
  const result = await lookup((await params).slug);
  return result.kind === "post" ? { title: `${result.post.title} · rootyourself` } : {};
}

export default async function PostPage({ params }: PageProps<"/posts/[slug]">) {
  const result = await lookup((await params).slug);
  if (result.kind === "redirect") permanentRedirect(`/posts/${result.slug}`);
  if (result.kind === "missing") notFound();
  return <PostArticle {...result.post} />;
}
