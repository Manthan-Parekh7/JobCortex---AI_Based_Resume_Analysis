import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    User,
    Mail,
    Phone,
    MapPin,
    Calendar,
    ExternalLink,
    Download,
    Filter,
    Search,
    CheckCircle,
    XCircle,
    Clock,
    Users,
    Briefcase,
    GraduationCap,
    Star,
    BrainCircuit,
    Sparkles,
    BarChart2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Separator } from '../../components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { MarkdownViewer } from '../../components/ui/markdown-editor';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Progress } from '../../components/ui/progress';
import ApplicationStatusDialog from '../../components/ApplicationStatusDialog';
import { toast } from 'sonner';
import { BarLoader } from 'react-spinners';
import { getApplicationsForJob, updateApplicationStatus, getAIShortlistedApplications } from '../../api/recruiterApi';
import useFetch from '../../hooks/useFetch';

// Utility: strip common Markdown syntax to produce a plain-text preview
function stripMarkdown(md = '') {
    try {
        let text = String(md);
        // Remove code fences markers but keep inner content
        text = text.replace(/```/g, '');
        // Inline code backticks
        text = text.replace(/`([^`]*)`/g, '$1');
        // Images: ![alt](url) -> alt
        text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
        // Links: [text](url) -> text
        text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
        // Headings ### Title -> Title
        text = text.replace(/^#+\s*/gm, '');
        // Blockquotes > quote -> quote
        text = text.replace(/^>\s*/gm, '');
        // Lists markers -> text
        text = text.replace(/^\s*(?:[*+-]|\d+\.)\s+/gm, '');
        // Emphasis markers
        text = text.replace(/\*\*|__|\*|_|~~/g, '');
        // Horizontal rules
        text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '');
        // Remove html tags
        text = text.replace(/<[^>]+>/g, '');
        // Collapse whitespace
        text = text.replace(/\s+/g, ' ');
        return text.trim();
    } catch {
        return String(md || '').trim();
    }
}

// Utility: get a first N words preview with a manual ellipsis if truncated
function wordsPreview(text = '', maxWords = 7) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return words.slice(0, maxWords).join(' ') + '…';
}

const RecruiterApplications = () => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const { execute: fetchApplications, loading, data: applicationsData } = useFetch(getApplicationsForJob);
    const [applications, setApplications] = useState([]);
    const [job, setJob] = useState(null);

    // AI Shortlist state
    const [activeTab, setActiveTab] = useState('all');
    const [aiApplications, setAiApplications] = useState([]);
    const [aiMeta, setAiMeta] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiFetched, setAiFetched] = useState(false);

    // State for the application status dialog
    const [statusDialog, setStatusDialog] = useState({
        isOpen: false,
        applicationId: null,
        status: null,
        candidateName: '',
        loading: false
    });

    useEffect(() => {
        if (jobId) {
            fetchApplications(jobId);
        }
    }, [jobId, fetchApplications]);

    useEffect(() => {
        if (applicationsData) {
            setApplications(applicationsData.applications || []);
            setJob(applicationsData.job || null);
        }
    }, [applicationsData]);

    // Fetch AI applications only when tab is clicked
    useEffect(() => {
        const fetchAI = async () => {
            if (activeTab === 'ai' && !aiFetched && jobId) {
                setAiLoading(true);
                try {
                    const response = await getAIShortlistedApplications(jobId);
                    if (response.success) {
                        setAiApplications(response.applications);
                        setAiMeta(response.meta);
                        setAiFetched(true);
                    }
                } catch (error) {
                    toast.error('Failed to load AI Shortlist');
                } finally {
                    setAiLoading(false);
                }
            }
        };
        fetchAI();
    }, [activeTab, aiFetched, jobId]);

    const handleStatusUpdate = (applicationId, newStatus, candidateName) => {
        if (newStatus === 'pending') {
            // For pending status, update directly without dialog
            updateStatusDirectly(applicationId, newStatus);
        } else {
            // For accept/reject, show dialog for additional details
            setStatusDialog({
                isOpen: true,
                applicationId,
                status: newStatus,
                candidateName,
                loading: false
            });
        }
    };

    const updateStatusDirectly = async (applicationId, newStatus) => {
        try {
            await updateApplicationStatus(applicationId, newStatus);
            setApplications(apps =>
                apps.map(app =>
                    app._id === applicationId
                        ? { ...app, status: newStatus }
                        : app
                )
            );
            toast.success(`Application ${newStatus} successfully`);
        } catch {
            toast.error('Failed to update application status');
        }
    };

    const handleStatusDialogConfirm = async (details) => {
        const { applicationId, status } = statusDialog;

        setStatusDialog(prev => ({ ...prev, loading: true }));

        try {
            await updateApplicationStatus(applicationId, status, details);
            setApplications(apps =>
                apps.map(app =>
                    app._id === applicationId
                        ? { ...app, status }
                        : app
                )
            );

            toast.success(`Application ${status} successfully. Candidate will be notified via email in 30 seconds.`);
            setStatusDialog({ isOpen: false, applicationId: null, status: null, candidateName: '', loading: false });
        } catch {
            toast.error('Failed to update application status');
            setStatusDialog(prev => ({ ...prev, loading: false }));
        }
    };

    const handleStatusDialogClose = () => {
        if (!statusDialog.loading) {
            setStatusDialog({ isOpen: false, applicationId: null, status: null, candidateName: '', loading: false });
        }
    };

    const filteredApplications = applications.filter(app => {
        const matchesSearch = app.candidate?.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            app.candidate?.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'accepted': return 'bg-green-100 text-green-800 border-green-200';
            case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'pending': return <Clock className="h-4 w-4" />;
            case 'accepted': return <CheckCircle className="h-4 w-4" />;
            case 'rejected': return <XCircle className="h-4 w-4" />;
            default: return <Clock className="h-4 w-4" />;
        }
    };

    const CandidateProfileDialog = ({ candidate, application }) => (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <User className="h-4 w-4 mr-2" />
                    View Profile
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Candidate Profile</DialogTitle>
                    <DialogDescription>
                        Review {candidate?.username}'s profile and application details
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[600px]">
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-start space-x-4">
                            <Avatar className="h-20 w-20">
                                <AvatarImage src={candidate?.image} />
                                <AvatarFallback className="text-lg">
                                    {candidate?.username?.charAt(0)?.toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                                <h3 className="text-2xl font-bold">{candidate?.username}</h3>
                                <p className="text-muted-foreground">{candidate?.email}</p>
                                {candidate?.phone && (
                                    <p className="text-muted-foreground flex items-center mt-1">
                                        <Phone className="h-4 w-4 mr-2" />
                                        {candidate?.phone}
                                    </p>
                                )}
                                {candidate?.location && (
                                    <p className="text-muted-foreground flex items-center mt-1">
                                        <MapPin className="h-4 w-4 mr-2" />
                                        {candidate?.location}
                                    </p>
                                )}
                            </div>
                            <div className="text-right">
                                <Badge className={getStatusColor(application?.status)}>
                                    {getStatusIcon(application?.status)}
                                    <span className="ml-2 capitalize">{application?.status}</span>
                                </Badge>
                                <p className="text-sm text-muted-foreground mt-2">
                                    Applied on {new Date(application?.appliedAt).toLocaleDateString()}
                                </p>
                            </div>
                        </div>

                        <Separator />

                        {/* Skills */}
                        {candidate?.skills && candidate.skills.length > 0 && (
                            <div>
                                <h4 className="font-semibold mb-3 flex items-center">
                                    <Star className="h-4 w-4 mr-2" />
                                    Skills
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {candidate.skills.map((skill, index) => (
                                        <Badge key={index} variant="secondary">
                                            {skill}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Experience */}
                        {candidate?.experience && (
                            <div>
                                <h4 className="font-semibold mb-3 flex items-center">
                                    <Briefcase className="h-4 w-4 mr-2" />
                                    Experience
                                </h4>
                                <p className="text-muted-foreground">{candidate.experience} years</p>
                            </div>
                        )}

                        {/* Education */}
                        {candidate?.education && (
                            <div>
                                <h4 className="font-semibold mb-3 flex items-center">
                                    <GraduationCap className="h-4 w-4 mr-2" />
                                    Education
                                </h4>
                                <p className="text-muted-foreground">{candidate.education}</p>
                            </div>
                        )}

                        {/* Resume */}
                        {application?.resume && (
                            <div>
                                <h4 className="font-semibold mb-3">Resume</h4>
                                <Button variant="outline" asChild>
                                    <a
                                        href={application.resume}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center"
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Download Resume
                                        <ExternalLink className="h-4 w-4 ml-2" />
                                    </a>
                                </Button>
                            </div>
                        )}

                        {/* Cover Letter */}
                        {application?.coverLetter && (
                            <div>
                                <h4 className="font-semibold mb-3">Cover Letter</h4>
                                <MarkdownViewer value={application.coverLetter} className="bg-muted rounded-lg" />
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-4">
                            <Button
                                onClick={() => handleStatusUpdate(application._id, 'accepted', application.candidate?.username)}
                                className="bg-green-600 hover:bg-green-700"
                                disabled={application.status === 'accepted'}
                            >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Accept
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => handleStatusUpdate(application._id, 'rejected', application.candidate?.username)}
                                disabled={application.status === 'rejected'}
                            >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                            </Button>
                            {application.status !== 'pending' && (
                                <Button
                                    variant="outline"
                                    onClick={() => handleStatusUpdate(application._id, 'pending', application.candidate?.username)}
                                >
                                    <Clock className="h-4 w-4 mr-2" />
                                    Reset to Pending
                                </Button>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );

    const ApplicationCard = ({ application }) => {
        const candidate = application.candidate;
        const [isExpanded, setIsExpanded] = useState(false);
        const previewText = useMemo(() => stripMarkdown(application?.coverLetter || ''), [application?.coverLetter]);
        const collapsedText = useMemo(() => wordsPreview(previewText, 7), [previewText]);
        const hasMore = useMemo(() => (previewText.split(/\s+/).filter(Boolean).length > 7), [previewText]);

        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center space-x-4">
                                <Avatar className="h-12 w-12">
                                    <AvatarImage src={candidate?.image} />
                                    <AvatarFallback>
                                        {candidate?.username?.charAt(0)?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="font-semibold text-lg">{candidate?.username}</h3>
                                    <p className="text-muted-foreground">{candidate?.email}</p>
                                    {candidate?.location && (
                                        <p className="text-sm text-muted-foreground flex items-center mt-1">
                                            <MapPin className="h-3 w-3 mr-1" />
                                            {candidate.location}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Badge className={getStatusColor(application.status)}>
                                {getStatusIcon(application.status)}
                                <span className="ml-2 capitalize">{application.status}</span>
                            </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Experience</p>
                                <p className="text-sm">{candidate?.experience || 'Not specified'} years</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Applied On</p>
                                <p className="text-sm">{new Date(application.appliedAt).toLocaleDateString()}</p>
                            </div>
                        </div>

                        {candidate?.skills && candidate.skills.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm font-medium text-muted-foreground mb-2">Skills</p>
                                <div className="flex flex-wrap gap-1">
                                    {candidate.skills.slice(0, 3).map((skill, index) => (
                                        <Badge key={index} variant="outline" className="text-xs">
                                            {skill}
                                        </Badge>
                                    ))}
                                    {candidate.skills.length > 3 && (
                                        <Badge variant="outline" className="text-xs">
                                            +{candidate.skills.length - 3} more
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Cover Letter Preview with inline expand/collapse (single-line -> full) */}
                        {application?.coverLetter && (
                            <div className="mb-4">
                                <p className="text-sm font-medium text-muted-foreground mb-2">Cover Letter</p>
                                {isExpanded ? (
                                    <div className="rounded-md bg-muted/30 p-3 prose prose-sm max-w-none text-muted-foreground">
                                        <MarkdownViewer value={application.coverLetter} compact />
                                    </div>
                                ) : (
                                    <div className="rounded-md bg-muted/30 p-3">
                                        <p className="text-sm text-muted-foreground whitespace-nowrap">{collapsedText}</p>
                                    </div>
                                )}
                                {hasMore && (
                                    <div className="mt-2">
                                        <Button
                                            variant="link"
                                            size="sm"
                                            className="px-0"
                                            type="button"
                                            onClick={() => setIsExpanded((v) => !v)}
                                        >
                                            {isExpanded ? 'Show less' : 'Show more'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <CandidateProfileDialog candidate={candidate} application={application} />
                            {application.resume && (
                                <Button variant="outline" size="sm" asChild>
                                    <a href={application.resume} target="_blank" rel="noopener noreferrer">
                                        <Download className="h-4 w-4 mr-2" />
                                        Resume
                                    </a>
                                </Button>
                            )}
                            <div className="ml-auto flex gap-1">
                                <Button
                                    size="sm"
                                    onClick={() => handleStatusUpdate(application._id, 'accepted', application.candidate?.username)}
                                    className="bg-green-600 hover:bg-green-700"
                                    disabled={application.status === 'accepted'}
                                >
                                    <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleStatusUpdate(application._id, 'rejected', application.candidate?.username)}
                                    disabled={application.status === 'rejected'}
                                >
                                    <XCircle className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        );
    };

    const AICandidateCard = ({ application }) => {
        const candidate = application.candidate;
        
        return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <Card className="hover:shadow-md transition-shadow relative overflow-hidden border-t-4 border-t-primary">
                    <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center space-x-4">
                                <div className="flex flex-col items-center justify-center bg-primary/10 text-primary rounded-full w-12 h-12 font-bold text-xl border-2 border-primary/20">
                                    #{application.rank}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{candidate?.username}</h3>
                                    <p className="text-muted-foreground text-sm">{candidate?.email}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-bold text-primary">{application.overall_score ?? '--'}%</div>
                                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Overall Match</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-4 bg-muted/30 p-4 rounded-lg">
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-muted-foreground flex items-center font-medium"><BrainCircuit className="h-4 w-4 mr-1.5 text-blue-500"/> Resume Fit</span>
                                    <span className="font-bold">{application.fit_score ?? '--'}%</span>
                                </div>
                                <Progress value={application.fit_score || 0} className="h-2" />
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-muted-foreground flex items-center font-medium"><BarChart2 className="h-4 w-4 mr-1.5 text-green-500"/> Skills Match</span>
                                    <span className="font-bold">{application.skills_match_score ?? '--'}%</span>
                                </div>
                                <Progress value={application.skills_match_score || 0} className="h-2" />
                            </div>
                        </div>

                        {application.fit_explanation && (
                            <div className="mb-5">
                                <p className="text-sm font-semibold text-muted-foreground mb-2 flex items-center">
                                    <Sparkles className="h-4 w-4 mr-1.5 text-amber-500" /> AI Insights
                                </p>
                                <p className="text-sm text-foreground/90 leading-relaxed bg-amber-50/50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/30">
                                    {application.fit_explanation}
                                </p>
                            </div>
                        )}

                        <div className="flex gap-2 items-center justify-between pt-2 border-t border-border/50">
                            <CandidateProfileDialog candidate={candidate} application={application} />
                            
                            <div className="flex gap-2">
                                <Button size="sm" onClick={() => handleStatusUpdate(application._id, 'accepted', candidate?.username)} className="bg-green-600 hover:bg-green-700 text-white shadow-sm" disabled={application.status === 'accepted'}>
                                    <CheckCircle className="h-4 w-4 mr-1.5" /> Accept
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => handleStatusUpdate(application._id, 'rejected', candidate?.username)} className="shadow-sm" disabled={application.status === 'rejected'}>
                                    <XCircle className="h-4 w-4 mr-1.5" /> Reject
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <BarLoader color="#36d7b7" />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between"
            >
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" onClick={() => navigate('/recruiter')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Dashboard
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">Applications</h1>
                        <p className="text-muted-foreground">
                            {job?.title ? `Applications for ${job.title}` : 'Job Applications'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="px-3 py-1">
                        <Users className="h-4 w-4 mr-2" />
                        {applications.length} Applications
                    </Badge>
                </div>
            </motion.div>

            {/* Job Info */}
            {job && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-semibold">{job.title}</h2>
                                    <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-2">
                                        <span className="flex items-center">
                                            <MapPin className="h-4 w-4 mr-1" />
                                            {job.location}
                                        </span>
                                        <span className="flex items-center">
                                            <Briefcase className="h-4 w-4 mr-1" />
                                            {job.jobType}
                                        </span>
                                        <span className="flex items-center">
                                            <Calendar className="h-4 w-4 mr-1" />
                                            Posted {new Date(job.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                                    {job.status}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full sm:w-auto grid grid-cols-2 mb-6 h-auto p-1 bg-muted/50">
                    <TabsTrigger value="all" className="py-2.5 data-[state=active]:shadow-sm">
                        <Users className="h-4 w-4 mr-2" /> All Applications
                    </TabsTrigger>
                    <TabsTrigger value="ai" className="py-2.5 data-[state=active]:shadow-sm data-[state=active]:text-primary">
                        <Sparkles className="h-4 w-4 mr-2" /> AI Smart Shortlist
                    </TabsTrigger>
                </TabsList>

                {/* Tab: Standard Applications View */}
                <TabsContent value="all" className="space-y-6 mt-0">
                    {/* Filters */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-col sm:flex-row gap-4"
                    >
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search candidates by name or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 shadow-sm"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full sm:w-[180px] shadow-sm">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="accepted">Accepted</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                    </motion.div>

                    {/* Applications List */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="space-y-4"
                    >
                        {filteredApplications.length > 0 ? (
                            filteredApplications.map((application) => (
                                <ApplicationCard key={application._id} application={application} />
                            ))
                        ) : (
                            <Card className="border-dashed border-2">
                                <CardContent className="p-12 text-center">
                                    <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No applications found</h3>
                                    <p className="text-muted-foreground">
                                        {applications.length === 0
                                            ? "No one has applied to this job yet."
                                            : "No applications match your current filters."
                                        }
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </motion.div>
                </TabsContent>

                {/* Tab: AI Shortlist View */}
                <TabsContent value="ai" className="space-y-6 mt-0">
                    <Card className="bg-primary/5 border-primary/20 shadow-sm">
                        <CardContent className="p-6 flex items-start gap-4">
                            <div className="bg-primary/10 p-3 rounded-full shrink-0">
                                <BrainCircuit className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg text-primary mb-1">AI Smart Filtering</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Candidates are automatically ranked based on a <strong className="text-foreground">70% Resume Fit</strong> (AI analysis of resume vs job description) and <strong className="text-foreground">30% Skills Match</strong> (keyword overlap). This helps you surface the best talent instantly.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {aiLoading ? (
                        <div className="py-20 flex flex-col items-center justify-center space-y-4">
                            <BarLoader color="#36d7b7" width={150} />
                            <p className="text-sm text-muted-foreground animate-pulse">AI is scoring candidates...</p>
                        </div>
                    ) : aiApplications.length > 0 ? (
                        <div className="space-y-4">
                            {aiApplications.map((application) => (
                                <AICandidateCard key={application._id} application={application} />
                            ))}
                        </div>
                    ) : (
                        <Card className="border-dashed border-2">
                            <CardContent className="p-12 text-center">
                                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No scored candidates</h3>
                                <p className="text-muted-foreground">
                                    We couldn't generate a shortlist. Make sure candidates have uploaded resumes.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* Application Status Dialog */}
            <ApplicationStatusDialog
                isOpen={statusDialog.isOpen}
                onClose={handleStatusDialogClose}
                onConfirm={handleStatusDialogConfirm}
                status={statusDialog.status}
                candidateName={statusDialog.candidateName}
            />
        </div>
    );
};

export default RecruiterApplications;