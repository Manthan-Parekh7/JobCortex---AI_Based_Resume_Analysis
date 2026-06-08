import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarLoader } from "react-spinners";
import { Download, FileText, RefreshCw, UploadCloud } from "lucide-react";

import { analyzeResume, generateResumePdf, getMe, uploadResume } from "../../api/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import { toast } from "sonner";

const ANALYSIS_STEPS = [
    "Extracting resume text",
    "Validating core sections",
    "Scoring ATS compatibility",
    "Validating skills and evidence",
    "Matching job description",
    "Preparing report outputs",
];

const COMPONENT_CONFIG = [
    {
        key: "formatting",
        label: "Formatting",
        max: 20,
        description: "Structure, section headers, bullet points",
    },
    {
        key: "keywords",
        label: "Keywords and Skills",
        max: 25,
        description: "Keyword density and relevance",
    },
    {
        key: "content",
        label: "Content Quality",
        max: 25,
        description: "Action verbs, metrics, achievements",
    },
    {
        key: "skill_validation",
        label: "Skill Validation",
        max: 15,
        description: "Skills backed by evidence",
    },
    {
        key: "ats_compatibility",
        label: "ATS Compatibility",
        max: 15,
        description: "Parsing friendliness and clarity",
    },
];

const SCORE_COLORS = {
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
};

