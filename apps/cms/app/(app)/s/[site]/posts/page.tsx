import { Suspense } from "react";
import { PostsList } from "@/features/posts-list";

export default function PostsPage() {
	return (
		<Suspense fallback={null}>
			<PostsList />
		</Suspense>
	);
}
