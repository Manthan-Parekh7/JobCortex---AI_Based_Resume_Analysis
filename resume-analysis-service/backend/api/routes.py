import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from backend.api.auth import require_internal_service_key
from backend.models.schemas import AnalysisResponse, ComponentScores, JDComparison, SkillValidationDetails
from backend.utils.file_utils import (
    get_default_grammar_results,
    get_default_location_results,
    get_default_skill_validation_results,
)

logger = logging.getLogger('ats_resume_scorer')

router = APIRouter(
    prefix='/api/v1',
    tags=['Analysis'],
    dependencies=[Depends(require_internal_service_key)],
)

def _clean(text: str) -> str:
    for prefix in ('✅', '🌟', '❌', '⚠️', '📝', '🔴', '🟡', '🟢', '🟠', '👍'):
        text = text.lstrip(prefix)
    return text.strip()

@router.post('/analyze-resume', response_model=AnalysisResponse)
async def analyze_resume(
    request: Request,
    resume: UploadFile | None = File(None, description='Resume file — PDF or DOCX, max 5 MB'),
    resume_text: str = Form('', description='Raw resume text (optional). If provided, file upload is ignored.'),
    job_description: str = Form('', description='Job description text (optional)'),
):
    warnings: List[str] = []


    nlp      = request.app.state.nlp
    embedder = request.app.state.embedder


    if resume_text and resume_text.strip():
        resume_text = resume_text.strip()
    else:
        if resume is None:
            content_type = (request.headers.get('content-type') or '').lower()
            if content_type.startswith('application/json'):
                try:
                    payload = await request.json()
                except Exception as exc:
                    raise HTTPException(
                        status_code=400,
                        detail=f'Invalid JSON payload: {exc}',
                    )
                resume_text = (payload.get('resume_text') or '').strip()
                if not job_description:
                    job_description = (payload.get('job_description') or '').strip()

            if not resume_text:
                raise HTTPException(
                    status_code=422,
                    detail='Either resume_text or a resume file must be provided.',
                )

        if not resume_text:
            try:
                file_bytes = await resume.read()
                filename   = resume.filename or 'resume'

                from backend.services.resume_parser import (
                    FileParsingError,
                    FileValidationError,
                    parse_resume_file,
                )

                resume_text, _metadata = parse_resume_file(file_bytes, filename)
                logger.info(f"Parsed '{filename}': {len(resume_text)} chars extracted")

            except Exception as exc:
                logger.error(f'File parsing failed: {exc}')
                raise HTTPException(
                    status_code=422,
                    detail=f'Could not read or parse the resume: {exc}',
                )

    #Full Analysis Pipeline 
    try:
        from backend.services.resume_analyzer import analyze_full_resume
        
        result = analyze_full_resume(
            resume_text=resume_text,
            nlp=nlp,
            embedder=embedder,
            job_description=job_description
        )
    except Exception as exc:
        logger.error(f'Full analysis pipeline failed: {exc}')
        raise HTTPException(status_code=500, detail=f'Analysis pipeline failed: {exc}')

    from backend.models.schemas import ComponentScores

    #Extract jd_comparison details
    jd_comparison_result = None
    if result.get('jd_comparison'):
        jd_comparison_result = JDComparison(
            match_percentage=round(float(result['jd_comparison'].get('match_percentage', 0.0)), 1),
            semantic_similarity=round(float(result['jd_comparison'].get('semantic_similarity', 0.0)), 3),
            matched_keywords=result['jd_comparison'].get('matched_keywords', [])[:20],
            missing_keywords=result['jd_comparison'].get('missing_keywords', [])[:15],
            skills_gap=result['jd_comparison'].get('skills_gap', [])[:10],
        )

    # Convert detailed_feedback objects from prediction into what schema expects
    detailed_fb = result.get('detailed_feedback', [])
    

    svd_raw = result.get('skill_validation_details') or {}
    skill_val_details = SkillValidationDetails(
        validated       = svd_raw.get('validated', []),
        unvalidated     = svd_raw.get('unvalidated', []),
        total           = svd_raw.get('total', 0),
        validated_count = svd_raw.get('validated_count', 0),
        validation_pct  = svd_raw.get('validation_pct', 0.0),
    )

    response = AnalysisResponse(
        ATS_score=result['ats_score'],
        component_scores=ComponentScores(**result['component_scores']),
        issues_summary=result['issues_summary'],
        detailed_feedback=detailed_fb,
        jd_match_analysis=jd_comparison_result,
        skill_validation_details=skill_val_details,
        summary=result.get('summary', ''),
        education=result.get('education', []),
        projects=result.get('projects', []),
        experience_months=int(result.get('experience_months', 0) or 0),

        # Retro-compatibility fields
        ats_score=result['ats_score'],
        keyword_match=jd_comparison_result.match_percentage if jd_comparison_result else 0.0,
        missing_keywords=result.get('missing_keywords', []),
        matched_keywords=result.get('matched_keywords', []),
        skills=list(result.get('skills', [])[:20]),
        jd_comparison=jd_comparison_result,
        interpretation=result.get('interpretation', '')
    )


    return response

@router.get('/health')
async def health_check(request: Request):
    """Health check — confirms models are loaded and the API is ready."""
    return {
        'status':          'healthy',
        'nlp_loaded':      request.app.state.nlp is not None,
        'embedder_loaded': request.app.state.embedder is not None,
    }

@router.get('/history')
async def get_history():
    raise HTTPException(
        status_code=501,
        detail='History endpoints are disabled in the stateless analysis service.',
    )


@router.delete('/history/{analysis_id}')
async def delete_history_entry(
    analysis_id: str,
):
    raise HTTPException(
        status_code=501,
        detail='History endpoints are disabled in the stateless analysis service.',
    )
    

@router.post('/generate-pdf')
async def generate_pdf(
    data: AnalysisResponse,
):
    from backend.services.report_generator import generate_html_reports
    from backend.services.pdf_export import generate_combined_pdf
    from fastapi.responses import Response

    try:
        html_docs = generate_html_reports(data.model_dump())
        pdf_bytes = await generate_combined_pdf(html_docs)

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=ats_report.pdf"
            }
        )
    except Exception as e:
        logger.error(f'Failed to generate PDF: {e}')
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {e}")
    

@router.get('/history/{analysis_id}/pdf')
async def generate_history_pdf(
    analysis_id: str,
):
    raise HTTPException(
        status_code=501,
        detail='History endpoints are disabled in the stateless analysis service.',
    )