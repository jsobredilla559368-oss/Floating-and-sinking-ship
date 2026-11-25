"""Export Cargo Draft Lab technical report HTML to print-ready A4 PDF.

Uses an installed Chromium-based browser (Google Chrome or Microsoft Edge) in
headless mode with print-to-PDF flags, verifies that the generated PDF exists
and exceeds 50 KB, and reports exact file size and page count.

Usage:
    python docs/export_pdf.py
    python docs/export_pdf.py --html docs/report.html --pdf docs/Cargo_Draft_Lab_Report.pdf
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zlib

MIN_PDF_BYTES: int = 50 * 1024  # 50 KB minimum validity threshold


def find_headless_browser() -> Path:
    """Locate an installed Google Chrome or Microsoft Edge executable."""
    candidates: list[Path] = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    ]
    for path in candidates:
        if path.is_file():
            return path

    for binary in ("chrome", "google-chrome", "chromium", "chromium-browser", "msedge"):
        found = shutil.which(binary)
        if found:
            return Path(found)

    raise FileNotFoundError(
        "No supported headless browser found. Install Google Chrome or Microsoft Edge."
    )


def count_pdf_pages(pdf_path: Path) -> int:
    """Determine exact page count of a Chromium-generated PDF without third-party libs.

    Inspects both uncompressed PDF dictionary objects and FlateDecode object
    streams for /Type /Pages (/Count N) and /Type /Page markers.
    """
    data = pdf_path.read_bytes()

    # Collect raw bytes plus any FlateDecode-compressed object streams.
    buffers: list[bytes] = [data]
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.DOTALL):
        chunk = match.group(1)
        try:
            decompressed = zlib.decompress(chunk)
        except zlib.error:
            continue
        buffers.append(decompressed)

    combined = b"\n".join(buffers)

    # First, look for /Type /Pages root dictionary with /Count N.
    pages_counts: list[int] = []
    for obj_match in re.finditer(rb"<<(.*?)>>", combined, re.DOTALL):
        body = obj_match.group(1)
        if re.search(rb"/Type\s*/Pages\b", body):
            cnt_match = re.search(rb"/Count\s+(\d+)\b", body)
            if cnt_match:
                pages_counts.append(int(cnt_match.group(1)))

    if pages_counts:
        return max(pages_counts)

    # Fallback: count individual /Type /Page objects (excluding /Type /Pages).
    page_matches = re.findall(rb"/Type\s*/Page(?![a-zA-Z])", combined)
    return len(page_matches)


def export_html_to_pdf(html_path: Path, pdf_path: Path) -> dict[str, object]:
    """Render html_path to pdf_path via headless Chrome or Edge and verify output."""
    html_abs = html_path.resolve()
    pdf_abs = pdf_path.resolve()

    if not html_abs.is_file():
        raise FileNotFoundError(f"Input HTML report not found: {html_abs}")

    pdf_abs.parent.mkdir(parents=True, exist_ok=True)
    if pdf_abs.exists():
        pdf_abs.unlink()

    browser = find_headless_browser()
    file_uri = html_abs.as_uri()

    cmd = [
        str(browser),
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_abs}",
        file_uri,
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    if result.returncode != 0 or not pdf_abs.is_file():
        stderr_snippet = (result.stderr or "").strip()
        raise RuntimeError(
            f"Headless PDF export failed (exit code {result.returncode}). "
            f"Browser: {browser}. Stderr: {stderr_snippet}"
        )

    size_bytes = pdf_abs.stat().st_size
    if size_bytes <= MIN_PDF_BYTES:
        raise RuntimeError(
            f"Generated PDF is too small ({size_bytes} bytes; expected > {MIN_PDF_BYTES} bytes): {pdf_abs}"
        )

    page_count = count_pdf_pages(pdf_abs)
    if page_count < 1:
        raise RuntimeError(f"Generated PDF reported invalid page count ({page_count}): {pdf_abs}")

    return {
        "browser": str(browser),
        "html_path": str(html_abs),
        "pdf_path": str(pdf_abs),
        "size_bytes": size_bytes,
        "size_kb": round(size_bytes / 1024.0, 2),
        "page_count": page_count,
    }


def main(argv: list[str] | None = None) -> int:
    """CLI entry point for converting docs/report.html to docs/Cargo_Draft_Lab_Report.pdf."""
    docs_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description="Convert Cargo Draft Lab HTML technical report to print-ready A4 PDF."
    )
    parser.add_argument(
        "--html",
        type=Path,
        default=docs_dir / "report.html",
        help="Path to source HTML file (default: docs/report.html).",
    )
    parser.add_argument(
        "--pdf",
        type=Path,
        default=docs_dir / "Cargo_Draft_Lab_Report.pdf",
        help="Path to output PDF file (default: docs/Cargo_Draft_Lab_Report.pdf).",
    )
    args = parser.parse_args(argv)

    try:
        info = export_html_to_pdf(args.html, args.pdf)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print("PDF export completed successfully.")
    print(f"  Browser    : {info['browser']}")
    print(f"  Source HTML: {info['html_path']}")
    print(f"  Output PDF : {info['pdf_path']}")
    print(f"  File Size  : {info['size_bytes']:,} bytes ({info['size_kb']:.2f} KB)")
    print(f"  Page Count : {info['page_count']} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
