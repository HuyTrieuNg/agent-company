"""Search node: fetch source homepage and extract article URLs via heuristic first, falling back to LLM."""
import json
import logging
import re
import httpx
from bs4 import BeautifulSoup
from ....config import settings
from ....ollama_service import generate_ollama_content
from ..state import ResearchState

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """Bạn là trợ lý phân tích nội dung web.
Từ nội dung trang web được cung cấp, hãy trích xuất danh sách URL các bài báo liên quan đến từ khóa.
Trả về JSON array các URL tuyệt đối (bắt đầu bằng http), tối đa {max_articles} URL.
Chỉ lấy URL bài báo thực sự, không lấy URL danh mục hay trang chủ.
Định dạng: ["url1", "url2", ...]
Chỉ trả về JSON array thuần túy."""


async def _fetch_and_clean_soup(url: str, timeout: int = 15) -> BeautifulSoup:
    """Fetch URL and return BeautifulSoup object with noise tags and layout elements removed."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    }
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Decompose script, style, nav, footer, header, aside, iframe
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
            tag.decompose()
            
        # Decompose elements with navigation/layout classes
        for tag in soup.find_all(class_=True):
            try:
                classes = tag.get("class", [])
                if not isinstance(classes, list):
                    classes = [str(classes)]
                cls = " ".join(classes).lower()
                if any(x in cls for x in ["menu", "header", "footer", "sidebar", "navbar", "breadcrumb"]):
                    tag.decompose()
            except Exception:
                pass
                
        return soup


def _get_sub_keywords(keywords: list[str]) -> list[str]:
    """Break down long keyword phrases into smaller, matchable sub-phrases/words to improve search recall."""
    sub_kws = set()
    stop_words = {
        "hôm", "nay", "tin", "nhanh", "ngày", "năm", "tháng", "tại", "trên", 
        "trong", "dưới", "qua", "cho", "của", "đã", "đang", "sẽ", "là", "và", 
        "thì", "mà", "ở", "về", "có", "một", "các", "những"
    }
    for kw in keywords:
        kw = kw.strip().lower()
        if not kw:
            continue
        words = kw.split()
        if len(words) <= 3:
            sub_kws.add(kw)
        
        # Extract 2-word combinations
        for i in range(len(words) - 1):
            w1, w2 = words[i], words[i+1]
            if w1 not in stop_words and w2 not in stop_words:
                sub_kws.add(f"{w1} {w2}")
                
        # Extract single significant words
        for w in words:
            if len(w) >= 3 and w not in stop_words and not w.isdigit():
                if '-' in w or w.isupper() or len(w) > 4:
                    sub_kws.add(w)
                    
    return sorted(list(sub_kws), key=len, reverse=True)


def _extract_links_heuristically(soup: BeautifulSoup, base_url: str, keywords: list[str], max_links: int) -> list[str]:
    """Extract article links heuristically using keywords and link structures to save LLM calls."""
    found = []
    seen = set()
    base = base_url.rstrip("/")
    domain = "/".join(base.split("/")[:3])
    
    # Get broader sub-keywords for better matching
    sub_keywords = _get_sub_keywords(keywords)
    logger.info(f"[SearchNode] Sub-keywords for matching: {sub_keywords}")
    
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        text = a.get_text(strip=True)
        
        # Build absolute URL
        if href.startswith("http"):
            url = href
        elif href.startswith("/"):
            url = domain + href
        else:
            url = base + "/" + href
            
        if url in seen:
            continue
            
        path = url.split("?")[0]
        exclude_keywords = [
            "/tag/", "/category/", "/chuyen-muc/", "/login", "/register", 
            "/search", "/tim-kiem", "/rss", "/video/", "/photo/", "/interactive/"
        ]
        if any(ex in path.lower() for ex in exclude_keywords):
            continue
            
        # Match patterns of standard article links
        is_article_pattern = False
        if any(path.endswith(ext) for ext in [".html", ".htm", ".chn"]):
            is_article_pattern = True
        elif len(path.split("/")) > 4:  # e.g., domain/path/to/article-title
            is_article_pattern = True
            
        if not is_article_pattern:
            continue
            
        # Ensure it looks like a real article URL and not a list/category page
        # Article URLs on CafeF, Tuoi Tre, and Vietstock typically end with an ID suffix (e.g., -123456789.htm or -12345.chn)
        filename = path.split("/")[-1]
        if not re.search(r'-\d+\.(htm|chn|html)$', filename):
            continue
            
        # Match sub-keywords in text or path/URL
        text_lower = text.lower()
        url_lower = url.lower()
        if any(kw in text_lower for kw in sub_keywords) or any(kw in url_lower for kw in sub_keywords):
            seen.add(url)
            found.append(url)
            if len(found) >= max_links:
                break
                
    return found


async def search_node(state: ResearchState) -> dict:
    """For each source-to-fetch, fetch its homepage and extract article URLs."""
    sources_to_fetch = state.get("sources_to_fetch", [])
    intent = state.get("intent", {})
    keywords = intent.get("keywords", [])
    max_articles = settings.max_articles_per_source

    all_urls: list[str] = []

    for source in sources_to_fetch:
        try:
            logger.info(f"[SearchNode] Fetching {source['name']}: {source['base_url']}")
            soup = await _fetch_and_clean_soup(source["base_url"])
            
            # Step 1: Try Heuristic Link Extraction first
            heuristic_urls = _extract_links_heuristically(soup, source["base_url"], keywords, max_articles)
            if heuristic_urls:
                logger.info(f"[SearchNode] Heuristic found {len(heuristic_urls)} URLs from {source['name']}. Skipping LLM.")
                all_urls.extend(heuristic_urls)
                continue
                
            # Step 2: Fallback to Gemini LLM if no links found via heuristics
            logger.info(f"[SearchNode] Heuristic found 0 URLs from {source['name']}. Falling back to Gemini.")
            page_text = soup.get_text(separator="\n", strip=True)[:8000]  # cap at 8k chars
            
            prompt = (
                f"Từ khóa cần tìm: {', '.join(keywords)}\n\n"
                f"Nội dung trang {source['name']}:\n{page_text}"
            )
            system = SYSTEM_PROMPT.format(max_articles=max_articles)

            raw = await generate_ollama_content(
                model=settings.research_model_name,
                contents=prompt,
                system_instruction=system,
                json_format=True,
            )
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            urls = json.loads(raw)
            if isinstance(urls, list):
                # Ensure absolute URLs
                base = source["base_url"].rstrip("/")
                domain = "/".join(base.split("/")[:3])
                cleaned = []
                for u in urls:
                    if isinstance(u, str):
                        if u.startswith("http"):
                            cleaned.append(u)
                        elif u.startswith("/"):
                            cleaned.append(domain + u)
                all_urls.extend(cleaned[:max_articles])
                logger.info(f"[SearchNode] Gemini found {len(cleaned)} URLs from {source['name']}")
        except Exception as e:
            logger.warning(f"[SearchNode] Error on {source['name']}: {e}")

    return {
        "found_urls": all_urls,
        "progress_step": f"🔗 Tìm được {len(all_urls)} bài viết để đọc",
    }
