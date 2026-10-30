import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { FindingDetailPage } from './features/findings/FindingDetailPage'
import { FindingFormPage } from './features/findings/FindingForm'
import { AppLayout } from './features/layout/AppLayout'
import { PlaceholderPage } from './features/layout/PlaceholderPage'
import { ProjectPage } from './features/projects/ProjectPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { TaskFormPage } from './features/tasks/TaskForm'
import { TasksPage } from './features/tasks/TasksPage'

/** Every page. All except /login require a signed-in user. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<PlaceholderPage title="Today" />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectPage />} />
        <Route path="findings/new" element={<FindingFormPage />} />
        <Route path="findings/:id" element={<FindingDetailPage />} />
        <Route path="findings/:id/edit" element={<FindingFormPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/new" element={<TaskFormPage />} />
        <Route path="tasks/:id/edit" element={<TaskFormPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
