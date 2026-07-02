import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';
import FormEditingEnhancer from './components/FormEditingEnhancer.jsx';
import Landing from './pages/public/Landing.jsx';
import Login from './pages/public/Login.jsx';
import Register from './pages/public/Register.jsx';
import DashboardRedirect from './pages/public/DashboardRedirect.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import Chapters from './pages/admin/Chapters.jsx';
import Classes from './pages/admin/Classes.jsx';
import Questions from './pages/admin/Questions.jsx';
import Exams from './pages/admin/Exams.jsx';
import Reports from './pages/admin/Reports.jsx';
import Permissions from './pages/admin/Permissions.jsx';
import UserManagement from './pages/admin/UserManagement.jsx';
import TeacherDashboard from './pages/teacher/TeacherDashboard.jsx';
import TeacherReports from './pages/teacher/TeacherReports.jsx';
import TeacherStudentsList from './pages/teacher/TeacherStudentsList.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import PracticeTest from './pages/student/PracticeTest.jsx';
import PracticeReview from './pages/student/PracticeReview.jsx';
import Instructions from './pages/student/Instructions.jsx';
import AttemptExam from './pages/student/AttemptExam.jsx';
import Result from './pages/student/Result.jsx';
import ChangePassword from './pages/account/ChangePassword.jsx';
import Profile from './pages/account/Profile.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FormEditingEnhancer />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute roles={["main_admin"]}><AppLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="chapters" element={<Chapters />} />
            <Route path="classes" element={<Classes />} />
            <Route path="questions" element={<Questions />} />
            <Route path="exams" element={<Exams />} />
            <Route path="reports" element={<Reports />} />
            <Route path="permissions" element={<Permissions />} />
            <Route path="users" element={<UserManagement />} />
          </Route>

          <Route path="/teacher" element={<ProtectedRoute roles={["teacher"]}><AppLayout /></ProtectedRoute>}>
            <Route index element={<TeacherDashboard />} />
            <Route path="questions" element={<Questions />} />
            <Route path="exams" element={<Exams />} />
            <Route path="students" element={<TeacherStudentsList />} />
            <Route path="reports" element={<TeacherReports />} />
          </Route>

          <Route path="/admin/upload" element={<ProtectedRoute roles={["main_admin"]}><Navigate to="/admin/questions" replace /></ProtectedRoute>} />
          <Route path="/teacher/upload" element={<ProtectedRoute roles={["teacher"]}><Navigate to="/teacher/questions" replace /></ProtectedRoute>} />
          <Route path="/admin/assign-students" element={<ProtectedRoute roles={["main_admin"]}><Navigate to="/admin/users" replace /></ProtectedRoute>} />

          <Route path="/student" element={<ProtectedRoute roles={["student"]}><AppLayout /></ProtectedRoute>}>
            <Route index element={<StudentDashboard />} />
            <Route path="exams" element={<StudentDashboard />} />
            <Route path="attempts" element={<StudentDashboard />} />
            <Route path="results" element={<StudentDashboard />} />
            <Route path="practice" element={<PracticeTest />} />
            <Route path="practice/review/:attemptId" element={<PracticeReview />} />
            <Route path="instructions/:examId" element={<Instructions />} />
            <Route path="attempt/:attemptId" element={<AttemptExam />} />
            <Route path="result/:attemptId" element={<Result />} />
          </Route>

          <Route path="/account" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="profile" element={<Profile />} />
            <Route path="password" element={<ChangePassword />} />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
