import os
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Singleton storage for known sources and categories
_CATEGORIES_FILE = os.path.join(os.path.dirname(__file__), "categories.json")

# Normalization mapping for common user typos or alias site names -> canonical site code
SITE_ALIASES: dict[str, str] = {
    "cafef": "cafef",
    "cafe f": "cafef",
    "saigon times": "thesaigontimes",
    "saigontimes": "thesaigontimes",
    "the saigon times": "thesaigontimes",
    "thesaigontimes": "thesaigontimes",
    "vneconomy": "vneconomy",
    "vn economy": "vneconomy",
    "vnecon": "vneconomy",
}


class SourcesRegistry:
    def __init__(self, json_path: str = _CATEGORIES_FILE):
        self.json_path = json_path
        self.sources: dict[str, list[dict[str, str]]] = {}
        self.load_registry()

    def load_registry(self) -> None:
        """Load sources and categories from static JSON file."""
        if os.path.exists(self.json_path):
            try:
                with open(self.json_path, "r", encoding="utf-8") as f:
                    self.sources = json.load(f)
                logger.info(f"Loaded {len(self.sources)} sources from {self.json_path}")
            except Exception as e:
                logger.error(f"Failed to load categories JSON from {self.json_path}: {e}")
                self.sources = {}
        else:
            logger.warning(f"Categories file {self.json_path} not found.")

    def normalize_site(self, site_input: str) -> str:
        """Normalize site name input to canonical site code."""
        if not site_input:
            return ""
        s = site_input.lower().strip()
        if s in SITE_ALIASES:
            return SITE_ALIASES[s]
        for key, canonical in SITE_ALIASES.items():
            if key in s:
                return canonical
        return s

    def get_known_sites(self) -> list[str]:
        """Return list of canonical site names in DB/registry."""
        return list(self.sources.keys())

    def get_sources_prompt_summary(self) -> str:
        """
        Generate a readable text summary of available sites & categories in DB.
        Used for LLM query extraction & chat system prompts.
        """
        lines = ["Danh sách các nguồn trang web tin tức và danh mục khả dụng trong DB:"]
        for site, cat_list in self.sources.items():
            categories = []
            for item in cat_list:
                categories.extend(item.keys())
            cats_str = ", ".join(categories)
            lines.append(f"- Nguồn '{site}': gồm các danh mục [{cats_str}]")
        return "\n".join(lines)


# Global registry instance
sources_registry = SourcesRegistry()
