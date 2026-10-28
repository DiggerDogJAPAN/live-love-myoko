"""Replaceable translation boundary. No API SDKs, credentials or network calls."""

from dataclasses import dataclass, replace
from typing import Mapping, Optional, Protocol

from .models import Property


@dataclass(frozen=True)
class TranslationResult:
    text: Optional[str]
    provider: str
    model: Optional[str] = None


class Translator(Protocol):
    def translate(self, text: str, *, source_language: str = "ja", target_language: str = "en") -> TranslationResult:
        ...


class DisabledTranslator:
    def translate(self, text: str, *, source_language: str = "ja", target_language: str = "en") -> TranslationResult:
        return TranslationResult(None, "disabled")


class MockTranslator:
    """Only pre-authored strings; never misrepresent a stub as an AI translation."""
    def __init__(self, translations: Mapping[str, str]) -> None:
        self.translations = dict(translations)

    def translate(self, text: str, *, source_language: str = "ja", target_language: str = "en") -> TranslationResult:
        if (source_language, target_language) != ("ja", "en"):
            raise ValueError("Mock supports Japanese to English only")
        return TranslationResult(self.translations.get(text), "mock")


def translate_property(prop: Property, translator: Translator) -> Property:
    title = translator.translate(prop.title_ja).text
    description = translator.translate(prop.description_ja).text if prop.description_ja else None
    return replace(prop, title_en=title or prop.title_en, description_en=description or prop.description_en)
