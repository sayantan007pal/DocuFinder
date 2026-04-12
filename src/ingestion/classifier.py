"""
src/ingestion/classifier.py — PDF Type Classifier using PyMuPDF.
Analyzes PDF structure to determine optimal parsing strategy.
Adds ~50-100ms per PDF but saves significant parsing time.
Disable with ENABLE_PDF_CLASSIFICATION=false.
"""
from enum import Enum

import structlog

log = structlog.get_logger(__name__)


class PDFType(str, Enum):
    TEXT_DENSE = "text_dense"       # >90% extractable text → LiteParse fast
    SCANNED = "scanned"             # <10% text, primarily images → Unstructured hi_res OCR
    COMPLEX_LAYOUT = "complex"      # Tables, multi-column, charts → Unstructured hi_res
    MIXED = "mixed"                 # Combination → Unstructured fast+OCR


def classify_pdf(file_path: str) -> PDFType:
    """
    Analyze a PDF and return its type to inform parser routing.
    Uses PyMuPDF for fast structural analysis.
    """
    import fitz  # PyMuPDF

    try:
        doc = fitz.open(file_path)
        total_pages = len(doc)

        if total_pages == 0:
            return PDFType.TEXT_DENSE

        text_pages = 0
        image_heavy_pages = 0
        table_detected = False

        for page in doc:
            text = page.get_text()
            images = page.get_images()

            # find_tables may not exist in older pymupdf — try/except
            tables = []
            try:
                tables = page.find_tables().tables
            except AttributeError:
                pass

            # Text density heuristic: characters per unit area
            area = max(page.rect.width * page.rect.height, 1)
            text_ratio = len(text) / area

            if text_ratio > 0.001:  # Has substantial text
                text_pages += 1
            if len(images) > 2:
                image_heavy_pages += 1
            if tables:
                table_detected = True

        doc.close()

        text_pct = text_pages / total_pages
        image_pct = image_heavy_pages / total_pages

        if text_pct > 0.9 and not table_detected:
            result = PDFType.TEXT_DENSE
        elif text_pct < 0.1 and image_pct > 0.5:
            result = PDFType.SCANNED
        elif table_detected or image_pct > 0.3:
            result = PDFType.COMPLEX_LAYOUT
        else:
            result = PDFType.MIXED

        log.info("pdf_classified",
                 file=file_path,
                 type=result.value,
                 text_pct=round(text_pct, 2),
                 image_pct=round(image_pct, 2),
                 table_detected=table_detected,
                 total_pages=total_pages)
        return result

    except Exception as exc:
        log.warning("pdf_classification_failed",
                    file=file_path, error=str(exc),
                    fallback="mixed")
        return PDFType.MIXED
