import { CalendarIcon, MapPinIcon, UsersIcon } from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

const UpcomingEvents = ({ events = [] }) => {
  // Mock data nếu không có
  const defaultEvents = [
    {
      id: "1",
      title: "Tech Meetup: AI & Machine Learning",
      community: "technology",
      date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      location: "Online",
      attendees: 245,
      isJoined: false,
      icon: "🤖",
    },
    {
      id: "2",
      title: "Web Dev Workshop: React 19",
      community: "webdev",
      date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days
      location: "Virtual",
      attendees: 189,
      isJoined: true,
      icon: "⚛️",
    },
    {
      id: "3",
      title: "Design Systems Masterclass",
      community: "design",
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      location: "Zoom",
      attendees: 156,
      isJoined: false,
      icon: "🎨",
    },
    {
      id: "4",
      title: "Gaming Tournament: CS2",
      community: "gaming",
      date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
      location: "Discord",
      attendees: 432,
      isJoined: false,
      icon: "🎮",
    },
  ];

  const displayEvents = events.length > 0 ? events : defaultEvents;

  const formatDate = (date) => {
    try {
      return formatDistanceToNow(date, {
        addSuffix: true,
        locale: vi,
      });
    } catch {
      return "Sắp diễn ra";
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Upcoming Events
          </h3>
        </div>
      </div>

      <div className="divide-y divide-border">
        {displayEvents.slice(0, 4).map((event) => (
          <div
            key={event.id}
            className="px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer group"
          >
            <div className="flex gap-2.5">
              {/* Event Icon */}
              <div className="flex-shrink-0">
                <span className="text-2xl">{event.icon}</span>
              </div>

              {/* Event Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-1">
                  {event.title}
                </h4>
                
                <div className="space-y-0.5">
                  {/* Community */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-primary">
                      s/{event.community}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarIcon className="h-3 w-3 flex-shrink-0" />
                    <span>{formatDate(event.date)}</span>
                  </div>

                  {/* Location & Attendees */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPinIcon className="h-3 w-3 flex-shrink-0" />
                      {event.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <UsersIcon className="h-3 w-3 flex-shrink-0" />
                      {formatNumber(event.attendees)}
                    </span>
                  </div>
                </div>

                {/* Join Button */}
                {event.isJoined ? (
                  <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                      ✓ Joined
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle join
                    }}
                    className="mt-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    Join Event
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full px-3 py-2.5 text-xs font-medium text-primary hover:bg-muted/50 transition-colors border-t border-border">
        View All Events
      </button>
    </div>
  );
};

export default UpcomingEvents;

