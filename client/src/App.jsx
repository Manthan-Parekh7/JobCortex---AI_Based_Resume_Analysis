import React from 'react';
import { Routes, Route } from 'react-router-dom';

import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import FindJobs from './pages/candidate/FindJobs';
import Dashboard from './components/Dashboard';
import MyApplications from './pages/candidate/MyApplications';
import ViewProfile from './pages/candidate/ViewProfile';
import ResumeAnalysis from './pages/candidate/ResumeAnalysis';

import PostJob from './pages/recruiter/PostJob';
import CompanyProfile from './pages/recruiter/CompanyProfile';
import JobApplications from './pages/recruiter/JobApplications';
import UnifiedRecruiterDashboard from './pages/recruiter/UnifiedRecruiterDashboard';
import RecruiterApplications from './pages/recruiter/RecruiterApplications';
import FindCandidates from './pages/recruiter/FindCandidates';
import RecruiterProfile from './pages/recruiter/RecruiterProfile';

const App = () => {
  return (
    <Routes>
      <Route path='/' element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path='onboarding' element={<Onboarding />} />

        {/* Candidate Protected Routes */}
        <Route element={<ProtectedRoute allowedRoles={['candidate']} />}>
          <Route path='jobs' element={<FindJobs />} />
          <Route path='dashboard' element={<Dashboard />} />
          <Route path='applications' element={<MyApplications />} />
          <Route path='edit-profile' element={<ViewProfile />} />
          <Route path='resume-analysis' element={<ResumeAnalysis />} />
          <Route path='ai-summary' element={<ResumeAnalysis />} />
        </Route>

        {/* Recruiter Protected Routes */}
        <Route element={<ProtectedRoute allowedRoles={['recruiter']} />}>
          <Route path='recruiter' element={<UnifiedRecruiterDashboard />} />
          <Route path='recruiter/post-job' element={<PostJob />} />
          <Route path='recruiter/company-profile' element={<CompanyProfile />} />
          <Route path='recruiter/applications' element={<JobApplications />} />
          <Route path='recruiter/applications/:jobId' element={<RecruiterApplications />} />
          <Route path='recruiter/find-candidates' element={<FindCandidates />} />
          <Route path='recruiter/profile' element={<RecruiterProfile />} />
        </Route>
      </Route>
    </Routes>
  );
};

export default App;
