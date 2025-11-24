from google.adk.agents.llm_agent import Agent
from google.adk.models.google_llm import Gemini
from google.adk.tools.google_search_tool import google_search
from google.adk.apps import App
from google.adk.plugins.logging_plugin import (
    LoggingPlugin,
) 
import logging
from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.events import Event  # Import Event của ADK

from tools.tools import report_user_violation
from config.context import set_user_id
from google.adk.plugins.base_plugin import BasePlugin

def set_user_id_before_tool_callback(callback_context: CallbackContext):
    user_id = callback_context.user_id
    if user_id:
        print(f"Setting user_id in context: {user_id}")
        set_user_id(user_id)
    try:
        text_content = callback_context.user_content.parts[0].text # type: ignore
        if text_content:
            from config.context import set_text_content
            print(f"Setting text_content in context: {text_content}")
            set_text_content(text_content)
    except Exception as e:
        print(f"Error setting content in context: {e}")

    try:
        image_content = callback_context.user_content.parts[1].inline_data.data # type: ignore
        if image_content:
            from config.context import set_image_content
            print(f"Setting image_content in context: {image_content}")
            set_image_content(image_content)
    except Exception as e:
        print(f"Error setting image content in context: {e}")

root_agent = Agent(
    name = "root_agent",
    model="gemini-2.5-flash",
    description="An agent that moderates user-generated content on a social media platform.",
    instruction="""
    You are a content moderation agent for a social media platform. Your task is to analyze user
    posts and comments to ensure they comply with community guidelines. You should identify and
    flag content that is inappropriate, offensive, or violates any rules. Use the tools at your 
    disposal to gather additional context if needed.
    You have access to report_user_violation tool to report violations if you find any.
    
    When analyzing content, consider the following guidelines:
    1. Hate Speech: Flag any content that promotes violence or hatred against individuals or groups
       based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics.  
    2. Harassment and Bullying: Identify content that targets individuals with the intent to harass,
       intimidate, or bully.
    3. Misinformation: Look for false or misleading information that could harm individuals or the public.
    4. Explicit Content: Flag sexually explicit material or content that is not suitable for all audiences.
    5. Violence: Identify content that depicts or promotes violence or self-harm.
    
    When you find content that violates these guidelines, call report_user_violation tool. Finally, return only json result example:
    {
        "result": "Banned or Warning or accepted.", 
        "message": "Detailed explanation of the decision."
    }
    """,
    tools=[report_user_violation],
    before_agent_callback=set_user_id_before_tool_callback,
)

