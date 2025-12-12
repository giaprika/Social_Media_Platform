from contextvars import ContextVar

# Khởi tạo biến context, mặc định là None
_user_id_ctx: ContextVar[str] = ContextVar("user_id", default=None)
_text_content_ctx: ContextVar[str] = ContextVar("text_content", default=None)
_image_content_ctx: ContextVar[bytes] = ContextVar("image_content", default=None)

def set_text_content(text_content: str):
    """Gán text_content cho request hiện tại"""
    print(f"Setting text_content in context: {text_content}")
    return _text_content_ctx.set(text_content)
def get_text_content() -> str:
    """Lấy text_content hiện tại (dùng trong Tool)"""
    print("Getting text_content from context")
    return _text_content_ctx.get()

def set_image_content(image_content: bytes):
    """Gán image_content cho request hiện tại"""
    print(f"Setting image_content in context: {image_content}")
    return _image_content_ctx.set(image_content)
def get_image_content() -> bytes:
    """Lấy image_content hiện tại (dùng trong Tool)"""
    print("Getting image_content from context")
    return _image_content_ctx.get()

def set_user_id(user_id: str):
    """Gán user_id cho request hiện tại"""
    print(f"Setting user_id in context: {user_id}")
    return _user_id_ctx.set(user_id)

def get_user_id() -> str:
    """Lấy user_id hiện tại (dùng trong Tool)"""
    print("Getting user_id from context")
    return _user_id_ctx.get()