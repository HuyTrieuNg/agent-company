from backend.sources_registry import sources_registry


def test_sources_registry_loading():
    known = sources_registry.get_known_sites()
    assert "cafef" in known
    assert "thesaigontimes" in known
    assert "vneconomy" in known


def test_sources_registry_normalization():
    assert sources_registry.normalize_site("Cafe F") == "cafef"
    assert sources_registry.normalize_site("The Saigon Times") == "thesaigontimes"
    assert sources_registry.normalize_site("VnEconomy") == "vneconomy"
    assert sources_registry.normalize_site("cafef") == "cafef"


def test_sources_prompt_summary():
    summary = sources_registry.get_sources_prompt_summary()
    assert "cafef" in summary
    assert "thesaigontimes" in summary
    assert "vneconomy" in summary
