"""Extracts text from .docx/.doc/.pdf files referenced in TZ text."""
import re
from pathlib import Path


def extract_file_paths(text: str) -> list[str]:
    """Find Windows file paths in text."""
    pattern = r'"([A-Za-z]:\\[^"]+\.(?:docx|doc|pdf|txt|md))"'
    return re.findall(pattern, text, re.IGNORECASE)


def read_docx(path: str) -> str:
    """Read .docx file using python-docx."""
    try:
        from docx import Document
        doc = Document(path)
        parts = []
        for p in doc.paragraphs:
            if p.text.strip():
                parts.append(p.text)
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
                if row_text:
                    parts.append(row_text)
        return "\n".join(parts)
    except Exception as e:
        return f"[Ошибка чтения docx: {e}]"


_SOFFICE = r"C:\Program Files\LibreOffice\program\soffice.exe"


def read_doc(path: str) -> str:
    """Read .doc via LibreOffice: convert to .docx first, then read with python-docx."""
    import subprocess, tempfile
    abs_path = str(Path(path).resolve())
    with tempfile.TemporaryDirectory() as tmp:
        try:
            result = subprocess.run(
                [_SOFFICE, "--headless", "--convert-to", "docx", "--outdir", tmp, abs_path],
                capture_output=True, timeout=30
            )
            docx_files = list(Path(tmp).glob("*.docx"))
            if docx_files:
                return read_docx(str(docx_files[0]))
        except Exception:
            pass
    # Fallback: try python-docx directly (works for some .doc)
    try:
        return read_docx(path)
    except Exception:
        return f"[Не удалось прочитать {Path(path).name}: установи LibreOffice или сконвертируй в .docx]"


def read_txt(path: str, prefer_cp1251: bool = False) -> str:
    order = ("cp1251", "utf-8", "latin-1") if prefer_cp1251 else ("utf-8", "cp1251", "latin-1")
    for enc in order:
        try:
            text = Path(path).read_text(encoding=enc)
            # Reject if too many replacement characters (wrong encoding)
            if text.count('�') < len(text) * 0.05:
                return text
        except (UnicodeDecodeError, LookupError):
            continue
    return Path(path).read_text(encoding="utf-8", errors="replace")


def expand_file_refs(tz_text: str) -> str:
    """Replace file path references in TZ with their actual content."""
    paths = extract_file_paths(tz_text)
    if not paths:
        return tz_text

    expanded = tz_text
    for path_str in paths:
        p = Path(path_str)
        if not p.exists():
            continue

        suffix = p.suffix.lower()
        if suffix == ".docx":
            content = read_docx(path_str)
        elif suffix == ".doc":
            content = read_doc(path_str)
        elif suffix in (".txt", ".md"):
            content = read_txt(path_str)
        else:
            continue

        label = f"\n\n--- Содержимое файла: {p.name} ---\n{content}\n--- Конец файла ---"
        expanded = expanded.replace(f'"{path_str}"', f'"{path_str}"{label}')

    return expanded
