"""TypedDict and Pydantic models for Market (Gold, Forex, Stock, News) data."""

from typing import TypedDict

from pydantic import BaseModel, Field

# ── Gold Schemas ──────────────────────────────────────────────────────────────


class GoldItem(TypedDict):
    code: str
    name: str
    unit: str
    buy_price: float
    sell_price: float
    change_amount: float
    change_percent: float
    spread: float
    high_24h: float
    low_24h: float


class GoldOverview(TypedDict):
    updated_at: str
    items: list[GoldItem]


class GoldHistoryPoint(TypedDict):
    time: str
    date: str
    buy: float
    sell: float
    middle: float


class GoldHistoryResponse(TypedDict):
    code: str
    name: str
    unit: str
    timeframe: str
    data: list[GoldHistoryPoint]


class GoldNewsItem(TypedDict):
    id: int
    title: str
    summary: str
    source: str
    published_at: str
    url: str


# ── Forex Schemas ─────────────────────────────────────────────────────────────


class ForexItem(TypedDict):
    code: str
    name: str
    symbol: str
    cash_buy: float
    transfer_buy: float
    sell: float
    change_amount: float
    change_percent: float
    spread: float
    high_24h: float
    low_24h: float


class ForexOverview(TypedDict):
    updated_at: str
    bank: str
    items: list[ForexItem]


class ForexHistoryPoint(TypedDict):
    time: str
    date: str
    buy: float
    sell: float
    middle: float


class ForexHistoryResponse(TypedDict):
    code: str
    name: str
    symbol: str
    timeframe: str
    data: list[ForexHistoryPoint]


class ForexNewsItem(TypedDict):
    id: int
    title: str
    summary: str
    source: str
    published_at: str
    url: str


# ── Stock Schemas ─────────────────────────────────────────────────────────────


class StockOverview(TypedDict, total=False):
    symbol: str
    company_name: str
    exchange: str
    industry: str
    market_cap: float | int | None
    pe_ratio: float | None
    pb_ratio: float | None
    ps_ratio: float | None
    eps: float | None
    beta: float | None
    current_price: float | int | None
    price_change: float | int | None
    price_change_pct: float | None
    week_52_high: float | int | None
    week_52_low: float | int | None
    volume: float | int | None
    avg_volume: float | int | None
    description: str
    error: str


class StockTradingRecord(TypedDict, total=False):
    time: str
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: float | int | None


class StockTradingResponse(TypedDict):
    symbol: str
    data: list[dict[str, object]]
    count: int


class StockFinancialResponse(TypedDict):
    symbol: str
    report_type: str
    period: str
    data: list[dict[str, object]]


class StockNewsItem(TypedDict, total=False):
    title: str
    news_title: str
    summary: str
    head: str
    source: str
    url: str
    news_source_link: str
    news_url: str
    published_date: str
    publish_time: str
    public_date: str


class StockNewsResponse(TypedDict):
    symbol: str
    data: list[dict[str, object]]
    count: int


class StockIndicators(TypedDict):
    sma_20: float | None
    sma_50: float | None
    sma_200: float | None
    rsi_14: float | None
    macd: float | None
    macd_signal: float | None
    macd_histogram: float | None
    bb_upper: float | None
    bb_middle: float | None
    bb_lower: float | None


class StockPricePoint(TypedDict):
    time: str | None
    close: float | int | None


class StockTechnicalsResponse(TypedDict, total=False):
    symbol: str
    timeframe: str
    last_price: float | int | None
    data_points: int
    indicators: StockIndicators
    price_history: list[StockPricePoint]
    error: str


class StockSearchResultItem(TypedDict):
    symbol: str
    company_name: str


class StockSearchResponse(TypedDict):
    results: list[StockSearchResultItem]


# ── News Schemas ──────────────────────────────────────────────────────────────


class FullArticleRequest(BaseModel):
    url_hashes: list[str] = Field(default_factory=list, description="List of URL hashes")
    article_urls: list[str] = Field(default_factory=list, description="List of article URLs")


class NewsSiteInfo(TypedDict):
    code: str
    name: str


class NewsCategoriesResponse(TypedDict):
    sites: list[NewsSiteInfo]
    categories: list[str]


class NewsArticleItem(TypedDict, total=False):
    id: str
    url_hash: str
    title: str
    sapo: str
    site: str
    category: str
    published_at: str
    author: str
    tags: list[str]
    url: str
    score: float | None


class NewsArticleListResponse(TypedDict):
    page: int
    limit: int
    total_retrieved: int
    articles: list[NewsArticleItem]


class FullArticleItem(TypedDict, total=False):
    url_hash: str
    url: str
    title: str
    sapo: str
    content: str
    site: str
    category: str
    published_at: str
    author: str
    tags: list[str]
    chunk_count: int


class FullArticleResponse(TypedDict):
    articles: list[FullArticleItem]
