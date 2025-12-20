import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Input from "src/components/ui/Input";
import Button from "src/components/ui/Button";
import Card from "src/components/ui/Card";
import Avatar from "src/components/ui/Avatar";
import Badge from "src/components/ui/Badge";
import Skeleton from "src/components/ui/Skeleton";

const SearchPage = () => {
  const location = useLocation();
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
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Mock results
    setResults({
      posts: [
        {
          id: "1",
          title: "Search result post",
          content: `This post contains "${query}"`,
          author: { name: "John Doe", avatar: null },
          likes: 10,
        },
      ],
      users: [
        {
          id: "1",
          name: "John Doe",
          username: "johndoe",
          avatar: null,
          followers: 1234,
        },
      ],
      communities: [],
    });
    setLoading(false);
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
                    <Card key={post.id} hover>
                      <div className="mb-2 flex items-center gap-2">
                        <Avatar
                          src={post.author?.avatar}
                          name={post.author?.name}
                          size="sm"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {post.author?.name}
                        </span>
                      </div>
                      <h3 className="mb-2 text-lg font-bold text-foreground">
                        {post.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {post.content}
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{post.likes} lượt thích</span>
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
                    <Card key={user.id} hover>
                      <div className="flex items-center gap-4">
                        <Avatar
                          src={user.avatar}
                          name={user.name}
                          size="lg"
                        />
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-foreground">
                            {user.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            @{user.username}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {user.followers} người theo dõi
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
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
                    <Card key={community.id} hover>
                      <div className="flex items-center gap-4">
                        <Avatar
                          src={community.avatar}
                          name={community.name}
                          size="lg"
                        />
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-foreground">
                            {community.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {community.members} thành viên
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
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

