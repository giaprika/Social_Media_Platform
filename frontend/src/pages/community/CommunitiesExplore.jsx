import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    MagnifyingGlassIcon,
    PlusIcon,
    UsersIcon,
    Squares2X2Icon,
    ListBulletIcon,
} from '@heroicons/react/24/outline'
import * as communityApi from 'src/api/community'

// Category icons mapping
const CATEGORY_ICONS = {
    Technology: '💻',
    Gaming: '🎮',
    Art: '🎨',
    Music: '🎵',
    Sports: '⚽',
    Education: '📚',
    Business: '💼',
    Entertainment: '🎬',
    Lifestyle: '🌟',
    Science: '🔬',
    News: '📰',
    Food: '🍕',
    Travel: '✈️',
    Health: '💪',
    Finance: '💰',
    Photography: '📷',
    Movies: '🎥',
    Books: '📖',
    Anime: '🎌',
    Memes: '😂',
    Other: '🌐',
}

// Get icon for a community
const getCommunityIcon = (community) => {
    if (community.avatar_url) return null
    if (community.category && CATEGORY_ICONS[community.category]) {
        return CATEGORY_ICONS[community.category]
    }
    const name = community.name?.toLowerCase() || ''
    if (name.includes('tech') || name.includes('dev') || name.includes('code')) return '💻'
    if (name.includes('game') || name.includes('gaming')) return '🎮'
    if (name.includes('art') || name.includes('design')) return '🎨'
    if (name.includes('music')) return '🎵'
    return '🌐'
}

