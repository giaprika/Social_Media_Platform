import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Input from "src/components/ui/Input";
import Button from "src/components/ui/Button";
import Card from "src/components/ui/Card";
import Avatar from "src/components/ui/Avatar";
import Badge from "src/components/ui/Badge";
import Skeleton from "src/components/ui/Skeleton";
import { getPosts } from "src/api/post";
import { searchUsers, getUserById } from "src/api/user";
import { searchCommunities } from "src/api/community";
import toast from "react-hot-toast";

const SearchPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState(location.state?.query || "");
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const tabs = [
    { id: "all", label: "Tất cả" },
    { id: "posts", label: "Bài viết" },
    { id: "users", label: "Người dùng" },
    { id: "communities", label: "Cộng đồng" },
  ];

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      // Parallel API calls for better performance
      const [postsResponse, usersResponse, communitiesResponse] =
        await Promise.allSettled([
          getPosts({ q: query, limit: 20 }),
          searchUsers(query),
          searchCommunities(query, { limit: 20 }),
        ]);

      // Get posts and enrich with author information
      let posts = [];
      if (postsResponse.status === "fulfilled") {
        const rawPosts = postsResponse.value.data.data || [];

        // Fetch author information for each post
        const postsWithAuthors = await Promise.all(
          rawPosts.map(async (post) => {
            try {
              if (post.user_id) {
                const authorResponse = await getUserById(post.user_id);
                return {
                  ...post,
                  author: authorResponse.data,
                };
              }
              return post;
            } catch (error) {
              console.error(
                `Failed to fetch author for post ${post.post_id}:`,
                error
              );
              return post;
            }
          })
        );
        posts = postsWithAuthors;
      }

      setResults({
        posts,
        users:
          usersResponse.status === "fulfilled"
            ? usersResponse.value.data || []
            : [],
        communities:
          communitiesResponse.status === "fulfilled"
            ? communitiesResponse.value.data?.communities || []
            : [],
      });
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Có lỗi xảy ra khi tìm kiếm");
      setResults({
        posts: [],
        users: [],
        communities: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location.state?.query && query) {
      handleSearch({ preventDefault: () => {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl sm:text-3xl font-bold text-foreground">
        Tìm kiếm
      </h1>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm bài viết, người dùng, cộng đồng..."
              className="pl-11"
            />
          </div>
          <Button type="submit" loading={loading}>
            Tìm kiếm
          </Button>
        </div>
      </form>

      {query && (
        <div className="mb-4 flex gap-2 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-3 font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <Skeleton className="mb-2 h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </Card>
          ))}
        </div>
      ) : results ? (
        <div className="space-y-4">
          {activeTab === "all" || activeTab === "posts" ? (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Bài viết
              </h2>
              {results.posts.length > 0 ? (
                <div className="space-y-4">
                  {results.posts.map((post) => (
                    <Card
                      key={post.post_id}
                      hover
                      onClick={() => navigate(`/app/p/${post.post_id}`)}
                      className="cursor-pointer"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Avatar
                          src={post.author?.avatar_url}
                          name={post.author?.full_name || post.author?.username}
                          size="sm"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {post.author?.full_name ||
                            post.author?.username ||
                            "Unknown"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {post.content}
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{post.reacts_count || 0} lượt thích</span>
                        <span>{post.comments_count || 0} bình luận</span>
                        {post.tags && post.tags.length > 0 && (
                          <div className="flex gap-1">
                            {post.tags.slice(0, 3).map((tag, idx) => (
                              <Badge key={idx} variant="secondary" size="sm">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Không tìm thấy bài viết nào
                </p>
              )}
            </div>
          ) : null}

          {activeTab === "all" || activeTab === "users" ? (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Người dùng
              </h2>
              {results.users.length > 0 ? (
                <div className="space-y-4">
                  {results.users.map((user) => (
                    <Card
                      key={user.id}
                      hover
                      onClick={() => navigate(`/app/profile/${user.id}`)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar
                          src={user.avatar_url}
                          name={user.full_name || user.username}
                          size="lg"
                        />
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-foreground">
                            {user.full_name || user.username}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            @{user.username}
                          </p>
                          {user.bio && (
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {user.bio}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle follow action
                          }}
                        >
                          Theo dõi
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Không tìm thấy người dùng nào
                </p>
              )}
            </div>
          ) : null}

          {activeTab === "all" || activeTab === "communities" ? (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Cộng đồng
              </h2>
              {results.communities.length > 0 ? (
                <div className="space-y-4">
                  {results.communities.map((community) => (
                    <Card
                      key={community.id}
                      hover
                      onClick={() => navigate(`/c/${community.slug}`)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar
                          src={community.avatar_url}
                          name={community.name}
                          size="lg"
                        />
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-foreground">
                            {community.name}
                          </h3>
                          {community.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {community.description}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-muted-foreground">
                            {community.members_count || 0} thành viên
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle join action
                          }}
                        >
                          Tham gia
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Không tìm thấy cộng đồng nào
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <MagnifyingGlassIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nhập từ khóa để tìm kiếm bài viết, người dùng hoặc cộng đồng
          </p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
