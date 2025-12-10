import { useOutletContext } from 'react-router-dom'
import { PencilSquareIcon } from '@heroicons/react/24/outline'

// Placeholder for posts - will integrate with post-service later
const PostPlaceholder = () => (
    <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">
            Chức năng bài viết trong cộng đồng sẽ được tích hợp sau khi kết nối với
            Post Service.
        </p>
    </div>
)

export default function CommunityFeed() {
    const { community, membership } = useOutletContext()
    const isMember = membership?.status === 'approved'

    return (
        <div className="space-y-4">
            {/* Create Post Box */}
            {isMember && (
                <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <PencilSquareIcon className="h-5 w-5 text-primary" />
                        </div>
                        <button className="flex-1 text-left px-4 py-2.5 rounded-xl bg-muted/50 text-muted-foreground hover:bg-muted transition-colors">
                            Viết bài trong {community?.name}...
                        </button>
                    </div>
                </div>
            )}

            {/* Posts */}
            <PostPlaceholder />
        </div>
    )
}
