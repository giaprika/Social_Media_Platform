import sys
from pathlib import Path

# Add parent directory to sys.path to allow importing tools and config
sys.path.insert(0, str(Path(__file__).parent.parent))

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
            print(f"Setting image_content in context: done!")
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
    flag content that is inappropriate, offensive, or violates any rules.

    When analyzing content, consider the following guidelines:
    1. **Hate Speech & Regional Discrimination (PBVM):** - Flag content promoting violence or hatred based on race, ethnicity, religion, gender, etc.
       - **Strictly flag Regional Discrimination (Phân biệt vùng miền):** Look for derogatory terms targeting people based on their region (North/South/Central). Be vigilant for slurs such as "bắc kỳ", "nam kỳ", "trọ trẹ", "parky", "namiki", or variations intended to demean specific regions.

    2. **Harassment, Bullying & Toxicity:** - Identify content intending to harass, intimidate, or bully.
       - Flag "Toxic" comments including excessive profanity, personal attacks, or vulgar insults (e.g., variations of "dm", "cc", "occho", "ngu", "lol", "deo", etc.).
    3. Animal abuse, genitalia: Identify content that depicts or promotes harm to animals, including explicit images of animal genitalia.
    4. Misinformation: Look for false or misleading information that could harm individuals or the public.
    5. Nudity and Sexual Content: Flag sexually explicit material or content that is not suitable for all audiences.
    6. Explicit Content: Flag sexually explicit material or content that is not suitable for all audiences (revealing clothing, bikini, sexual acts, etc).
    7. Violence: Identify content that depicts or promotes violence or self-harm.
    8. Haunting or Shocking Content: Flag content that is excessively graphic or disturbing.
    9. Fetish Content: Identify content that depicts fetishistic behavior or themes(wearing tight latex, leather outfits, very thin clothing that accentuates body parts, etc).
    10. Anti-State Content (Vietnam Context): Identify and flag content, particularly images or media, that contains reactionary elements, subversive propaganda, distorted historical facts, or symbols/messages opposing the Socialist Republic of Vietnam.
    11. Territorial Sovereignty: Strictly flag and report any content, maps, or statements that deny, dispute, or misrepresent Vietnam's sovereignty over the Paracel (Hoang Sa) and Spratly (Truong Sa) archipelagos. This includes content supporting the illegal 'nine-dash line' (cow's tongue line) or claiming these territories belong to another nation.
    12. Illegal Activities: Flag content promoting illegal activities or substances.
    13. Drug related hazard content: Identify content that promotes or depicts drug use or related drug hazardous behavior(all drug images are not allowed).
    14. Payday loan content: Identify and flag content promoting predatory lending practices or payday loans.
    15. Spiritual scams/abuse: Identify and flag content that promotes fraudulent spiritual practices or scams.
    16. Self-harm: Identify content that promotes or depicts self-harm or suicidal behavior (cutting, hanging, all bloody images is not allowed, etc).

    When you find content that violates these guidelines, call report_user_violation tool. Finally, return only json result example:
    {
        "result": "Banned or Warning or Accepted", 
        "message": "Detailed explanation of the decision."
    }
    """,
    tools=[report_user_violation],
    before_agent_callback=set_user_id_before_tool_callback,
)