const ResumeAnalysis = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [analysis, setAnalysis] = useState(null);
    const [cacheMeta, setCacheMeta] = useState(null);
    const [jobDescription, setJobDescription] = useState("");
    const [resumeFile, setResumeFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [activeStep, setActiveStep] = useState(0);
    const [activeTab, setActiveTab] = useState("upload");
    const [errorMessage, setErrorMessage] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);
    const fileInputRef = useRef(null);
    const progressRef = useRef(null);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await getMe();
                setUser(res.user);
            } catch (error) {
                setErrorMessage(error.message || "Failed to load your profile.");
            } finally {
                setLoading(false);
            }
        };
        fetchUser();
    }, []);

    useEffect(() => {
        if (!isAnalyzing) return;
        const timer = setInterval(() => {
            setActiveStep((prev) => (prev + 1) % ANALYSIS_STEPS.length);
        }, 1400);
        return () => clearInterval(timer);
    }, [isAnalyzing]);

    useEffect(() => {
        if (!isAnalyzing || activeTab !== "upload") return;
        const frame = requestAnimationFrame(() => {
            progressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return () => cancelAnimationFrame(frame);
    }, [isAnalyzing, activeTab]);

    const overallScore = useMemo(() => {
        if (!analysis) return 0;
        const rawScore = Number.isFinite(analysis.ats_score) ? analysis.ats_score : analysis.ATS_score || 0;
        const rounded = Math.round(rawScore);
        return Math.min(100, Math.max(0, rounded));
    }, [analysis]);

    const scoreTone = useMemo(() => {
        if (overallScore >= 80) return "good";
        if (overallScore >= 60) return "warn";
        return "bad";
    }, [overallScore]);

    const jdAnalysis = useMemo(() => {
        return analysis?.jd_comparison || analysis?.jd_match_analysis || null;
    }, [analysis]);

    const cacheLabel = useMemo(() => {
        if (!cacheMeta) return null;
        return cacheMeta.hit ? "Cached result" : "Fresh analysis";
    }, [cacheMeta]);

    const cacheTimestamp = useMemo(() => {
        if (!cacheMeta?.updatedAt) return null;
        try {
            return new Date(cacheMeta.updatedAt).toLocaleString();
        } catch {
            return cacheMeta.updatedAt;
        }
    }, [cacheMeta]);

    const handleFileSelect = (file) => {
        if (!file) return;
        setResumeFile(file);
        setErrorMessage("");
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        handleFileSelect(file);
    };

    const handleAnalyze = async (forceRefresh = false) => {
        setErrorMessage("");
        setIsAnalyzing(true);
        setActiveStep(0);
        try {
            if (resumeFile) {
                setIsUploading(true);
                await uploadResume(resumeFile);
                setResumeFile(null);
                const res = await getMe();
                setUser(res.user);
            }

            const result = await analyzeResume({ jobDescription, forceRefresh });
            if (!result?.analysis || !result.analysis.component_scores) {
                throw new Error("Analysis response was incomplete. Please try again.");
            }
            setAnalysis(result.analysis);
            setCacheMeta(result.cache || null);
            toast.success("Resume analysis ready.");
        } catch (error) {
            const message = error.message || "Resume analysis failed.";
            setErrorMessage(message);
            toast.error(message);
        } finally {
            setIsAnalyzing(false);
            setIsUploading(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!analysis) return;
        setIsDownloading(true);
        try {
            const blob = await generateResumePdf(analysis);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "ats_resume_report.pdf";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            const message = error.message || "Failed to generate PDF.";
            toast.error(message);
        } finally {
            setIsDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center h-screen">
                <BarLoader color="#36d7b7" />
                <p className="mt-4 text-muted-foreground">Loading your workspace...</p>
            </div>
        );
    }

    return (
        <div className="pt-20 pb-24 container mx-auto px-4 md:px-8 lg:px-16">
            <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Resume Analysis Studio</h1>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                    Analyze your resume across ATS performance, strengths, issues, and job matching in one streamlined flow.
                </p>
            </div>

            {cacheLabel && (
                <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                    <Badge variant={cacheMeta?.hit ? "secondary" : "outline"} className="px-3 py-1">
                        {cacheLabel}
                    </Badge>
                    {cacheTimestamp && (
                        <span className="text-sm text-muted-foreground">Last updated: {cacheTimestamp}</span>
                    )}
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList variant="line" className="mx-auto flex flex-wrap gap-2 px-2">
                    <TabsTrigger value="upload">Upload</TabsTrigger>
                    <TabsTrigger value="score">ATS Analytics</TabsTrigger>
                    <TabsTrigger value="deep-dive">Strengths and Issues</TabsTrigger>
                    <TabsTrigger value="jd-match">JD Comparison</TabsTrigger>
                    <TabsTrigger value="export">Export</TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="mt-8 space-y-8 pb-16">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                            <CardHeader>
                                <CardTitle className="text-2xl">Resume Upload</CardTitle>
                                <CardDescription>Drop a resume or use your saved profile resume.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div
                                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${isDragging ? "border-primary bg-primary/5" : "border-border bg-background/50"
                                        }`}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setIsDragging(true);
                                    }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                >
                                    <UploadCloud className="mx-auto mb-4 text-primary" size={36} />
                                    <p className="text-sm text-muted-foreground mb-3">
                                        Drag and drop your resume here, or select a file to upload.
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        Browse Files
                                    </Button>
                                    <Input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf,.doc,.docx"
                                        className="hidden"
                                        onChange={(event) => handleFileSelect(event.target.files?.[0])}
                                    />
                                </div>

                                <div className="mt-6 space-y-3">
                                    {resumeFile && (
                                        <div className="flex items-center gap-3 text-sm text-foreground">
                                            <FileText className="text-primary" size={18} />
                                            <span>{resumeFile.name}</span>
                                        </div>
                                    )}
                                    {!resumeFile && user?.resume && (
                                        <div className="text-sm text-muted-foreground">
                                            Using your saved resume on file.
                                        </div>
                                    )}
                                    {!resumeFile && !user?.resume && (
                                        <div className="text-sm text-muted-foreground">
                                            Upload a resume to enable analysis.
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                            <CardHeader>
                                <CardTitle className="text-2xl">Job Description</CardTitle>
                                <CardDescription>Optional but recommended for match scoring.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Textarea
                                    rows={8}
                                    placeholder="Paste the job description here to compare against your resume."
                                    value={jobDescription}
                                    onChange={(event) => setJobDescription(event.target.value)}
                                    className="rounded-xl bg-background/50"
                                />
                                <div className="mt-4 text-sm text-muted-foreground">
                                    Provide a JD to unlock keyword matching and skills gap analysis.
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {errorMessage && (
                        <Card className="border-rose-200 bg-rose-50/60 rounded-2xl shadow-sm">
                            <CardContent className="py-4 text-rose-700 text-sm">{errorMessage}</CardContent>
                        </Card>
                    )}

                    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center bg-card/40 border border-border/60 rounded-2xl p-4">
                        <Button
                            size="lg"
                            className="rounded-xl px-8"
                            disabled={isAnalyzing || isUploading || (!user?.resume && !resumeFile)}
                            onClick={() => handleAnalyze(false)}
                        >
                            {isAnalyzing ? "Analyzing" : "Analyze Resume"}
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            className="rounded-xl px-8"
                            disabled={isAnalyzing || !analysis}
                            onClick={() => handleAnalyze(true)}
                        >
                            <RefreshCw size={16} />
                            Force Recalculate
                        </Button>
                        {isUploading && <span className="text-sm text-muted-foreground">Uploading resume...</span>}
                    </div>

                    {isAnalyzing && (
                        <Card ref={progressRef} className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                            <CardHeader>
                                <CardTitle className="text-lg">Analysis Progress</CardTitle>
                                <CardDescription>Processing your resume. This can take up to 30 seconds.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Progress value={((activeStep + 1) / ANALYSIS_STEPS.length) * 100} />
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    {ANALYSIS_STEPS.map((step, index) => (
                                        <li
                                            key={step}
                                            className={`flex items-center gap-3 ${index === activeStep ? "text-foreground" : "text-muted-foreground"}`}
                                        >
                                            <span
                                                className={`h-2 w-2 rounded-full ${index <= activeStep ? "bg-primary" : "bg-muted"
                                                    }`}
                                            />
                                            {step}
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="score" className="mt-8 space-y-8 pb-16">
                    {!analysis ? (
                        <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                            <CardContent className="py-10 text-center text-muted-foreground">
                                Run an analysis to unlock ATS analytics.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-8">
                            <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                                <CardHeader>
                                    <CardTitle className="text-2xl">Overall ATS Score</CardTitle>
                                    <CardDescription>{analysis.interpretation || "Score interpretation will appear here."}</CardDescription>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                                    <div className="flex items-center justify-center">
                                        <div className="relative w-48 h-48">
                                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                                <path
                                                    className="text-muted/20"
                                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="3"
                                                />
                                                <path
                                                    className="text-primary"
                                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="3"
                                                    strokeDasharray={`${overallScore}, 100`}
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="text-center">
                                                    <span className={`text-4xl font-bold ${SCORE_COLORS[scoreTone]}`}>{overallScore}</span>
                                                    <p className="text-sm text-muted-foreground mt-2">ATS Score</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="text-sm text-muted-foreground">Key takeaways</div>
                                        <ul className="space-y-3 text-sm text-foreground">
                                            {(analysis.issues_summary || []).slice(0, 4).map((item) => (
                                                <li key={item} className="flex items-start gap-3">
                                                    <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                            {analysis.issues_summary?.length === 0 && (
                                                <li className="text-muted-foreground">No issues summary available yet.</li>
                                            )}
                                        </ul>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                                <CardHeader>
                                    <CardTitle className="text-2xl">Score Breakdown</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {COMPONENT_CONFIG.map((component) => {
                                        const value = Number(analysis.component_scores?.[component.key] || 0);
                                        const pct = Math.min(100, Math.round((value / component.max) * 100));
                                        const barClass = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";

                                        return (
                                            <div key={component.key} className="flex items-center gap-4">
                                                <div className="w-40">
                                                    <div className="text-sm font-semibold text-foreground">{component.label}</div>
                                                    <div className="text-xs text-muted-foreground">{component.description}</div>
                                                </div>
                                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                    <div className={`h-full ${barClass}`} style={{ width: `${pct}%` }} />
                                                </div>
                                                <div className="text-sm font-semibold text-foreground w-16 text-right">
                                                    {value}/{component.max}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="deep-dive" className="mt-8 space-y-8 pb-16">
                    {!analysis ? (
                        <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                            <CardContent className="py-10 text-center text-muted-foreground">
                                Run an analysis to unlock strengths and issues.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-8">
                            <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                                <CardHeader>
                                    <CardTitle className="text-2xl">Strengths</CardTitle>
                                    <CardDescription>Highlights from your resume that stand out.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(analysis.strengths || []).length > 0 ? (
                                        (analysis.strengths || []).map((strength) => (
                                            <div
                                                key={strength}
                                                className="border border-emerald-200 bg-emerald-50/60 rounded-xl px-4 py-3 text-sm text-emerald-700"
                                            >
                                                {strength}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm text-muted-foreground">No strengths listed yet.</div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                                <CardHeader>
                                    <CardTitle className="text-2xl">Issues and Fixes</CardTitle>
                                    <CardDescription>Actionable recommendations with impact context.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {(analysis.detailed_feedback || []).length === 0 && (
                                        <div className="text-sm text-muted-foreground">No issues detected yet.</div>
                                    )}
                                    {(analysis.detailed_feedback || []).map((issue) => {
                                        const severity = (issue.severity_level || "low").toLowerCase();
                                        const severityBadge =
                                            severity === "high"
                                                ? "bg-rose-100 text-rose-700 border-rose-200"
                                                : severity === "moderate" || severity === "medium"
                                                    ? "bg-amber-100 text-amber-700 border-amber-200"
                                                    : "bg-indigo-100 text-indigo-700 border-indigo-200";

                                        return (
                                            <div key={issue.issue_title} className="border border-border/80 rounded-xl p-4 bg-background/50">
                                                <div className="flex flex-wrap items-center gap-3 mb-3">
                                                    <Badge className={severityBadge}>{issue.severity_level || "Low"}</Badge>
                                                    <div className="text-sm font-semibold text-foreground">{issue.issue_title}</div>
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-3">{issue.explanation}</p>
                                                <div className="text-xs text-muted-foreground mb-3">ATS Impact: {issue.ats_impact}</div>
                                                <details className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
                                                    <summary className="cursor-pointer text-sm font-semibold text-foreground">How to fix</summary>
                                                    <div className="mt-3 text-sm text-muted-foreground">{issue.how_to_fix}</div>
                                                    {issue.action_items?.length > 0 && (
                                                        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                                                            {issue.action_items.map((item) => (
                                                                <li key={item} className="flex items-start gap-2">
                                                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                                                                    <span>{item}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </details>
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="jd-match" className="mt-8 space-y-8 pb-16">
                    {!analysis ? (
                        <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                            <CardContent className="py-10 text-center text-muted-foreground">
                                Run an analysis to unlock job matching insights.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                                <CardHeader>
                                    <CardTitle className="text-2xl">Job Match</CardTitle>
                                    <CardDescription>Keyword overlap and semantic alignment.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {jdAnalysis ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="border border-border rounded-xl p-4 text-center bg-background/50">
                                                    <div className="text-3xl font-bold text-foreground">
                                                        {Math.round(jdAnalysis.match_percentage || 0)}%
                                                    </div>
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Keyword Match</div>
                                                </div>
                                                <div className="border border-border rounded-xl p-4 text-center bg-background/50">
                                                    <div className="text-3xl font-bold text-foreground">
                                                        {Math.round((jdAnalysis.semantic_similarity || 0) * 100)}%
                                                    </div>
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Semantic Similarity</div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-foreground mb-2">Matched Keywords</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {jdAnalysis.matched_keywords?.slice(0, 18).map((kw) => (
                                                        <Badge key={kw} className="bg-emerald-100 text-emerald-700 border-emerald-200">
                                                            {kw}
                                                        </Badge>
                                                    ))}
                                                    {jdAnalysis.matched_keywords?.length === 0 && (
                                                        <span className="text-sm text-muted-foreground">No matched keywords yet.</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-foreground mb-2">Missing Keywords</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {jdAnalysis.missing_keywords?.slice(0, 18).map((kw) => (
                                                        <Badge key={kw} className="bg-rose-100 text-rose-700 border-rose-200">
                                                            {kw}
                                                        </Badge>
                                                    ))}
                                                    {jdAnalysis.missing_keywords?.length === 0 && (
                                                        <span className="text-sm text-muted-foreground">No missing keywords.</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-foreground mb-2">Skills Gap</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {jdAnalysis.skills_gap?.slice(0, 14).map((skill) => (
                                                        <Badge key={skill} className="bg-amber-100 text-amber-700 border-amber-200">
                                                            {skill}
                                                        </Badge>
                                                    ))}
                                                    {jdAnalysis.skills_gap?.length === 0 && (
                                                        <span className="text-sm text-muted-foreground">No significant gaps identified.</span>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-sm text-muted-foreground">Add a job description to see match insights.</div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                                <CardHeader>
                                    <CardTitle className="text-2xl">Skill Validation</CardTitle>
                                    <CardDescription>Evidence-backed skills and gaps.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {analysis.skill_validation_details ? (
                                        <>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="border border-border rounded-xl p-4 text-center bg-background/50">
                                                    <div className="text-2xl font-bold text-foreground">
                                                        {analysis.skill_validation_details.total || 0}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Total</div>
                                                </div>
                                                <div className="border border-emerald-200 rounded-xl p-4 text-center bg-emerald-50/60">
                                                    <div className="text-2xl font-bold text-emerald-700">
                                                        {analysis.skill_validation_details.validated_count || 0}
                                                    </div>
                                                    <div className="text-xs text-emerald-700 uppercase tracking-wide">Validated</div>
                                                </div>
                                                <div className="border border-rose-200 rounded-xl p-4 text-center bg-rose-50/60">
                                                    <div className="text-2xl font-bold text-rose-700">
                                                        {(analysis.skill_validation_details.unvalidated || []).length}
                                                    </div>
                                                    <div className="text-xs text-rose-700 uppercase tracking-wide">Need Evidence</div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-foreground mb-2">Validated Skills</div>
                                                <div className="space-y-2">
                                                    {(analysis.skill_validation_details.validated || []).slice(0, 8).map((item) => (
                                                        <div key={item.skill} className="border border-emerald-200 bg-emerald-50/60 rounded-lg px-3 py-2">
                                                            <div className="text-sm font-semibold text-emerald-700">{item.skill}</div>
                                                            <div className="text-xs text-emerald-700 mt-1">
                                                                {(item.projects || []).slice(0, 2).join(", ")}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-foreground mb-2">Missing Critical Skills</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {(analysis.skill_validation_details.unvalidated || []).slice(0, 16).map((skill) => (
                                                        <Badge key={skill} className="bg-rose-100 text-rose-700 border-rose-200">
                                                            {skill}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-sm text-muted-foreground">Skill validation is unavailable in this analysis.</div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="export" className="mt-8 space-y-8 pb-16">
                    <Card className="border-border bg-card/50 backdrop-blur-sm rounded-2xl shadow-lg">
                        <CardHeader>
                            <CardTitle className="text-2xl">Export Report</CardTitle>
                            <CardDescription>Generate a PDF report matching the analysis template.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="text-sm text-muted-foreground">
                                {analysis
                                    ? "Your report is ready to export."
                                    : "Run an analysis first to enable PDF export."}
                            </div>
                            <Button
                                size="lg"
                                className="rounded-xl px-8"
                                disabled={!analysis || isDownloading}
                                onClick={handleDownloadPdf}
                            >
                                <Download size={16} />
                                {isDownloading ? "Preparing PDF" : "Download PDF"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default ResumeAnalysis;
