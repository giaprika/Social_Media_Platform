from enum import Enum

class PostType(str, Enum):
    USER = "user"
    GROUP = "group"

class ReactionType(str, Enum):
    LIKE = "like"
    LOVE = "love"
    HAHA = "haha"
    SAD = "sad"
    ANGRY = "angry"

class SharedType(str, Enum):
    ORIGINAL = "original"
    SHARED = "shared"

class Visibility(str, Enum):
    PUBLIC = "public"
    FRIENDS = "friends"
    PRIVATE = "private"
