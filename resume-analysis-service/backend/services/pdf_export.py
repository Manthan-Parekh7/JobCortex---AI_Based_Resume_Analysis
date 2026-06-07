import asyncio
import io
import os
import logging
import shutil
import sys
from pathlib import Path

from PyPDF2 import PdfMerger

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_INSTALLED = True
except ImportError:
    PLAYWRIGHT_INSTALLED = False

logger = logging.getLogger('ats_resume_scorer')


def _find_browser_executable() -> str | None:
    env_candidates = [
        os.getenv('PLAYWRIGHT_BROWSER_PATH'),
        os.getenv('CHROME_PATH'),
        os.getenv('EDGE_PATH'),
    ]

    for candidate in env_candidates:
        if candidate and Path(candidate).exists():
            return candidate

    command_candidates = [
        'msedge',
        'chrome',
        'google-chrome',
        'chromium',
        'chromium-browser',
    ]

    for command in command_candidates:
        resolved = shutil.which(command)
        if resolved:
            return resolved

    if sys.platform == 'win32':
        windows_candidates = [
            Path(r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'),
            Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),
            Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
            Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'),
        ]

        for candidate in windows_candidates:
            if candidate.exists():
                return str(candidate)

    return None


async def _render_html_to_pdf_bytes(page, html: str) -> bytes:
    await page.set_content(html, wait_until="networkidle")
    return await page.pdf(
        format="A4",
        print_background=True,
        margin={"top": "20px", "right": "20px", "bottom": "20px", "left": "20px"},
    )


async def _generate_with_playwright(html_docs: dict[str, str]) -> bytes:
    merger = PdfMerger()

    async with async_playwright() as playwright:
        browser_executable = _find_browser_executable()
        if browser_executable:
            browser = await playwright.chromium.launch(
                executable_path=browser_executable,
                headless=True,
            )
        else:
            browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page()

        for _name, html_str in html_docs.items():
            pdf_bytes = await _render_html_to_pdf_bytes(page, html_str)
            merger.append(io.BytesIO(pdf_bytes))

        await browser.close()

    output = io.BytesIO()
    merger.write(output)
    merger.close()
    return output.getvalue()


def _run_playwright_in_proactor_loop(html_docs: dict[str, str]) -> bytes:
    policy_cls = getattr(asyncio, 'WindowsProactorEventLoopPolicy', None)
    previous_policy = asyncio.get_event_loop_policy()
    try:
        if policy_cls is not None:
            asyncio.set_event_loop_policy(policy_cls())
        return asyncio.run(_generate_with_playwright(html_docs))
    finally:
        asyncio.set_event_loop_policy(previous_policy)


async def generate_combined_pdf(html_docs: dict[str, str]) -> bytes:
    if not PLAYWRIGHT_INSTALLED:
        raise ImportError(
            "Playwright is not installed. Run `pip install playwright` and `python -m playwright install`."
        )

    if sys.platform == 'win32':
        loop = asyncio.get_running_loop()
        if not isinstance(loop, asyncio.ProactorEventLoop):
            try:
                return await asyncio.to_thread(_run_playwright_in_proactor_loop, html_docs)
            except Exception as fallback_exc:
                logger.exception('PDF generation failed')
                error_message = str(fallback_exc).strip() or fallback_exc.__class__.__name__
                raise RuntimeError(
                    f"PDF generation failed: {error_message}. Ensure a browser is installed or set PLAYWRIGHT_BROWSER_PATH."
                ) from fallback_exc

    try:
        return await _generate_with_playwright(html_docs)
    except Exception as exc:
        if isinstance(exc, NotImplementedError) and sys.platform == 'win32':
            try:
                return await asyncio.to_thread(_run_playwright_in_proactor_loop, html_docs)
            except Exception as fallback_exc:
                logger.exception('PDF generation failed')
                error_message = str(fallback_exc).strip() or fallback_exc.__class__.__name__
                raise RuntimeError(
                    f"PDF generation failed: {error_message}. Ensure a browser is installed or set PLAYWRIGHT_BROWSER_PATH."
                ) from fallback_exc

        logger.exception('PDF generation failed')
        error_message = str(exc).strip() or exc.__class__.__name__
        raise RuntimeError(
            f"PDF generation failed: {error_message}. Ensure a browser is installed or set PLAYWRIGHT_BROWSER_PATH."
        ) from exc
