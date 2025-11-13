import { useState } from "react";
import { useNotifications } from "../hooks/useNotifications";
import { useEffect } from "react";
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

const mockPosts = [
  {
    id: "1",
    author: "John Doe",
    avatar: "JD",
    title: "Amazing sunset today!",
    description:
      "Just captured this beautiful sunset at the beach. Nature is incredible!",
    likes: 1234,
    comments: 89,
    shares: 45,
    liked: false,
  },
  {
    id: "2",
    author: "Jane Smith",
    avatar: "JS",
    title: "New project launch",
    description:
      "Excited to announce the launch of our new web application. Check it out!",
    likes: 2456,
    comments: 234,
    shares: 123,
    liked: false,
  },
  {
    id: "3",
    author: "Tech News",
    avatar: "TN",
    title: "Latest AI breakthroughs",
    description:
      "Researchers announce major advances in artificial intelligence and machine learning.",
    likes: 5678,
    comments: 567,
    shares: 345,
    liked: false,
  },
];

export default function Feed() {
  const [posts, setPosts] = useState(mockPosts);


  const token = getCookie("accessToken");
  console.log("Access Token:", token);

  useEffect(() => {
    if (token) {
      console.log("User is logged in.");
    } else {
      console.log("User is not logged in.");
    }
  }, []);
  const { notifications } = useNotifications(token);

  useEffect(() => {
    if (notifications.length > 0) {
      console.log("Bạn có thông báo mới:", notifications[0]);
    }
  }, [notifications]);

  const toggleLike = (postId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              liked: !post.liked,
              likes: post.liked ? post.likes - 1 : post.likes + 1,
            }
          : post
      )
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-8 text-3xl font-bold text-foreground">Home Feed</h1>

      <div className="space-y-4">
        {posts.map((post) => (
          <article
            key={post.id}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {post.avatar}
              </div>
              <div>
                <p className="font-semibold text-foreground">{post.author}</p>
                <p className="text-xs text-muted-foreground">2 hours ago</p>
              </div>
            </div>

            <h2 className="mb-2 text-lg font-bold text-foreground">{post.title}</h2>
            <p className="mb-4 text-muted-foreground">{post.description}</p>

            <div className="flex items-center gap-6 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => toggleLike(post.id)}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  post.liked
                    ? "text-primary"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                <span className="text-lg">{post.liked ? "❤️" : "🤍"}</span>
                <span>{post.likes}</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <span className="text-lg">💬</span>
                <span>{post.comments}</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <span className="text-lg">↗️</span>
                <span>{post.shares}</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