// CommunityCard Component
const CommunityCard = ({ community, onJoin, isJoined }) => {
    const icon = getCommunityIcon(community)

    return (
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:shadow-lg hover:border-primary/30">
            {/* Banner */}
            <div className="h-24 bg-gradient-to-r from-primary/30 to-primary/10 relative overflow-hidden">
                {community.banner_url && (
                    <img
                        src={community.banner_url}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>

            {/* Avatar */}
            <div className="absolute top-16 left-4">
                <div className="h-16 w-16 rounded-xl bg-card border-4 border-card shadow-lg flex items-center justify-center overflow-hidden">
                    {community.avatar_url ? (
                        <img
                            src={community.avatar_url}
                            alt={community.name}
                            className="w-full h-full object-cover"
                        />
                    ) : icon ? (
                        <span className="text-3xl">{icon}</span>
                    ) : (
                        <UsersIcon className="h-8 w-8 text-primary" />
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-4 pt-10">
                <Link
                    to={`/c/${community.slug}`}
                    className="block hover:text-primary transition-colors"
                >
                    <h3 className="font-bold text-foreground text-lg truncate">
                        {community.name}
                    </h3>
                </Link>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 min-h-[40px]">
                    {community.description || 'No description'}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <UsersIcon className="h-4 w-4" />
                        {community.member_count?.toLocaleString() || 0} members
                    </span>
                    {community.category && (
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                            {community.category}
                        </span>
                    )}
                </div>

                {/* Join Button */}
                <div className="mt-4">
                    {isJoined ? (
                        <button className="w-full py-2 px-4 rounded-xl border border-primary text-primary font-medium hover:bg-primary/10 transition-colors">
                            Joined
                        </button>
                    ) : (
                        <button
                            onClick={() => onJoin?.(community)}
                            className="w-full py-2 px-4 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
                        >
                            Join
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// Main Page Component
export default function CommunitiesExplore() {
    const navigate = useNavigate()
    const [communities, setCommunities] = useState([])
    const [categories, setCategories] = useState([])
    const [myCommunities, setMyCommunities] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState(null)
    const [sortBy, setSortBy] = useState('popular')
    const [viewMode, setViewMode] = useState('grid') // grid or list
    const [page, setPage] = useState(1)
    const [pagination, setPagination] = useState(null)

    // My joined community IDs
    const myCommunitySlugs = useMemo(
        () => new Set(myCommunities.map((c) => c.slug)),
        [myCommunities]
    )

    // Load categories
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const data = await communityApi.getCategories()
                setCategories(data.categories || [])
            } catch (err) {
                console.error('Failed to load categories:', err)
            }
        }
        loadCategories()
    }, [])

    // Load my communities
    useEffect(() => {
        const loadMyCommunities = async () => {
            try {
                const data = await communityApi.getMyCommunities()
                setMyCommunities(data || [])
            } catch (err) {
                console.error('Failed to load my communities:', err)
            }
        }
        loadMyCommunities()
    }, [])

    // Load communities
    const loadCommunities = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            let data
            if (searchQuery.trim()) {
                data = await communityApi.searchCommunities(searchQuery, {
                    category: selectedCategory,
                    page,
                    limit: 12,
                })
            } else {
                data = await communityApi.getCommunities({
                    category: selectedCategory,
                    sort: sortBy,
                    page,
                    limit: 12,
                })
            }
            setCommunities(data.communities || [])
            setPagination(data.pagination || null)
        } catch (err) {
            setError(err.message || 'Không thể tải danh sách cộng đồng')
            console.error('Failed to load communities:', err)
        } finally {
            setIsLoading(false)
        }
    }, [searchQuery, selectedCategory, sortBy, page])

    useEffect(() => {
        loadCommunities()
    }, [loadCommunities])

    // Handle search
    const handleSearch = (e) => {
        setSearchQuery(e.target.value)
        setPage(1)
    }

    // Handle join
    const handleJoin = async (community) => {
        try {
            await communityApi.joinCommunity(community.id, 'approved')
            setMyCommunities((prev) => [...prev, community])
        } catch (err) {
            console.error('Failed to join community:', err)
        }
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <h1 className="text-2xl font-bold text-foreground">
                            Explore Communities
                        </h1>
                        <button
                            onClick={() => navigate('/app/communities/create')}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
                        >
                            <PlusIcon className="h-5 w-5" />
                            Create Community
                        </button>
                    </div>

                    {/* Search and Filters */}
                    <div className="mt-4 flex flex-col sm:flex-row gap-4">
                        {/* Search */}
                        <div className="relative flex-1">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={handleSearch}
                                placeholder="Search communities..."
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            />
                        </div>

                        {/* Sort */}
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="px-4 py-2.5 rounded-xl border border-border bg-muted/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="popular">Most Popular</option>
                            <option value="newest">Newest</option>
                            <option value="alphabetical">A-Z</option>
                        </select>

                        {/* View Mode */}
                        <div className="flex rounded-xl border border-border overflow-hidden">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2.5 ${viewMode === 'grid'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                    }`}
                            >
                                <Squares2X2Icon className="h-5 w-5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2.5 ${viewMode === 'list'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                    }`}
                            >
                                <ListBulletIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${!selectedCategory
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.category}
                                onClick={() => setSelectedCategory(cat.category)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === cat.category
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                    }`}
                            >
                                {cat.category} ({cat.count})
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                {/* My Communities Section */}
                {myCommunities.length > 0 && !searchQuery && !selectedCategory && (
                    <div className="mb-8">
                        <h2 className="text-lg font-semibold text-foreground mb-4">
                            My Communities
                        </h2>
                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {myCommunities.slice(0, 5).map((community) => (
                                <Link
                                    key={community.id || community.community_id}
                                    to={`/c/${community.slug}`}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
                                >
                                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                                        <UsersIcon className="h-3 w-3" />
                                    </div>
                                    {community.name}
                                </Link>
                            ))}
                            {myCommunities.length > 5 && (
                                <span className="px-4 py-2 text-muted-foreground">
                                    +{myCommunities.length - 5} more
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Loading */}
                {isLoading && (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="text-center py-12">
                        <p className="text-destructive">{error}</p>
                        <button
                            onClick={loadCommunities}
                            className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Communities Grid/List */}
                {!isLoading && !error && (
                    <>
                        {communities.length === 0 ? (
                            <div className="text-center py-12">
                                <UsersIcon className="h-16 w-16 mx-auto text-muted-foreground/50" />
                                <p className="mt-4 text-muted-foreground">
                                    {searchQuery
                                        ? 'No communities found'
                                        : 'No communities yet'}
                                </p>
                                <button
                                    onClick={() => navigate('/app/communities/create')}
                                    className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground"
                                >
                                    Create First Community
                                </button>
                            </div>
                        ) : (
                            <div
                                className={
                                    viewMode === 'grid'
                                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                                        : 'flex flex-col gap-4'
                                }
                            >
                                {communities.map((community) => (
                                    <CommunityCard
                                        key={community.id}
                                        community={community}
                                        isJoined={myCommunitySlugs.has(community.slug)}
                                        onJoin={handleJoin}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        {pagination && pagination.totalPages > 1 && (
                            <div className="flex justify-center gap-2 mt-8">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 rounded-xl border border-border text-foreground disabled:opacity-50"
                                >
                                    Previous
                                </button>
                                <span className="px-4 py-2 text-muted-foreground">
                                    Page {page} / {pagination.totalPages}
                                </span>
                                <button
                                    onClick={() =>
                                        setPage((p) => Math.min(pagination.totalPages, p + 1))
                                    }
                                    disabled={page === pagination.totalPages}
                                    className="px-4 py-2 rounded-xl border border-border text-foreground disabled:opacity-50"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
